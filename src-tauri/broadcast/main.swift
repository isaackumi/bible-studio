import AudioToolbox
import AVFoundation
import CoreMedia
import Foundation
import Network
import ScreenCaptureKit
import VideoToolbox

// Church Studio broadcast: records the audience window (picture and sound) to an .mp4 file and/or
// streams it live over RTMP or RTMPS (YouTube, Facebook, any RTMP service), using the Mac's own
// H.264 and AAC encoders. No other software is needed.
//
// Arguments: --pid <app pid> --title Audience [--fps 30] [--width 1920 --height 1080]
//            [--vbitrate 4500] (kbps) [--abitrate 160] (kbps) [--audio]
//            [--record <file.mp4>] [--rtmp <rtmp(s)://host/app/streamkey>]
//            [--pattern]: colour bars and a beep each second instead of the window (to test).
// Prints one JSON line per event: status, stats, error, end. Closing stdin (or "stop") ends it,
// finishing the recording so the file plays.

private func emit(_ payload: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: payload), let line = String(data: data, encoding: .utf8) else { return }
    FileHandle.standardOutput.write(Data((line + "\n").utf8))
}

private func fail(_ code: String, _ message: String) -> Never {
    emit(["kind": "error", "code": code, "message": message])
    emit(["kind": "end"])
    exit(1)
}

private struct Options {
    var pid: pid_t = 0
    var title = "Audience"
    var fps = 30
    var width = 1920
    var height = 1080
    var videoKbps = 4500
    var audioKbps = 160
    var audio = false
    var record: String?
    var rtmp: String?
    var pattern = false

    init(_ args: [String]) {
        var index = 1
        func next() -> String? {
            index += 1
            return index < args.count ? args[index] : nil
        }
        while index < args.count {
            switch args[index] {
            case "--pid": pid = pid_t(next() ?? "") ?? 0
            case "--title": title = next() ?? title
            case "--fps": fps = max(15, min(60, Int(next() ?? "") ?? fps))
            case "--width": width = max(640, min(3840, Int(next() ?? "") ?? width)) / 2 * 2
            case "--height": height = max(360, min(2160, Int(next() ?? "") ?? height)) / 2 * 2
            case "--vbitrate": videoKbps = max(500, min(20_000, Int(next() ?? "") ?? videoKbps))
            case "--abitrate": audioKbps = max(64, min(320, Int(next() ?? "") ?? audioKbps))
            case "--audio": audio = true
            case "--record": record = next()
            case "--rtmp": rtmp = next()
            case "--pattern": pattern = true
            default: break
            }
            index += 1
        }
    }
}

// MARK: RTMP

/// Big-endian bytes and AMF0 values for RTMP commands.
private struct Bytes {
    var data = Data()
    mutating func u8(_ value: UInt8) { data.append(value) }
    mutating func u16(_ value: Int) { data.append(contentsOf: [UInt8(value >> 8 & 255), UInt8(value & 255)]) }
    mutating func u24(_ value: Int) { data.append(contentsOf: [UInt8(value >> 16 & 255), UInt8(value >> 8 & 255), UInt8(value & 255)]) }
    mutating func u32(_ value: Int) { data.append(contentsOf: [UInt8(value >> 24 & 255), UInt8(value >> 16 & 255), UInt8(value >> 8 & 255), UInt8(value & 255)]) }
    mutating func bytes(_ more: Data) { data.append(more) }

    mutating func amfString(_ text: String) {
        u8(0x02)
        let utf8 = Data(text.utf8)
        u16(utf8.count)
        bytes(utf8)
    }
    mutating func amfNumber(_ number: Double) {
        u8(0x00)
        data.append(contentsOf: withUnsafeBytes(of: number.bitPattern.bigEndian) { Array($0) })
    }
    mutating func amfBool(_ value: Bool) {
        u8(0x01)
        u8(value ? 1 : 0)
    }
    mutating func amfNull() { u8(0x05) }
    mutating func amfObject(_ pairs: [(String, Any)]) {
        u8(0x03)
        for (key, value) in pairs {
            let utf8 = Data(key.utf8)
            u16(utf8.count)
            bytes(utf8)
            switch value {
            case let text as String: amfString(text)
            case let number as Double: amfNumber(number)
            case let number as Int: amfNumber(Double(number))
            case let flag as Bool: amfBool(flag)
            default: amfNull()
            }
        }
        u24(0x000009)
    }
}

/// Publishes one live stream: handshake, connect, createStream, publish, then FLV audio and video.
private final class Rtmp: @unchecked Sendable {
    private let connection: NWConnection
    private let app: String
    private let key: String
    private let tcUrl: String
    private let queue = DispatchQueue(label: "rtmp")
    private var outChunk = 128
    private var inChunk = 128
    private var inbox = Data()
    private var streamId = 1
    private var handshook = false
    private(set) var publishing = false
    var onPublishing: (() -> Void)?
    var onError: ((String) -> Void)?
    private(set) var sentBytes = 0

    /// rtmp(s)://host[:port]/app[/more]/streamkey: the last part is the key, the rest the app.
    static func parse(_ url: String) -> (host: String, port: UInt16, tls: Bool, app: String, key: String, tcUrl: String)? {
        guard let components = URLComponents(string: url), let scheme = components.scheme?.lowercased(), scheme == "rtmp" || scheme == "rtmps", let host = components.host else { return nil }
        var parts = components.percentEncodedPath.split(separator: "/").map(String.init)
        guard parts.count >= 2 else { return nil }
        let key = parts.removeLast() + (components.percentEncodedQuery.map { "?\($0)" } ?? "")
        let app = parts.joined(separator: "/")
        let tls = scheme == "rtmps"
        let port = UInt16(components.port ?? (tls ? 443 : 1935))
        return (host, port, tls, app, key, "\(scheme)://\(host)\(components.port.map { ":\($0)" } ?? "")/\(app)")
    }

    init?(url: String) {
        guard let target = Rtmp.parse(url) else { return nil }
        app = target.app
        key = target.key
        tcUrl = target.tcUrl
        let parameters: NWParameters = target.tls ? NWParameters(tls: NWProtocolTLS.Options()) : .tcp
        if let tcp = parameters.defaultProtocolStack.transportProtocol as? NWProtocolTCP.Options { tcp.noDelay = true }
        connection = NWConnection(host: NWEndpoint.Host(target.host), port: NWEndpoint.Port(rawValue: target.port)!, using: parameters)
    }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready: self.handshake()
            case .failed(let error): self.onError?("The stream server could not be reached. \(error.localizedDescription)")
            case .waiting(let error): self.onError?("Waiting for the stream server: \(error.localizedDescription)")
            default: break
            }
        }
        connection.start(queue: queue)
    }

    private func write(_ data: Data) {
        sentBytes += data.count
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            if let error { self?.onError?("The stream connection dropped. \(error.localizedDescription)") }
        })
    }

    private func handshake() {
        var c1 = Data(count: 1536)
        for i in 8..<1536 { c1[i] = UInt8.random(in: 0...255) }
        write(Data([0x03]) + c1)
        receive(exactly: 1 + 1536 + 1536) { [weak self] reply in
            guard let self else { return }
            self.write(reply.subdata(in: reply.startIndex + 1..<reply.startIndex + 1537)) // C2 echoes S1
            self.handshook = true
            self.setChunkSize(4096)
            self.command(stream: 0, chunkStream: 3, name: "connect", transaction: 1, object: [("app", self.app), ("type", "nonprivate"), ("flashVer", "FMLE/3.0 (compatible; Church Studio)"), ("tcUrl", self.tcUrl)])
            self.listen()
        }
    }

    private func receive(exactly count: Int, _ done: @escaping (Data) -> Void) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, complete, error in
            guard let self else { return }
            if let data { self.inbox.append(data) }
            if self.inbox.count >= count {
                let reply = self.inbox.prefix(count)
                self.inbox.removeFirst(count)
                done(Data(reply))
            } else if error == nil && !complete {
                self.receive(exactly: count, done)
            } else {
                self.onError?("The stream server closed the connection during setup.")
            }
        }
    }

    // Incoming messages: read enough of the chunk stream to follow the server's answers.
    private var partial: [Int: (type: UInt8, length: Int, body: Data, timestamp: Int)] = [:]
    private var lastHeader: [Int: (type: UInt8, length: Int, timestamp: Int)] = [:]

    private func listen() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, complete, error in
            guard let self else { return }
            if let data {
                self.inbox.append(data)
                self.parseInbox()
            }
            if complete || error != nil {
                if self.publishing { self.onError?("The stream server closed the connection.") }
                return
            }
            self.listen()
        }
    }

    private func parseInbox() {
        while true {
            guard let first = inbox.first else { return }
            let format = Int(first >> 6)
            var csid = Int(first & 0x3f)
            var at = 1
            if csid == 0 {
                guard inbox.count > 1 else { return }
                csid = 64 + Int(inbox[inbox.startIndex + 1])
                at = 2
            } else if csid == 1 {
                guard inbox.count > 2 else { return }
                csid = 64 + Int(inbox[inbox.startIndex + 1]) + Int(inbox[inbox.startIndex + 2]) * 256
                at = 3
            }
            let headerSize = [11, 7, 3, 0][format]
            guard inbox.count >= at + headerSize else { return }
            let bytes = [UInt8](inbox.prefix(at + headerSize + 4))
            func u24(_ offset: Int) -> Int { Int(bytes[offset]) << 16 | Int(bytes[offset + 1]) << 8 | Int(bytes[offset + 2]) }
            var header = lastHeader[csid] ?? (type: 0, length: 0, timestamp: 0)
            if format <= 2 { header.timestamp = u24(at) }
            if format <= 1 {
                header.length = u24(at + 3)
                header.type = bytes[at + 6]
            }
            var headerEnd = at + headerSize
            if format <= 2 && u24(at) == 0xFFFFFF {
                guard inbox.count >= headerEnd + 4 else { return }
                headerEnd += 4
            }
            lastHeader[csid] = header
            var message = partial[csid] ?? (type: header.type, length: header.length, body: Data(), timestamp: header.timestamp)
            if message.body.isEmpty { message = (header.type, header.length, Data(), header.timestamp) }
            let take = min(inChunk, message.length - message.body.count)
            guard inbox.count >= headerEnd + take else { return }
            message.body.append(inbox.subdata(in: inbox.startIndex + headerEnd..<inbox.startIndex + headerEnd + take))
            inbox.removeFirst(headerEnd + take)
            if message.body.count >= message.length {
                partial[csid] = nil
                handle(type: message.type, body: message.body)
            } else {
                partial[csid] = message
            }
        }
    }

    private func handle(type: UInt8, body: Data) {
        let bytes = [UInt8](body)
        switch type {
        case 1 where bytes.count >= 4:
            inChunk = Int(bytes[0] & 0x7f) << 24 | Int(bytes[1]) << 16 | Int(bytes[2]) << 8 | Int(bytes[3])
        case 20:
            let values = amfStrings(bytes)
            guard let name = values.first else { return }
            let numbers = amfNumbers(bytes)
            if name == "_result", let transaction = numbers.first {
                // Transaction 4 is createStream: its reply carries the stream id.
                if transaction == 4, numbers.count >= 2, let id = numbers.last { publish(Int(id)) }
            } else if name == "onStatus" {
                if values.contains("NetStream.Publish.Start") {
                    publishing = true
                    onPublishing?()
                } else if let code = values.first(where: { $0.hasPrefix("NetStream.Publish.") || $0.hasPrefix("NetConnection.") }), code.contains("Bad") || code.contains("Fail") || code.contains("Reject") {
                    onError?("The stream server refused the stream (\(code)). Check the stream key.")
                }
            } else if name == "_error" {
                onError?("The stream server refused: \(values.dropFirst().joined(separator: " ")). Check the server address and the stream key.")
            }
            if name == "_result", numbers.first == 1 {
                // Connected: create the stream.
                command(stream: 0, chunkStream: 3, name: "releaseStream", transaction: 2, null: true, extra: key)
                command(stream: 0, chunkStream: 3, name: "FCPublish", transaction: 3, null: true, extra: key)
                command(stream: 0, chunkStream: 3, name: "createStream", transaction: 4, null: true)
            }
        default:
            break
        }
    }

    private func amfStrings(_ bytes: [UInt8]) -> [String] {
        var out: [String] = []
        var i = 0
        while i + 3 <= bytes.count {
            if bytes[i] == 0x02 {
                let length = Int(bytes[i + 1]) << 8 | Int(bytes[i + 2])
                if i + 3 + length <= bytes.count, let text = String(bytes: bytes[(i + 3)..<(i + 3 + length)], encoding: .utf8) {
                    out.append(text)
                    i += 3 + length
                    continue
                }
            }
            i += 1
        }
        return out
    }

    private func amfNumbers(_ bytes: [UInt8]) -> [Double] {
        var out: [Double] = []
        var i = 0
        // Skip the command name, then read numbers that follow a 0x00 marker at value positions.
        if bytes.first == 0x02, bytes.count > 3 { i = 3 + (Int(bytes[1]) << 8 | Int(bytes[2])) }
        while i + 9 <= bytes.count {
            if bytes[i] == 0x00 {
                var raw: UInt64 = 0
                for j in 1...8 { raw = raw << 8 | UInt64(bytes[i + j]) }
                out.append(Double(bitPattern: raw))
                i += 9
            } else if bytes[i] == 0x05 || bytes[i] == 0x06 {
                i += 1
            } else if bytes[i] == 0x03 {
                break
            } else {
                i += 1
            }
        }
        return out
    }

    private func publish(_ id: Int) {
        streamId = id
        command(stream: streamId, chunkStream: 4, name: "publish", transaction: 5, null: true, extra: key, extra2: "live")
    }

    private func setChunkSize(_ size: Int) {
        var body = Bytes()
        body.u32(size)
        sendMessage(chunkStream: 2, type: 1, stream: 0, timestamp: 0, body: body.data)
        outChunk = size
    }

    private func command(stream: Int, chunkStream: Int, name: String, transaction: Double, object: [(String, Any)]? = nil, null: Bool = false, extra: String? = nil, extra2: String? = nil) {
        var body = Bytes()
        body.amfString(name)
        body.amfNumber(transaction)
        if let object { body.amfObject(object) } else if null { body.amfNull() }
        if let extra { body.amfString(extra) }
        if let extra2 { body.amfString(extra2) }
        sendMessage(chunkStream: chunkStream, type: 20, stream: stream, timestamp: 0, body: body.data)
    }

    /// One message, split into chunks: a full header first, then type-3 continuations.
    private func sendMessage(chunkStream: Int, type: UInt8, stream: Int, timestamp: Int, body: Data) {
        var out = Bytes()
        let stamp = min(timestamp, 0xFFFFFE)
        out.u8(UInt8(chunkStream & 0x3f))
        out.u24(stamp)
        out.u24(body.count)
        out.u8(type)
        out.data.append(contentsOf: [UInt8(stream & 255), UInt8(stream >> 8 & 255), UInt8(stream >> 16 & 255), UInt8(stream >> 24 & 255)])
        var offset = 0
        while offset < body.count {
            let size = min(outChunk, body.count - offset)
            if offset > 0 { out.u8(0xC0 | UInt8(chunkStream & 0x3f)) }
            out.bytes(body.subdata(in: offset..<offset + size))
            offset += size
        }
        write(out.data)
    }

    func metadata(width: Int, height: Int, fps: Int, videoKbps: Int, audioKbps: Int, audio: Bool) {
        queue.async { [self] in
            var body = Bytes()
            body.amfString("@setDataFrame")
            body.amfString("onMetaData")
            var pairs: [(String, Any)] = [("width", width), ("height", height), ("framerate", fps), ("videocodecid", 7), ("videodatarate", videoKbps)]
            if audio { pairs += [("audiocodecid", 10), ("audiodatarate", audioKbps), ("audiosamplerate", 48_000), ("audiosamplesize", 16), ("stereo", true)] }
            pairs.append(("encoder", "Church Studio"))
            body.amfObject(pairs)
            sendMessage(chunkStream: 4, type: 18, stream: streamId, timestamp: 0, body: body.data)
        }
    }

    func video(_ tag: Data, timestamp: Int) {
        queue.async { [self] in
            guard publishing else { return }
            sendMessage(chunkStream: 6, type: 9, stream: streamId, timestamp: timestamp, body: tag)
        }
    }

    func audio(_ tag: Data, timestamp: Int) {
        queue.async { [self] in
            guard publishing else { return }
            sendMessage(chunkStream: 5, type: 8, stream: streamId, timestamp: timestamp, body: tag)
        }
    }

    func stop() {
        queue.sync {
            if publishing {
                command(stream: streamId, chunkStream: 3, name: "FCUnpublish", transaction: 6, null: true, extra: key)
                command(stream: streamId, chunkStream: 3, name: "deleteStream", transaction: 7, null: true)
            }
            publishing = false
        }
        Thread.sleep(forTimeInterval: 0.2)
        connection.cancel()
    }
}

// MARK: Encoders for the stream

/// H.264 for RTMP: hardware encoding, a keyframe every two seconds, no B-frames.
private final class VideoEncoder {
    private var session: VTCompressionSession?
    var onTag: ((Data, Int) -> Void)?
    private var sentHeader = false
    private let start: CMTime

    init?(width: Int, height: Int, fps: Int, kbps: Int, start: CMTime) {
        self.start = start
        var made: VTCompressionSession?
        let status = VTCompressionSessionCreate(allocator: nil, width: Int32(width), height: Int32(height), codecType: kCMVideoCodecType_H264, encoderSpecification: nil, imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: nil, refcon: nil, compressionSessionOut: &made)
        guard status == noErr, let made else { return nil }
        session = made
        let set = { (key: CFString, value: CFTypeRef) in VTSessionSetProperty(made, key: key, value: value) }
        _ = set(kVTCompressionPropertyKey_RealTime, kCFBooleanTrue)
        _ = set(kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_High_AutoLevel)
        _ = set(kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse)
        _ = set(kVTCompressionPropertyKey_AverageBitRate, NSNumber(value: kbps * 1000))
        _ = set(kVTCompressionPropertyKey_DataRateLimits, [NSNumber(value: kbps * 1000 * 3 / 2 / 8), NSNumber(value: 1)] as CFArray)
        _ = set(kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, NSNumber(value: 2))
        _ = set(kVTCompressionPropertyKey_MaxKeyFrameInterval, NSNumber(value: fps * 2))
        _ = set(kVTCompressionPropertyKey_ExpectedFrameRate, NSNumber(value: fps))
        VTCompressionSessionPrepareToEncodeFrames(made)
    }

    func encode(_ buffer: CVPixelBuffer, at time: CMTime) {
        guard let session else { return }
        VTCompressionSessionEncodeFrame(session, imageBuffer: buffer, presentationTimeStamp: time, duration: .invalid, frameProperties: nil, infoFlagsOut: nil) { [weak self] status, _, sample in
            guard status == noErr, let sample, let self else { return }
            self.packet(sample)
        }
    }

    private func packet(_ sample: CMSampleBuffer) {
        guard let format = CMSampleBufferGetFormatDescription(sample), let block = CMSampleBufferGetDataBuffer(sample) else { return }
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[CFString: Any]]
        let keyframe = !(attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
        let ms = max(0, Int((CMSampleBufferGetPresentationTimeStamp(sample) - start).seconds * 1000))
        if keyframe && !sentHeader, let config = avcConfig(format) {
            onTag?(Data([0x17, 0x00, 0, 0, 0]) + config, ms)
            sentHeader = true
        }
        guard sentHeader else { return }
        var length = 0
        var pointer: UnsafeMutablePointer<CChar>?
        guard CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &pointer) == noErr, let pointer else { return }
        let nalus = Data(bytes: pointer, count: length) // already AVCC (4-byte lengths)
        onTag?(Data([keyframe ? 0x17 : 0x27, 0x01, 0, 0, 0]) + nalus, ms)
    }

    /// AVCDecoderConfigurationRecord from the encoder's SPS and PPS.
    private func avcConfig(_ format: CMFormatDescription) -> Data? {
        var spsPointer: UnsafePointer<UInt8>?
        var spsSize = 0
        var ppsPointer: UnsafePointer<UInt8>?
        var ppsSize = 0
        guard CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, parameterSetIndex: 0, parameterSetPointerOut: &spsPointer, parameterSetSizeOut: &spsSize, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr,
              CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, parameterSetIndex: 1, parameterSetPointerOut: &ppsPointer, parameterSetSizeOut: &ppsSize, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr,
              let sps = spsPointer, let pps = ppsPointer, spsSize > 3 else { return nil }
        var out = Bytes()
        out.u8(1)
        out.u8(sps[1])
        out.u8(sps[2])
        out.u8(sps[3])
        out.u8(0xFF) // 4-byte NAL lengths
        out.u8(0xE1) // one SPS
        out.u16(spsSize)
        out.bytes(Data(bytes: sps, count: spsSize))
        out.u8(1)
        out.u16(ppsSize)
        out.bytes(Data(bytes: pps, count: ppsSize))
        return out.data
    }

    func finish() {
        if let session {
            VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
            VTCompressionSessionInvalidate(session)
        }
        session = nil
    }
}

/// AAC-LC at 48 kHz stereo for RTMP, from interleaved float samples.
private final class AudioEncoder {
    private var converter: AudioConverterRef?
    private var pending: [Float] = []
    private var sentFrames = 0
    var onTag: ((Data, Int) -> Void)?
    private var sentHeader = false

    init?(kbps: Int) {
        var input = AudioStreamBasicDescription(mSampleRate: 48_000, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked, mBytesPerPacket: 8, mFramesPerPacket: 1, mBytesPerFrame: 8, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
        var output = AudioStreamBasicDescription(mSampleRate: 48_000, mFormatID: kAudioFormatMPEG4AAC, mFormatFlags: 0, mBytesPerPacket: 0, mFramesPerPacket: 1024, mBytesPerFrame: 0, mChannelsPerFrame: 2, mBitsPerChannel: 0, mReserved: 0)
        var made: AudioConverterRef?
        guard AudioConverterNew(&input, &output, &made) == noErr, let made else { return nil }
        var rate = UInt32(kbps * 1000)
        AudioConverterSetProperty(made, kAudioConverterEncodeBitRate, UInt32(MemoryLayout<UInt32>.size), &rate)
        converter = made
    }

    /// Where the first packet sits on the stream's clock (ms), so sound and picture line up.
    private var baseMs: Int?

    /// Add samples (interleaved stereo); each full 1024-frame packet goes out as an AAC tag.
    func add(_ samples: [Float], atMs nowMs: Int) {
        if baseMs == nil { baseMs = nowMs }
        if !sentHeader {
            // AudioSpecificConfig: AAC-LC (2), 48 kHz (index 3), stereo (2).
            onTag?(Data([0xAF, 0x00, 0x11, 0x90]), 0)
            sentHeader = true
        }
        pending += samples
        while pending.count >= 2048 {
            let packet = Array(pending.prefix(2048))
            pending.removeFirst(2048)
            encode(packet)
        }
    }

    /// One packet of input for the converter, in memory it owns until the packet is encoded.
    private final class Feed {
        let samples: UnsafeMutablePointer<Float>
        let count: Int
        var used = false
        init(_ packet: [Float]) {
            count = packet.count
            samples = .allocate(capacity: packet.count)
            samples.initialize(from: packet, count: packet.count)
        }
        deinit { samples.deallocate() }
    }

    private func encode(_ packet: [Float]) {
        guard let converter else { return }
        let feed = Feed(packet)
        let out = UnsafeMutablePointer<UInt8>.allocate(capacity: 4096)
        defer { out.deallocate() }
        var size = UInt32(1)
        var description = AudioStreamPacketDescription()
        var list = AudioBufferList(mNumberBuffers: 1, mBuffers: AudioBuffer(mNumberChannels: 2, mDataByteSize: 4096, mData: out))
        _ = AudioConverterFillComplexBuffer(converter, { _, packets, data, _, user in
            let feed = Unmanaged<Feed>.fromOpaque(user!).takeUnretainedValue()
            if feed.used {
                packets.pointee = 0
                return 1 // no more input for this packet
            }
            feed.used = true
            data.pointee.mNumberBuffers = 1
            data.pointee.mBuffers.mData = UnsafeMutableRawPointer(feed.samples)
            data.pointee.mBuffers.mDataByteSize = UInt32(feed.count * 4)
            data.pointee.mBuffers.mNumberChannels = 2
            packets.pointee = UInt32(feed.count / 2)
            return noErr
        }, Unmanaged.passUnretained(feed).toOpaque(), &size, &list, &description)
        let bytes = Int(list.mBuffers.mDataByteSize)
        guard size > 0, bytes > 0 else { return }
        let ms = (baseMs ?? 0) + sentFrames * 1000 / 48_000
        sentFrames += 1024
        onTag?(Data([0xAF, 0x01]) + Data(bytes: out, count: bytes), ms)
    }

    func finish() {
        if let converter { AudioConverterDispose(converter) }
        converter = nil
    }
}

// MARK: Broadcast

@available(macOS 13.0, *)
private final class Broadcast: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private let options: Options
    private var stream: SCStream?
    private let videoQueue = DispatchQueue(label: "broadcast.video")
    private let audioQueue = DispatchQueue(label: "broadcast.audio")
    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    private var timer: DispatchSourceTimer?
    private var toneTimer: DispatchSourceTimer?
    private var statsTimer: DispatchSourceTimer?
    private let clock = CMClockGetHostTimeClock()
    private var start = CMTime.invalid
    private var frames = 0

    // Recording
    private var writer: AVAssetWriter?
    private var writerVideo: AVAssetWriterInput?
    private var writerAudio: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var recordPath: String?

    // Streaming
    private var rtmp: Rtmp?
    private var videoEncoder: VideoEncoder?
    private var audioEncoder: AudioEncoder?
    private var live = false

    init(options: Options) {
        self.options = options
    }

    func run() async {
        start = CMClockGetTime(clock)
        if let path = options.record { startRecording(path) }
        if let url = options.rtmp { startStream(url) }
        guard writer != nil || rtmp != nil else { fail("nothing", "Nothing to do: give --record or --rtmp.") }

        if options.pattern {
            latest = makePattern()
            if options.audio { startTone() }
        } else {
            await capture()
        }
        startFrames()
        startStats()
        emit(["kind": "status", "recording": writer != nil, "streaming": rtmp != nil, "message": options.pattern ? "Test pattern" : "Audience window"])
    }

    private func capture() async {
        let window: SCWindow
        do {
            window = try await findWindow()
        } catch let error as BroadcastError {
            fail(error.code, error.message)
        } catch {
            fail("permission", "macOS needs permission to capture the audience window: System Settings › Privacy & Security › Screen & System Audio Recording › Church Studio. \(error.localizedDescription)")
        }
        let config = SCStreamConfiguration()
        config.width = options.width
        config.height = options.height
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
        config.queueDepth = 5
        config.showsCursor = false
        if options.audio {
            config.capturesAudio = true
            config.sampleRate = 48_000
            config.channelCount = 2
            config.excludesCurrentProcessAudio = true
        }
        let stream = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: config, delegate: self)
        do {
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: videoQueue)
            if options.audio { try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: audioQueue) }
            try await stream.startCapture()
        } catch {
            fail("capture", "The audience window could not be captured. \(error.localizedDescription)")
        }
        self.stream = stream
    }

    private struct BroadcastError: Error {
        let code: String
        let message: String
    }

    /// The audience window, once it is on a screen. ScreenCaptureKit aborts the whole helper (an
    /// assertion in SkyLight, not an error to catch) when given a window that is on no display, as
    /// one is while it is still being opened or placed: so only a window that is on screen, has a
    /// size and lies on a connected display is taken, the largest if there are several.
    private func findWindow() async throws -> SCWindow {
        var sawOffscreen = false
        for attempt in 0..<20 {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
            let ours = content.windows.filter { $0.owningApplication?.processID == options.pid && ($0.title ?? "") == options.title }
            let placed = ours.filter { window in
                window.isOnScreen && window.frame.width >= 2 && window.frame.height >= 2 && content.displays.contains { $0.frame.intersects(window.frame) }
            }
            if let window = placed.max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) { return window }
            if !ours.isEmpty { sawOffscreen = true }
            if attempt < 19 { try await Task.sleep(nanoseconds: 300_000_000) }
        }
        if sawOffscreen {
            throw BroadcastError(code: "no-window", message: "The audience window is open but not on a screen. Show it on its screen, then start again.")
        }
        throw BroadcastError(code: "no-window", message: "The audience window is not open. Open output, then start again.")
    }

    private func startRecording(_ path: String) {
        let url = URL(fileURLWithPath: path)
        try? FileManager.default.removeItem(at: url)
        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { fail("record", "The recording file could not be made at \(path).") }
        let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: options.width,
            AVVideoHeightKey: options.height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: options.videoKbps * 1000 * 2, AVVideoMaxKeyFrameIntervalDurationKey: 2, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
        ])
        video.expectsMediaDataInRealTime = true
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
        writer.add(video)
        if options.audio {
            let audio = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 48_000, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: options.audioKbps * 1000])
            audio.expectsMediaDataInRealTime = true
            writer.add(audio)
            writerAudio = audio
        }
        guard writer.startWriting() else { fail("record", "The recording could not start. \(writer.error?.localizedDescription ?? "")") }
        writer.startSession(atSourceTime: start)
        self.writer = writer
        writerVideo = video
        self.adaptor = adaptor
        recordPath = path
    }

    private func startStream(_ url: String) {
        guard let rtmp = Rtmp(url: url) else { fail("rtmp-url", "That stream address does not look right. It starts with rtmp:// or rtmps:// and ends with the stream key.") }
        guard let video = VideoEncoder(width: options.width, height: options.height, fps: options.fps, kbps: options.videoKbps, start: start) else { fail("encoder", "This Mac could not start the video encoder.") }
        video.onTag = { [weak rtmp] tag, ms in rtmp?.video(tag, timestamp: ms) }
        videoEncoder = video
        if options.audio, let audio = AudioEncoder(kbps: options.audioKbps) {
            audio.onTag = { [weak rtmp] tag, ms in rtmp?.audio(tag, timestamp: ms) }
            audioEncoder = audio
        }
        rtmp.onPublishing = { [weak self] in
            guard let self else { return }
            self.live = true
            rtmp.metadata(width: self.options.width, height: self.options.height, fps: self.options.fps, videoKbps: self.options.videoKbps, audioKbps: self.options.audioKbps, audio: self.audioEncoder != nil)
            emit(["kind": "live", "message": "Live on the stream server."])
        }
        rtmp.onError = { message in emit(["kind": "error", "code": "rtmp", "message": message]) }
        rtmp.start()
        self.rtmp = rtmp
    }

    /// Every frame interval: the newest picture (or the last one again) to the file and the stream.
    private func startFrames() {
        let timer = DispatchSource.makeTimerSource(queue: videoQueue)
        timer.schedule(deadline: .now(), repeating: .nanoseconds(1_000_000_000 / options.fps))
        timer.setEventHandler { [weak self] in self?.frame() }
        timer.resume()
        self.timer = timer
    }

    private func frame() {
        lock.lock()
        let buffer = latest
        lock.unlock()
        guard let buffer else { return }
        let now = CMClockGetTime(clock)
        if let adaptor, let video = writerVideo, video.isReadyForMoreMediaData, writer?.status == .writing {
            adaptor.append(buffer, withPresentationTime: now)
        }
        if live { videoEncoder?.encode(buffer, at: now) }
        frames += 1
    }

    private func startStats() {
        let stats = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
        stats.schedule(deadline: .now() + 1, repeating: 2)
        stats.setEventHandler { [weak self] in
            guard let self else { return }
            let seconds = (CMClockGetTime(self.clock) - self.start).seconds
            var payload: [String: Any] = ["kind": "stats", "seconds": Int(seconds), "frames": self.frames, "live": self.live]
            if let rtmp = self.rtmp { payload["kbps"] = seconds > 0 ? Int(Double(rtmp.sentBytes) * 8 / 1000 / seconds) : 0 }
            if let path = self.recordPath, let size = (try? FileManager.default.attributesOfItem(atPath: path))?[.size] as? Int { payload["bytes"] = size }
            emit(payload)
        }
        stats.resume()
        statsTimer = stats
    }

    // Sound: the window's own, or the test beep.
    private func sound(_ samples: [Float], at time: CMTime) {
        if live, let encoder = audioEncoder { encoder.add(samples, atMs: max(0, Int((time - start).seconds * 1000))) }
        guard let input = writerAudio, input.isReadyForMoreMediaData, writer?.status == .writing else { return }
        let frames = samples.count / 2
        var format: CMAudioFormatDescription?
        var description = AudioStreamBasicDescription(mSampleRate: 48_000, mFormatID: kAudioFormatLinearPCM, mFormatFlags: kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked, mBytesPerPacket: 8, mFramesPerPacket: 1, mBytesPerFrame: 8, mChannelsPerFrame: 2, mBitsPerChannel: 32, mReserved: 0)
        CMAudioFormatDescriptionCreate(allocator: nil, asbd: &description, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &format)
        guard let format else { return }
        var block: CMBlockBuffer?
        let bytes = samples.count * 4
        CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: bytes, blockAllocator: nil, customBlockSource: nil, offsetToData: 0, dataLength: bytes, flags: 0, blockBufferOut: &block)
        guard let block else { return }
        samples.withUnsafeBytes { raw in _ = CMBlockBufferReplaceDataBytes(with: raw.baseAddress!, blockBuffer: block, offsetIntoDestination: 0, dataLength: bytes) }
        var sample: CMSampleBuffer?
        CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: nil, dataBuffer: block, formatDescription: format, sampleCount: frames, presentationTimeStamp: time, packetDescriptions: nil, sampleBufferOut: &sample)
        if let sample { input.append(sample) }
    }

    private var tonePhase: Double = 0
    private var toneClock = 0

    private func startTone() {
        let timer = DispatchSource.makeTimerSource(queue: audioQueue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(20))
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            var samples = [Float](repeating: 0, count: 960 * 2)
            let audible = self.toneClock % 50 < 10
            for i in 0..<960 {
                let value = audible ? Float(sin(self.tonePhase) * 0.25) : 0
                self.tonePhase += 2 * Double.pi * 1000 / 48_000
                samples[i * 2] = value
                samples[i * 2 + 1] = value
            }
            self.toneClock += 1
            self.sound(samples, at: CMClockGetTime(self.clock))
        }
        timer.resume()
        toneTimer = timer
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard sampleBuffer.isValid else { return }
        if type == .audio {
            if let samples = interleaved(sampleBuffer) { sound(samples, at: CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) }
            return
        }
        guard type == .screen, let buffer = sampleBuffer.imageBuffer else { return }
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
           let raw = attachments.first?[.status] as? Int, let status = SCFrameStatus(rawValue: raw), status != .complete {
            return
        }
        lock.lock()
        latest = buffer
        lock.unlock()
    }

    /// ScreenCaptureKit's float audio as interleaved stereo.
    private func interleaved(_ sampleBuffer: CMSampleBuffer) -> [Float]? {
        guard let format = CMSampleBufferGetFormatDescription(sampleBuffer),
              let description = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
              description.mFormatFlags & kAudioFormatFlagIsFloat != 0, description.mBitsPerChannel == 32 else { return nil }
        let frames = CMSampleBufferGetNumSamples(sampleBuffer)
        let channels = Int(description.mChannelsPerFrame)
        guard frames > 0, channels > 0 else { return nil }
        var needed = 0
        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sampleBuffer, bufferListSizeNeededOut: &needed, bufferListOut: nil, bufferListSize: 0, blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, blockBufferOut: nil)
        let raw = UnsafeMutableRawPointer.allocate(byteCount: max(needed, MemoryLayout<AudioBufferList>.size), alignment: 16)
        defer { raw.deallocate() }
        let list = raw.bindMemory(to: AudioBufferList.self, capacity: 1)
        var block: CMBlockBuffer?
        guard CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sampleBuffer, bufferListSizeNeededOut: nil, bufferListOut: list, bufferListSize: needed, blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, blockBufferOut: &block) == noErr else { return nil }
        let buffers = UnsafeMutableAudioBufferListPointer(list)
        var out = [Float](repeating: 0, count: frames * 2)
        let planar = description.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0
        for i in 0..<frames {
            for channel in 0..<2 {
                let source = min(channel, channels - 1)
                if planar {
                    guard source < buffers.count, let data = buffers[source].mData?.assumingMemoryBound(to: Float.self) else { continue }
                    out[i * 2 + channel] = data[i]
                } else if let data = buffers.first?.mData?.assumingMemoryBound(to: Float.self) {
                    out[i * 2 + channel] = data[i * channels + source]
                }
            }
        }
        return out
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emit(["kind": "error", "code": "stopped", "message": "The audience window closed or capture stopped. \(error.localizedDescription)"])
        stop(code: 1)
    }

    /// Colour bars, as the NDI test pattern, so a receiver or a stream page shows something clear.
    private func makePattern() -> CVPixelBuffer? {
        var buffer: CVPixelBuffer?
        CVPixelBufferCreate(nil, options.width, options.height, kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &buffer)
        guard let buffer else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(buffer)?.assumingMemoryBound(to: UInt8.self) else { return nil }
        let stride = CVPixelBufferGetBytesPerRow(buffer)
        let bars: [(UInt8, UInt8, UInt8)] = [(235, 235, 235), (16, 235, 235), (235, 235, 16), (16, 235, 16), (235, 16, 235), (16, 16, 235), (235, 16, 16)]
        for y in 0..<options.height {
            let row = base + y * stride
            for x in 0..<options.width {
                let bar = bars[min(bars.count - 1, x * bars.count / options.width)]
                let low = y > options.height * 3 / 4
                let pixel = row + x * 4
                pixel[0] = low ? 40 : bar.0
                pixel[1] = low ? 40 : bar.1
                pixel[2] = low ? 40 : bar.2
                pixel[3] = 255
            }
        }
        return buffer
    }

    func stop(code: Int32 = 0) {
        timer?.cancel()
        toneTimer?.cancel()
        statsTimer?.cancel()
        let finished = DispatchSemaphore(value: 0)
        if let stream {
            Task {
                try? await stream.stopCapture()
                finished.signal()
            }
            _ = finished.wait(timeout: .now() + 2)
        }
        videoEncoder?.finish()
        audioEncoder?.finish()
        rtmp?.stop()
        if let writer, writer.status == .writing {
            writerVideo?.markAsFinished()
            writerAudio?.markAsFinished()
            let done = DispatchSemaphore(value: 0)
            writer.finishWriting { done.signal() }
            _ = done.wait(timeout: .now() + 10)
            if let path = recordPath { emit(["kind": "saved", "path": path]) }
        }
        emit(["kind": "end"])
        exit(code)
    }
}

private var retained: AnyObject?

@main
private struct Main {
    static func main() {
        let options = Options(CommandLine.arguments)
        guard #available(macOS 13.0, *) else { fail("macos", "Streaming and recording need macOS 13 or later.") }
        let broadcast = Broadcast(options: options)
        retained = broadcast
        Thread {
            while let line = readLine() {
                if line.trimmingCharacters(in: .whitespaces) == "stop" { break }
            }
            broadcast.stop()
        }.start()
        Task { await broadcast.run() }
        dispatchMain()
    }
}

import AVFoundation
import CoreMedia
import CoreText
import Foundation
import ImageIO
import Network
import ScreenCaptureKit
import UniformTypeIdentifiers

// Church Studio NDI sender: watches the audience window with ScreenCaptureKit and sends what it
// shows as an NDI source, so OBS, vMix, a streaming computer or an NDI monitor can take Program.
// The NDI library is loaded at run time; without it this says so and exits.
//
// Arguments: --pid <app pid> --title <window title> --name <NDI source name> [--fps 30]
//            [--width 1920 --height 1080]
//            --key: send only the words, as a lower third on a transparent picture, for keying
//            over cameras. The app writes the words as JSON lines on stdin: {"cue","body"}.
// Prints one JSON line per event: status, stats (connections), error. Closing stdin stops it.

private func emit(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

private func fail(_ code: String, _ message: String) -> Never {
    emit(["kind": "error", "code": code, "message": message])
    exit(1)
}

private struct Options {
    var pid: pid_t = 0
    var title = "Audience"
    var name = "Church Studio"
    var fps = 30
    var width = 1920
    var height = 1080
    /** Send colour bars instead of the audience window (find the source in OBS before a service). */
    var pattern = false
    /** Key: draw the words the app sends on a transparent picture instead of capturing a window. */
    var key = false
    /** Hub: receive NDI sources and serve them to the app's screens on this computer only. */
    var hub = false
    var port: UInt16 = 47129

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
            case "--name": name = next() ?? name
            case "--fps": fps = max(10, min(60, Int(next() ?? "") ?? fps))
            case "--width": width = max(320, min(3840, Int(next() ?? "") ?? width))
            case "--height": height = max(180, min(2160, Int(next() ?? "") ?? height))
            case "--pattern": pattern = true
            case "--key": key = true
            case "--hub": hub = true
            case "--port": port = UInt16(next() ?? "") ?? port
            default: break
            }
            index += 1
        }
    }
}

/// The NDI library's send functions, found with dlopen/dlsym.
private struct NDI {
    let handle: UnsafeMutableRawPointer
    let destroy: NDIlib_destroy_fn
    let sendCreate: NDIlib_send_create_fn
    let sendDestroy: NDIlib_send_destroy_fn
    let sendVideo: NDIlib_send_send_video_v2_fn
    let connections: NDIlib_send_get_no_connections_fn
    let version: String

    func symbol<T>(_ name: String, _ type: T.Type) -> T? {
        guard let pointer = dlsym(handle, name) else { return nil }
        return unsafeBitCast(pointer, to: type)
    }

    static func load() -> NDI? {
        var candidates: [String] = []
        let env = ProcessInfo.processInfo.environment
        for key in ["NDI_RUNTIME_DIR_V6", "NDI_RUNTIME_DIR_V5"] {
            if let dir = env[key] { candidates.append("\(dir)/libndi.dylib") }
        }
        // Next to this helper (a bundled runtime), then the standard installs.
        let here = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent()
        candidates += [
            here.appendingPathComponent("libndi.dylib").path,
            here.appendingPathComponent("../Frameworks/libndi.dylib").path,
            "/usr/local/lib/libndi.dylib",
            "/Library/NDI SDK for Apple/lib/macOS/libndi.dylib",
            "/Library/NDI SDK for Apple/lib/macOS/libndi_advanced.dylib",
            "/Applications/NDI Video Monitor.app/Contents/Frameworks/libndi.dylib",
        ]
        guard let handle = candidates.lazy.compactMap({ dlopen($0, RTLD_NOW | RTLD_LOCAL) }).first else { return nil }
        func symbol<T>(_ name: String, _ type: T.Type) -> T? {
            guard let pointer = dlsym(handle, name) else { return nil }
            return unsafeBitCast(pointer, to: type)
        }
        guard let initialize = symbol("NDIlib_initialize", NDIlib_initialize_fn.self),
              let destroy = symbol("NDIlib_destroy", NDIlib_destroy_fn.self),
              let sendCreate = symbol("NDIlib_send_create", NDIlib_send_create_fn.self),
              let sendDestroy = symbol("NDIlib_send_destroy", NDIlib_send_destroy_fn.self),
              let sendVideo = symbol("NDIlib_send_send_video_v2", NDIlib_send_send_video_v2_fn.self),
              let connections = symbol("NDIlib_send_get_no_connections", NDIlib_send_get_no_connections_fn.self)
        else { return nil }
        guard initialize() else { return nil }
        let version = symbol("NDIlib_version", NDIlib_version_fn.self).flatMap { fn in fn().map { String(cString: $0) } } ?? "NDI"
        return NDI(handle: handle, destroy: destroy, sendCreate: sendCreate, sendDestroy: sendDestroy, sendVideo: sendVideo, connections: connections, version: version)
    }
}

@available(macOS 12.3, *)
private final class Sender: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private let options: Options
    private let ndi: NDI
    private var instance: UnsafeMutableRawPointer?
    private var stream: SCStream?
    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    private var sent = 0
    private let queue = DispatchQueue(label: "ndi.frames")
    private var timer: DispatchSourceTimer?

    init(options: Options, ndi: NDI) {
        self.options = options
        self.ndi = ndi
    }

    func run() async {
        instance = options.name.withCString { name in
            var settings = NDIlib_send_create_t(p_ndi_name: name, p_groups: nil, clock_video: false, clock_audio: false)
            return ndi.sendCreate(&settings)
        }
        guard instance != nil else { fail("send", "NDI could not start a sender.") }

        if options.key {
            // Words may already have arrived on stdin; start clear only if not.
            if !hasPicture() { setWords(nil) }
            startSending()
            emit(["kind": "status", "message": "Sending the words as “\(options.name)” on a transparent picture (\(ndi.version)).", "name": options.name])
            return
        }

        if options.pattern {
            latest = makePattern()
            startSending()
            emit(["kind": "status", "message": "Sending a test pattern as “\(options.name)” (\(ndi.version)).", "name": options.name])
            return
        }

        let window: SCWindow
        do {
            window = try await findWindow()
        } catch let error as SenderError {
            fail(error.code, error.message)
        } catch {
            fail("permission", "macOS needs permission to capture the audience window: System Settings › Privacy & Security › Screen & System Audio Recording › Church Studio. \(error.localizedDescription)")
        }

        let config = SCStreamConfiguration()
        config.width = options.width
        config.height = options.height
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(options.fps))
        config.queueDepth = 4
        config.showsCursor = false
        if #available(macOS 14.0, *) {
            config.ignoreShadowsSingleWindow = true
        }
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        do {
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
            try await stream.startCapture()
        } catch {
            fail("capture", "The audience window could not be captured. \(error.localizedDescription)")
        }
        self.stream = stream
        startSending()
        emit(["kind": "status", "message": "Sending “\(options.name)” on the network (\(ndi.version)).", "name": options.name])
    }

    private struct SenderError: Error {
        let code: String
        let message: String
    }

    /// The audience window of this app, waiting a moment for it to open.
    private func findWindow() async throws -> SCWindow {
        for attempt in 0..<10 {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
            if let match = content.windows.first(where: { $0.owningApplication?.processID == options.pid && $0.title == options.title }) {
                return match
            }
            if attempt < 9 { try await Task.sleep(nanoseconds: 500_000_000) }
        }
        throw SenderError(code: "no-window", message: "Open the audience window first; NDI sends what it shows.")
    }

    // Frames arrive only when the picture changes; NDI receivers want a steady stream, so a timer
    // sends the latest picture at the chosen rate.
    private func startSending() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .nanoseconds(1_000_000_000 / options.fps))
        timer.setEventHandler { [weak self] in self?.sendLatest() }
        timer.resume()
        self.timer = timer
        let stats = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
        stats.schedule(deadline: .now() + 1, repeating: 2)
        stats.setEventHandler { [weak self] in
            guard let self, let instance = self.instance else { return }
            let viewers = Int(self.ndi.connections(instance, 0))
            emit(["kind": "stats", "connections": viewers, "frames": self.sent])
        }
        stats.resume()
        statsTimer = stats
    }

    private var statsTimer: DispatchSourceTimer?

    /// Colour bars with the source name's place marked: easy to recognise in a receiver.
    private func makePattern() -> CVPixelBuffer? {
        var buffer: CVPixelBuffer?
        CVPixelBufferCreate(nil, options.width, options.height, kCVPixelFormatType_32BGRA, nil, &buffer)
        guard let buffer else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(buffer)?.assumingMemoryBound(to: UInt8.self) else { return nil }
        let stride = CVPixelBufferGetBytesPerRow(buffer)
        // White, yellow, cyan, green, magenta, red, blue (B, G, R).
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

    private func hasPicture() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return latest != nil
    }

    /// Draw the words as a lower third on a transparent picture; nil or empty clears it.
    func setWords(_ words: [String: Any]?) {
        let cue = (words?["cue"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let body = (words?["body"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let buffer = renderKey(cue: cue, body: body)
        lock.lock()
        latest = buffer
        lock.unlock()
    }

    private func renderKey(cue: String, body: String) -> CVPixelBuffer? {
        let width = options.width, height = options.height
        var buffer: CVPixelBuffer?
        CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, nil, &buffer)
        guard let buffer else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
        let stride = CVPixelBufferGetBytesPerRow(buffer)
        memset(base, 0, stride * height)
        if cue.isEmpty && body.isEmpty { return buffer }

        let info = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
        guard let context = CGContext(data: base, width: width, height: height, bitsPerComponent: 8, bytesPerRow: stride,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: info) else { return buffer }
        let h = CGFloat(height), w = CGFloat(width)
        let margin = w * 0.05
        let pad = h * 0.03
        let textWidth = w - margin * 2 - pad * 2

        func text(_ string: String, size: CGFloat, weight: CGFloat, alpha: CGFloat) -> NSAttributedString {
            let traits = [kCTFontWeightTrait: weight] as CFDictionary
            let descriptor = CTFontDescriptorCreateWithAttributes([kCTFontFamilyNameAttribute: "Helvetica Neue", kCTFontTraitsAttribute: traits] as CFDictionary)
            let font = CTFontCreateWithFontDescriptor(descriptor, size, nil)
            let style = [CTParagraphStyleSetting]()
            return NSAttributedString(string: string, attributes: [
                NSAttributedString.Key(kCTFontAttributeName as String): font,
                NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(red: 1, green: 1, blue: 1, alpha: alpha),
                NSAttributedString.Key(kCTParagraphStyleAttributeName as String): CTParagraphStyleCreate(style, 0),
            ])
        }
        func measure(_ string: NSAttributedString) -> CGFloat {
            let setter = CTFramesetterCreateWithAttributedString(string)
            return CTFramesetterSuggestFrameSizeWithConstraints(setter, CFRange(location: 0, length: 0), nil, CGSize(width: textWidth, height: .greatestFiniteMagnitude), nil).height.rounded(.up)
        }

        // The words shrink until the bar fits in the lower 40% of the picture.
        var size = h * 0.05
        var bodyText = text(body, size: size, weight: 0.0, alpha: 1)
        while !body.isEmpty && measure(bodyText) > h * 0.4 - pad * 2 - h * 0.05 && size > h * 0.022 {
            size *= 0.92
            bodyText = text(body, size: size, weight: 0.0, alpha: 1)
        }
        let cueText = text(cue, size: max(h * 0.024, size * 0.62), weight: 0.3, alpha: 0.82)
        let cueHeight = cue.isEmpty ? 0 : measure(cueText)
        let bodyHeight = body.isEmpty ? 0 : min(measure(bodyText), h * 0.4)
        let gap = !cue.isEmpty && !body.isEmpty ? h * 0.012 : 0
        let barHeight = cueHeight + gap + bodyHeight + pad * 2
        let bar = CGRect(x: margin, y: h * 0.06, width: w - margin * 2, height: barHeight)

        context.setFillColor(CGColor(red: 0.04, green: 0.06, blue: 0.1, alpha: 0.78))
        context.addPath(CGPath(roundedRect: bar, cornerWidth: h * 0.012, cornerHeight: h * 0.012, transform: nil))
        context.fillPath()
        context.saveGState()
        context.addPath(CGPath(roundedRect: bar, cornerWidth: h * 0.012, cornerHeight: h * 0.012, transform: nil))
        context.clip()
        context.setFillColor(CGColor(red: 0.95, green: 0.75, blue: 0.3, alpha: 1))
        context.fill(CGRect(x: bar.minX, y: bar.minY, width: h * 0.006, height: bar.height))
        context.restoreGState()

        // CoreGraphics draws from the bottom up: the body sits lowest, the reference above it.
        func draw(_ string: NSAttributedString, y: CGFloat, height: CGFloat) {
            let setter = CTFramesetterCreateWithAttributedString(string)
            let path = CGPath(rect: CGRect(x: bar.minX + pad, y: y, width: textWidth, height: height), transform: nil)
            CTFrameDraw(CTFramesetterCreateFrame(setter, CFRange(location: 0, length: 0), path, nil), context)
        }
        if !body.isEmpty { draw(bodyText, y: bar.minY + pad, height: bodyHeight) }
        if !cue.isEmpty { draw(cueText, y: bar.minY + pad + bodyHeight + gap, height: cueHeight) }
        context.flush()

        // NDI's BGRA is straight alpha; CoreGraphics drew premultiplied.
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        for y in 0..<height {
            let row = pixels + y * stride
            for x in 0..<width {
                let pixel = row + x * 4
                let alpha = Int(pixel[3])
                if alpha == 0 || alpha == 255 { continue }
                for channel in 0..<3 { pixel[channel] = UInt8(min(255, (Int(pixel[channel]) * 255 + alpha / 2) / alpha)) }
            }
        }
        return buffer
    }

    private func sendLatest() {
        lock.lock()
        let buffer = latest
        lock.unlock()
        guard let buffer, let instance else { return }
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return }
        let width = CVPixelBufferGetWidth(buffer)
        let height = CVPixelBufferGetHeight(buffer)
        var frame = NDIlib_video_frame_v2_t(
            xres: Int32(width),
            yres: Int32(height),
            FourCC: NDI_FOURCC_BGRA,
            frame_rate_N: Int32(options.fps * 1000),
            frame_rate_D: 1000,
            picture_aspect_ratio: Float(width) / Float(max(1, height)),
            frame_format_type: Int32(NDI_FRAME_PROGRESSIVE),
            timecode: NDI_TIMECODE_SYNTHESIZE,
            p_data: base.assumingMemoryBound(to: UInt8.self),
            line_stride_in_bytes: Int32(CVPixelBufferGetBytesPerRow(buffer)),
            p_metadata: nil,
            timestamp: 0
        )
        ndi.sendVideo(instance, &frame)
        sent += 1
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid, let buffer = sampleBuffer.imageBuffer else { return }
        // Only complete frames carry a picture (idle and blank frames are skipped).
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
           let raw = attachments.first?[.status] as? Int,
           let status = SCFrameStatus(rawValue: raw), status != .complete {
            return
        }
        lock.lock()
        latest = buffer
        lock.unlock()
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emit(["kind": "error", "code": "stopped", "message": "NDI stopped: the audience window closed or capture stopped. \(error.localizedDescription)"])
        stop(code: 1)
    }

    func stop(code: Int32 = 0) {
        timer?.cancel()
        statsTimer?.cancel()
        let finished = DispatchSemaphore(value: 0)
        if let stream {
            Task {
                try? await stream.stopCapture()
                finished.signal()
            }
            _ = finished.wait(timeout: .now() + 2)
        }
        if let instance { ndi.sendDestroy(instance) }
        instance = nil
        ndi.destroy()
        emit(["kind": "end"])
        exit(code)
    }
}

// MARK: Hub: NDI in

/// Receives NDI sources and serves them on 127.0.0.1 only, for the app's own screens:
///   GET /sources            → ["MACHINE (Name)", …]
///   GET /ndi/<name>.mjpg    → the source as a motion-JPEG stream (any <img> can show it)
/// A source is received while something shows it, and let go 10 seconds after the last viewer.
private final class Hub: @unchecked Sendable {
    private let ndi: NDI
    private let port: UInt16
    private let findCreate: NDIlib_find_create_v2_fn
    private let findSources: NDIlib_find_get_current_sources_fn
    let recvCreate: NDIlib_recv_create_v3_fn
    let recvDestroy: NDIlib_recv_destroy_fn
    let capture: NDIlib_recv_capture_v2_fn
    let freeVideo: NDIlib_recv_free_video_v2_fn
    private var finder: UnsafeMutableRawPointer?
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "ndi.hub")
    private var feeds: [String: Feed] = [:]

    init?(ndi: NDI, port: UInt16) {
        guard let findCreate = ndi.symbol("NDIlib_find_create_v2", NDIlib_find_create_v2_fn.self),
              let findSources = ndi.symbol("NDIlib_find_get_current_sources", NDIlib_find_get_current_sources_fn.self),
              let recvCreate = ndi.symbol("NDIlib_recv_create_v3", NDIlib_recv_create_v3_fn.self),
              let recvDestroy = ndi.symbol("NDIlib_recv_destroy", NDIlib_recv_destroy_fn.self),
              let capture = ndi.symbol("NDIlib_recv_capture_v2", NDIlib_recv_capture_v2_fn.self),
              let freeVideo = ndi.symbol("NDIlib_recv_free_video_v2", NDIlib_recv_free_video_v2_fn.self)
        else { return nil }
        self.ndi = ndi
        self.port = port
        self.findCreate = findCreate
        self.findSources = findSources
        self.recvCreate = recvCreate
        self.recvDestroy = recvDestroy
        self.capture = capture
        self.freeVideo = freeVideo
    }

    func start() {
        var settings = NDIlib_find_create_t(show_local_sources: true, p_groups: nil, p_extra_ips: nil)
        finder = findCreate(&settings)
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        parameters.allowLocalEndpointReuse = true
        guard let listener = try? NWListener(using: parameters) else { fail("port", "Port \(port) on this computer is in use; NDI sources cannot be shown.") }
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.stateUpdateHandler = { state in
            if case .failed(let error) = state { fail("port", "The NDI hub stopped: \(error.localizedDescription)") }
            if case .ready = state { emit(["kind": "hub", "port": Int(self.port), "message": "Receiving NDI on this computer (\(self.ndi.version))."]) }
        }
        listener.start(queue: queue)
        self.listener = listener
    }

    /// Sources on the network now, with their full NDI names.
    func sources() -> [String: NDIlib_source_t] {
        guard let finder else { return [:] }
        var count: UInt32 = 0
        guard let list = findSources(finder, &count) else { return [:] }
        var result: [String: NDIlib_source_t] = [:]
        for index in 0..<Int(count) {
            let source = list[index]
            if let name = source.p_ndi_name { result[String(cString: name)] = source }
        }
        return result
    }

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8),
                  let line = request.split(separator: "\r\n").first else {
                connection.cancel()
                return
            }
            let parts = line.split(separator: " ")
            let path = parts.count > 1 ? String(parts[1]) : "/"
            self.route(path, connection)
        }
    }

    private func route(_ path: String, _ connection: NWConnection) {
        if path == "/sources" {
            let names = sources().keys.sorted()
            let body = (try? JSONSerialization.data(withJSONObject: names)) ?? Data("[]".utf8)
            respond(connection, status: "200 OK", type: "application/json", body: body)
            return
        }
        if path.hasPrefix("/ndi/"), path.hasSuffix(".mjpg") {
            let encoded = String(path.dropFirst(5).dropLast(5))
            let name = encoded.removingPercentEncoding ?? encoded
            if let feed = feeds[name] {
                feed.add(connection)
                return
            }
            guard let source = sources()[name] else {
                respond(connection, status: "404 Not Found", type: "text/plain", body: Data("No NDI source called \(name) is on the network.".utf8))
                return
            }
            let feed = Feed(name: name, source: source, hub: self) { [weak self] in
                self?.queue.async { self?.feeds[name] = nil }
            }
            feeds[name] = feed
            feed.add(connection)
            return
        }
        respond(connection, status: "404 Not Found", type: "text/plain", body: Data())
    }

    private func respond(_ connection: NWConnection, status: String, type: String, body: Data) {
        let head = "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(head.utf8) + body, completion: .contentProcessed { _ in connection.cancel() })
    }
}

/// One NDI source being received, with every screen showing it.
private final class Feed: @unchecked Sendable {
    private let name: String
    private weak var hub: Hub?
    private var receiver: UnsafeMutableRawPointer?
    private var clients: [ObjectIdentifier: (connection: NWConnection, inFlight: Int)] = [:]
    private let lock = NSLock()
    private var running = true
    private var idleSince: Date?
    private let onEnd: () -> Void
    private var nameCopy: UnsafeMutablePointer<CChar>?
    private var urlCopy: UnsafeMutablePointer<CChar>?

    init(name: String, source: NDIlib_source_t, hub: Hub, onEnd: @escaping () -> Void) {
        self.name = name
        self.hub = hub
        self.onEnd = onEnd
        // The receiver copies what it needs, but keep the strings alive while it is created.
        nameCopy = source.p_ndi_name.map { strdup($0) }
        urlCopy = source.p_url_address.map { strdup($0) }
        var settings = NDIlib_recv_create_v3_t(
            source_to_connect_to: NDIlib_source_t(p_ndi_name: nameCopy, p_url_address: urlCopy),
            color_format: Int32(NDI_RECV_BGRX_BGRA),
            bandwidth: Int32(NDI_RECV_BANDWIDTH_HIGHEST),
            allow_video_fields: false,
            p_ndi_recv_name: nil
        )
        receiver = hub.recvCreate(&settings)
        let thread = Thread { [weak self] in self?.loop() }
        thread.name = "ndi.feed"
        thread.start()
    }

    func add(_ connection: NWConnection) {
        let head = "HTTP/1.1 200 OK\r\nContent-Type: multipart/x-mixed-replace; boundary=frame\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(head.utf8), completion: .contentProcessed { _ in })
        lock.lock()
        clients[ObjectIdentifier(connection)] = (connection, 0)
        idleSince = nil
        lock.unlock()
        connection.stateUpdateHandler = { [weak self, weak connection] state in
            guard let self, let connection else { return }
            switch state {
            case .failed, .cancelled: self.drop(connection)
            default: break
            }
        }
    }

    private func drop(_ connection: NWConnection) {
        lock.lock()
        clients[ObjectIdentifier(connection)] = nil
        if clients.isEmpty { idleSince = Date() }
        lock.unlock()
    }

    private func loop() {
        guard let hub, let receiver else { finish(); return }
        var frame = NDIlib_video_frame_v2_t()
        var lastSent = Date.distantPast
        while running {
            let type = hub.capture(receiver, &frame, nil, nil, 200)
            if type == Int32(NDI_FRAME_TYPE_VIDEO) {
                // About 25 pictures a second is plenty for a monitor and keeps the processor calm.
                if Date().timeIntervalSince(lastSent) >= 0.038, let jpeg = encode(frame) {
                    lastSent = Date()
                    broadcast(jpeg)
                }
                hub.freeVideo(receiver, &frame)
            }
            lock.lock()
            let idle = idleSince.map { Date().timeIntervalSince($0) > 10 } ?? false
            lock.unlock()
            if idle { running = false }
        }
        finish()
    }

    private func finish() {
        if let receiver, let hub { hub.recvDestroy(receiver) }
        receiver = nil
        free(nameCopy)
        free(urlCopy)
        nameCopy = nil
        urlCopy = nil
        lock.lock()
        let open = clients.values.map(\.connection)
        clients.removeAll()
        lock.unlock()
        open.forEach { $0.cancel() }
        onEnd()
    }

    private func encode(_ frame: NDIlib_video_frame_v2_t) -> Data? {
        guard let pixels = frame.p_data, frame.xres > 0, frame.yres > 0 else { return nil }
        let stride = Int(frame.line_stride_in_bytes)
        let bytes = Data(bytes: pixels, count: stride * Int(frame.yres))
        guard let provider = CGDataProvider(data: bytes as CFData),
              let image = CGImage(
                width: Int(frame.xres), height: Int(frame.yres), bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: stride,
                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGBitmapInfo(rawValue: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue),
                provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
              ) else { return nil }
        let out = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.72] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return out as Data
    }

    private func broadcast(_ jpeg: Data) {
        let part = Data("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: \(jpeg.count)\r\n\r\n".utf8) + jpeg + Data("\r\n".utf8)
        lock.lock()
        let targets = clients
        lock.unlock()
        for (key, client) in targets where client.inFlight < 2 {
            // A slow screen skips pictures rather than falling behind.
            lock.lock()
            clients[key]?.inFlight += 1
            lock.unlock()
            client.connection.send(content: part, completion: .contentProcessed { [weak self] error in
                guard let self else { return }
                self.lock.lock()
                self.clients[key]?.inFlight -= 1
                self.lock.unlock()
                if error != nil { self.drop(client.connection) }
            })
        }
    }
}

/// Keeps the sender alive for the life of the process.
nonisolated(unsafe) private var retained: AnyObject?

@main
enum ChurchNDI {
    static func main() {
        let options = Options(CommandLine.arguments)
        guard #available(macOS 12.3, *) else { fail("macos", "NDI output needs macOS 12.3 or later.") }
        guard let ndi = NDI.load() else {
            fail("no-runtime", "NDI is not installed on this Mac. Install the free NDI Tools from ndi.video/tools, then try again.")
        }
        if options.hub {
            guard let hub = Hub(ndi: ndi, port: options.port) else { fail("no-runtime", "This NDI library cannot receive.") }
            retained = hub
            hub.start()
            Thread {
                while readLine() != nil {}
                exit(0)
            }.start()
            dispatchMain()
        }
        let sender = Sender(options: options, ndi: ndi)
        retained = sender
        // Closing stdin (the app stopping NDI, or quitting) ends the sender cleanly. In key mode,
        // each other line is the words to show.
        Thread {
            while let line = readLine() {
                if line.trimmingCharacters(in: .whitespaces) == "stop" { break }
                if options.key, let data = line.data(using: .utf8),
                   let words = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    sender.setWords(words)
                }
            }
            sender.stop()
        }.start()
        Task { await sender.run() }
        dispatchMain()
    }
}

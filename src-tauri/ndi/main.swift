import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

// Church Studio NDI sender: watches the audience window with ScreenCaptureKit and sends what it
// shows as an NDI source, so OBS, vMix, a streaming computer or an NDI monitor can take Program.
// The NDI library is loaded at run time; without it this says so and exits.
//
// Arguments: --pid <app pid> --title <window title> --name <NDI source name> [--fps 30]
//            [--width 1920 --height 1080]
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
            default: break
            }
            index += 1
        }
    }
}

/// The NDI library's send functions, found with dlopen/dlsym.
private struct NDI {
    let destroy: NDIlib_destroy_fn
    let sendCreate: NDIlib_send_create_fn
    let sendDestroy: NDIlib_send_destroy_fn
    let sendVideo: NDIlib_send_send_video_v2_fn
    let connections: NDIlib_send_get_no_connections_fn
    let version: String

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
        return NDI(destroy: destroy, sendCreate: sendCreate, sendDestroy: sendDestroy, sendVideo: sendVideo, connections: connections, version: version)
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
        let sender = Sender(options: options, ndi: ndi)
        retained = sender
        // Closing stdin (the app stopping NDI, or quitting) ends the sender cleanly.
        Thread {
            while let line = readLine() {
                if line.trimmingCharacters(in: .whitespaces) == "stop" { break }
            }
            sender.stop()
        }.start()
        Task { await sender.run() }
        dispatchMain()
    }
}

import AVFoundation
import Foundation
import Speech

private let singleBooks = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
    "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Psalms", "Proverbs", "Ecclesiastes",
    "Song of Solomon", "Song of Songs", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
    "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah",
    "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
    "Galatians", "Ephesians", "Philippians", "Colossians", "Titus", "Philemon", "Hebrews",
    "James", "Jude", "Revelation",
]

/// Numbered books the way pastors say them: "First Corinthians", "Second Kings", "Third John".
private let numberedBooks: [String] = {
    let volumes: [(String, [String])] = [
        ("Samuel", ["First", "Second"]), ("Kings", ["First", "Second"]),
        ("Chronicles", ["First", "Second"]), ("Corinthians", ["First", "Second"]),
        ("Thessalonians", ["First", "Second"]), ("Timothy", ["First", "Second"]),
        ("Peter", ["First", "Second"]), ("John", ["First", "Second", "Third"]),
    ]
    return volumes.flatMap { name, ordinals in ordinals.map { "\($0) \(name)" } + [name] }
}()

private let bookNames = singleBooks + numberedBooks + ["chapter", "verse", "verses", "the Lord", "Jesus Christ"]

private func emit(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

private func fail(_ message: String) -> Never {
    emit(["kind": "error", "message": message])
    exit(1)
}

private func plain(_ text: AttributedString) -> String {
    String(text.characters)
}

/// macOS 26 and later: Apple's SpeechAnalyzer, streaming and fully on device.
@available(macOS 26.0, *)
private final class LiveTranscriber: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?
    private var inputBuilder: AsyncStream<AnalyzerInput>.Continuation?
    private var analyzer: SpeechAnalyzer?
    private var results: Task<Void, Never>?
    private var lastLevel = Date.distantPast

    func run() async {
        let allowed = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            AVCaptureDevice.requestAccess(for: .audio) { continuation.resume(returning: $0) }
        }
        guard allowed else { fail("macOS blocked the microphone. Turn on Church Studio in Privacy settings.") }

        let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: "en_US"))
            ?? Locale(identifier: "en_US")
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults, .alternativeTranscriptions],
            attributeOptions: []
        )
        do {
            let status = await AssetInventory.status(forModules: [transcriber])
            if status != .installed {
                emit(["kind": "status", "message": "Installing the on-device speech model. This happens once."])
                if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                    try await request.downloadAndInstall()
                }
            }
            let analyzer = SpeechAnalyzer(modules: [transcriber])
            self.analyzer = analyzer
            guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
                fail("This Mac has no audio format for speech transcription.")
            }
            let context = AnalysisContext()
            context.contextualStrings = [.general: bookNames]
            try await analyzer.setContext(context)
            let (stream, builder) = AsyncStream.makeStream(of: AnalyzerInput.self)
            inputBuilder = builder
            results = Task {
                do {
                    for try await result in transcriber.results {
                        let alternatives = result.alternatives.map { plain($0) }.filter { !$0.isEmpty }
                        emit([
                            "kind": "phrase",
                            "text": plain(result.text),
                            "final": result.isFinal,
                            "alternatives": alternatives,
                        ])
                    }
                } catch {
                    emit(["kind": "error", "message": "Speech transcription stopped."])
                }
                emit(["kind": "end"])
            }
            try await analyzer.start(inputSequence: stream)
            try startMicrophone(format: format)
            emit(["kind": "status", "message": "Listening. Speak a reference or read a verse."])
        } catch {
            fail("The on-device speech model could not start. \(error.localizedDescription)")
        }
    }

    private func startMicrophone(format: AVAudioFormat) throws {
        let input = engine.inputNode
        let hardware = input.outputFormat(forBus: 0)
        guard hardware.channelCount > 0, hardware.sampleRate > 0 else {
            fail("No microphone is available.")
        }
        converter = AVAudioConverter(from: hardware, to: format)
        input.installTap(onBus: 0, bufferSize: 4096, format: hardware) { [weak self] buffer, _ in
            self?.consume(buffer)
        }
        engine.prepare()
        try engine.start()
    }

    private func consume(_ buffer: AVAudioPCMBuffer) {
        if let level = rms(buffer), Date().timeIntervalSince(lastLevel) > 0.08 {
            lastLevel = Date()
            emit(["kind": "level", "value": level])
        }
        guard let converter else { return }
        let outputFormat = converter.outputFormat
        let ratio = outputFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up)) + 32
        guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: max(capacity, 1)) else { return }
        var supplied = false
        var error: NSError?
        let status = converter.convert(to: converted, error: &error) { _, outStatus in
            if supplied {
                outStatus.pointee = .noDataNow
                return nil
            }
            supplied = true
            outStatus.pointee = .haveData
            return buffer
        }
        guard status != .error, converted.frameLength > 0 else { return }
        inputBuilder?.yield(AnalyzerInput(buffer: converted))
    }

    private func rms(_ buffer: AVAudioPCMBuffer) -> Double? {
        guard let samples = buffer.floatChannelData?.pointee else { return nil }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return nil }
        var total = 0.0
        for index in 0..<count {
            let sample = Double(samples[index])
            total += sample * sample
        }
        return min(1, (total / Double(count)).squareRoot() * 4)
    }
}

/// macOS 13–15: SFSpeechRecognizer, on device when the Mac supports it. Apple ends a request
/// after about a minute, so a new one starts whenever one finishes; the app stitches the pieces.
private final class LegacyTranscriber: NSObject, @unchecked Sendable {
    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var lastLevel = Date.distantPast
    private var restartTimer: Timer?

    func run() async {
        let allowed = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            AVCaptureDevice.requestAccess(for: .audio) { continuation.resume(returning: $0) }
        }
        guard allowed else { fail("macOS blocked the microphone. Turn on Church Studio in Privacy settings.") }
        let speech = await withCheckedContinuation { (continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        guard speech == .authorized else { fail("macOS blocked speech recognition. Turn on Church Studio in Privacy settings › Speech Recognition.") }
        guard let recognizer, recognizer.isAvailable else { fail("Speech recognition is not available on this Mac right now.") }
        if !recognizer.supportsOnDeviceRecognition {
            emit(["kind": "status", "message": "This Mac recognizes speech through Apple's servers. Keep it online."])
        }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else { fail("No microphone is available.") }
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, _ in
            self?.consume(buffer)
        }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            fail("The microphone could not start. \(error.localizedDescription)")
        }
        DispatchQueue.main.async { self.begin() }
        emit(["kind": "status", "message": "Listening. Speak a reference or read a verse."])
    }

    private func begin() {
        guard let recognizer else { return }
        let next = SFSpeechAudioBufferRecognitionRequest()
        next.shouldReportPartialResults = true
        next.contextualStrings = bookNames
        next.taskHint = .dictation
        if recognizer.supportsOnDeviceRecognition { next.requiresOnDeviceRecognition = true }
        request = next
        task = recognizer.recognitionTask(with: next) { [weak self] result, error in
            if let result {
                let alternatives = result.transcriptions.map { $0.formattedString }.filter { !$0.isEmpty }
                emit([
                    "kind": "phrase",
                    "text": result.bestTranscription.formattedString,
                    "final": result.isFinal,
                    "alternatives": Array(alternatives.prefix(5)),
                ])
            }
            if result?.isFinal == true || error != nil {
                DispatchQueue.main.async { self?.restart() }
            }
        }
        // Finish each request before Apple's one-minute limit, at a natural seam.
        restartTimer?.invalidate()
        restartTimer = Timer.scheduledTimer(withTimeInterval: 50, repeats: false) { [weak self] _ in
            self?.request?.endAudio()
        }
    }

    private func restart() {
        task?.cancel()
        task = nil
        request = nil
        begin()
    }

    private func consume(_ buffer: AVAudioPCMBuffer) {
        request?.append(buffer)
        guard Date().timeIntervalSince(lastLevel) > 0.08, let samples = buffer.floatChannelData?.pointee else { return }
        let count = Int(buffer.frameLength)
        guard count > 0 else { return }
        lastLevel = Date()
        var total = 0.0
        for index in 0..<count {
            let sample = Double(samples[index])
            total += sample * sample
        }
        emit(["kind": "level", "value": min(1, (total / Double(count)).squareRoot() * 4)])
    }
}

@main
enum ChurchTranscribe {
    static func main() {
        Task { @MainActor in
            // CHURCH_STUDIO_LEGACY_SPEECH=1 tries the macOS 13–15 path on a newer Mac.
            let legacy = ProcessInfo.processInfo.environment["CHURCH_STUDIO_LEGACY_SPEECH"] == "1"
            if #available(macOS 26.0, *), !legacy {
                let session = LiveTranscriber()
                retained = session
                await session.run()
            } else {
                let session = LegacyTranscriber()
                retained = session
                await session.run()
            }
        }
        dispatchMain()
    }
}

/// Keeps the running transcriber alive for the life of the process.
nonisolated(unsafe) private var retained: AnyObject?

import AVFoundation
import Foundation
import Speech

private let bookNames = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
    "Samuel", "Kings", "Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Psalms",
    "Proverbs", "Ecclesiastes", "Song of Solomon", "Isaiah", "Jeremiah", "Lamentations",
    "Ezekiel", "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum",
    "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke",
    "John", "Acts", "Romans", "Corinthians", "Galatians", "Ephesians", "Philippians",
    "Colossians", "Thessalonians", "Timothy", "Titus", "Philemon", "Hebrews", "James",
    "Peter", "Jude", "Revelation", "First John", "Second John", "Third John", "chapter", "verse",
]

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

private let session = LiveTranscriber()

@main
enum ChurchTranscribe {
    static func main() {
        Task { @MainActor in
            await session.run()
        }
        dispatchMain()
    }
}

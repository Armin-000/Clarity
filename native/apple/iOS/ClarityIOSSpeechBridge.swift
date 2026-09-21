import Foundation
import WebKit
import Speech
import AVFoundation

final class ClarityIOSSpeechBridge: NSObject, WKScriptMessageHandler {
    private weak var webView: WKWebView?
    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var activeId: String?
    private var tapInstalled = false
    private var speechStarted = false
    private var finishing = false

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String,
              let id = body["id"] as? String else { return }
        let config = body["config"] as? [String: Any] ?? [:]

        switch action {
        case "start": start(id: id, config: config)
        case "stop": stop(id: id)
        case "abort": abort(id: id)
        default: break
        }
    }

    func shutdown() {
        if let id = activeId { abort(id: id) }
    }

    private func start(id: String, config: [String: Any]) {
        if let old = activeId { abort(id: old) }
        activeId = id
        finishing = false
        speechStarted = false

        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            guard let self else { return }
            guard status == .authorized else {
                self.emit(id: id, type: "error", error: "not-allowed", message: "Dopuštenje za prepoznavanje govora nije odobreno.")
                self.finish(id: id)
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                guard granted else {
                    self.emit(id: id, type: "error", error: "not-allowed", message: "Dopuštenje za mikrofon nije odobreno.")
                    self.finish(id: id)
                    return
                }
                DispatchQueue.main.async { self.beginRecognition(id: id, config: config) }
            }
        }
    }

    private func beginRecognition(id: String, config: [String: Any]) {
        guard activeId == id else { return }
        let language = (config["language"] as? String) ?? "hr-HR"
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)), recognizer.isAvailable else {
            emit(id: id, type: "error", error: "service-not-allowed", message: "Apple speech servis za \(language) trenutačno nije dostupan.")
            finish(id: id)
            return
        }
        self.recognizer = recognizer

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = (config["interimResults"] as? Bool) ?? true
            request.requiresOnDeviceRecognition = false
            self.request = request

            let input = audioEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak request] buffer, _ in
                request?.append(buffer)
            }
            tapInstalled = true
            audioEngine.prepare()
            try audioEngine.start()
            emit(id: id, type: "start")

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self, self.activeId == id else { return }
                if let result {
                    let text = result.bestTranscription.formattedString
                    if !text.isEmpty && !self.speechStarted {
                        self.speechStarted = true
                        self.emit(id: id, type: "speechstart")
                    }
                    if !text.isEmpty {
                        self.emit(id: id, type: result.isFinal ? "final" : "partial", transcript: text, confidence: 0)
                    }
                    if result.isFinal {
                        self.emit(id: id, type: "speechend")
                        self.finish(id: id)
                        return
                    }
                }
                if let error {
                    self.emit(id: id, type: "error", error: self.map(error: error), message: error.localizedDescription)
                    self.finish(id: id)
                }
            }
        } catch {
            emit(id: id, type: "error", error: "audio-capture", message: error.localizedDescription)
            finish(id: id)
        }
    }

    private func stop(id: String) {
        guard activeId == id, !finishing else { return }
        finishing = true
        stopAudioInput()
        request?.endAudio()
        task?.finish()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { [weak self] in
            guard let self, self.activeId == id else { return }
            self.finish(id: id)
        }
    }

    private func abort(id: String) {
        guard activeId == id else { return }
        task?.cancel()
        finish(id: id)
    }

    private func finish(id: String) {
        guard activeId == id else { return }
        stopAudioInput()
        request?.endAudio()
        task = nil
        request = nil
        recognizer = nil
        activeId = nil
        finishing = false
        emit(id: id, type: "end")
    }

    private func stopAudioInput() {
        if audioEngine.isRunning { audioEngine.stop() }
        if tapInstalled {
            audioEngine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func map(error: Error) -> String {
        let ns = error as NSError
        if ns.domain == "kAFAssistantErrorDomain" && ns.code == 1101 { return "network" }
        return "unknown"
    }

    private func emit(id: String, type: String, transcript: String? = nil, confidence: Double? = nil, error: String? = nil, message: String? = nil) {
        var payload: [String: Any] = ["id": id, "type": type]
        if let transcript { payload["transcript"] = transcript }
        if let confidence { payload["confidence"] = confidence }
        if let error { payload["error"] = error }
        if let message { payload["message"] = message }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.ClarityNativeSpeechDispatch(\(json))")
        }
    }
}

import AppKit
import WebKit

final class ClarityMacViewController: NSViewController {
    private var webView: WKWebView!
    private var speechBridge: ClarityMacSpeechBridge!

    override func loadView() {
        let controller = WKUserContentController()
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        webView = WKWebView(frame: .zero, configuration: config)
        speechBridge = ClarityMacSpeechBridge(webView: webView)
        controller.add(speechBridge, name: "claritySpeech")
        view = webView

        guard let index = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "clarity") else {
            assertionFailure("Nedostaje clarity/index.html")
            return
        }
        webView.loadFileURL(index, allowingReadAccessTo: index.deletingLastPathComponent())
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "claritySpeech")
        speechBridge?.shutdown()
    }
}

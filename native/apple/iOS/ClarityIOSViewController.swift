import UIKit
import WebKit

final class ClarityIOSViewController: UIViewController {
    private var webView: WKWebView!
    private var speechBridge: ClarityIOSSpeechBridge!

    override func viewDidLoad() {
        super.viewDidLoad()

        let controller = WKUserContentController()
        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        webView = WKWebView(frame: .zero, configuration: config)
        speechBridge = ClarityIOSSpeechBridge(webView: webView)
        controller.add(speechBridge, name: "claritySpeech")

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

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

import SwiftUI
import AppKit

struct ClarityMacContainer: NSViewControllerRepresentable {
    func makeNSViewController(context: Context) -> ClarityMacViewController { ClarityMacViewController() }
    func updateNSViewController(_ nsViewController: ClarityMacViewController, context: Context) {}
}

import SwiftUI
import UIKit

struct ClarityIOSContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> ClarityIOSViewController { ClarityIOSViewController() }
    func updateUIViewController(_ uiViewController: ClarityIOSViewController, context: Context) {}
}

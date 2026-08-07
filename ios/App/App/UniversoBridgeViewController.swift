import Capacitor
import UIKit

/// Keeps the native WKWebView shell fixed while CSS-owned regions (forms,
/// message history, lists) remain independently scrollable.
final class UniversoBridgeViewController: CAPBridgeViewController {
    private let appBackgroundColor = UIColor(
        red: 0.0,
        green: 26.0 / 255.0,
        blue: 51.0 / 255.0,
        alpha: 1.0
    )

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        guard let webView else { return }

        view.backgroundColor = appBackgroundColor
        webView.backgroundColor = appBackgroundColor
        webView.isOpaque = false

        let rootScrollView = webView.scrollView
        rootScrollView.backgroundColor = appBackgroundColor
        rootScrollView.bounces = false
        rootScrollView.alwaysBounceVertical = false
        rootScrollView.alwaysBounceHorizontal = false
        rootScrollView.isDirectionalLockEnabled = true
        rootScrollView.contentInsetAdjustmentBehavior = .never
        rootScrollView.contentInset = .zero
        rootScrollView.scrollIndicatorInsets = .zero
        rootScrollView.minimumZoomScale = 1.0
        rootScrollView.maximumZoomScale = 1.0
        rootScrollView.pinchGestureRecognizer?.isEnabled = false
        webView.allowsBackForwardNavigationGestures = false
    }
}

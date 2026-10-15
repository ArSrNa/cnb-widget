use objc2_app_kit::{NSAutoresizingMaskOptions, NSView};
use objc2_foundation::{NSPoint, NSSize};

pub(super) fn pin(webview: &NSView, size: NSSize) {
    // SAFETY: The caller holds the live view on the AppKit main thread.
    let Some(parent) = (unsafe { webview.superview() }) else {
        return;
    };
    let bounds = parent.bounds();
    // Keep WebKit's backing surface at the expanded size. Resizing a background
    // WKWebView can stretch its old frame before the WebContent process repaints;
    // waiting for requestAnimationFrame in JavaScript cannot hide that frame.
    // Placement calls this before and after resizing the native clipping window,
    // keeping the viewport's screen position fixed at the notch's top/center.
    webview.setAutoresizingMask(NSAutoresizingMaskOptions::empty());
    let origin = NSPoint::new(
        bounds.origin.x + (bounds.size.width - size.width) / 2.0,
        bounds.origin.y
            + if parent.isFlipped() {
                0.0
            } else {
                bounds.size.height - size.height
            },
    );
    if webview.frame().size != size {
        webview.setFrameSize(size);
    }
    if webview.frame().origin != origin {
        webview.setFrameOrigin(origin);
    }
}

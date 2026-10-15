#[cfg(target_os = "macos")]
#[path = "../src/surface/macos/viewport.rs"]
mod viewport;

#[cfg(target_os = "macos")]
fn main() {
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::NSView;
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    let mtm = MainThreadMarker::new().expect("AppKit requires the main thread");
    for idle in [
        NSSize::new(312.0, 32.0),
        NSSize::new(348.0, 37.0),
        NSSize::new(560.0, 38.0),
    ] {
        let expanded = NSSize::new(idle.width.max(520.0), idle.height + 200.0);
        let parent = NSView::initWithFrame(NSView::alloc(mtm), NSRect::new(NSPoint::ZERO, idle));
        let webview = NSView::initWithFrame(NSView::alloc(mtm), parent.bounds());
        parent.addSubview(&webview);
        viewport::pin(&webview, expanded);

        // Exercise AppKit's real layout, including negative margins in the
        // collapsed window, without a focused window or a WebKit repaint.
        for size in [expanded, idle, expanded, idle, expanded] {
            parent.setFrameSize(size);
            let frame = webview.frame();
            assert_eq!(frame.size, expanded, "hover must never resize the WebView");
            viewport::pin(&webview, expanded);
            let frame = webview.frame();
            assert!(
                (frame.origin.x + frame.size.width / 2.0 - size.width / 2.0).abs() < 0.01,
                "the viewport must stay horizontally centered: {frame:?}"
            );
            assert!(
                (frame.origin.y + frame.size.height - size.height).abs() < 0.01,
                "the viewport must stay pinned to the menu bar: {frame:?}"
            );
            viewport::pin(&webview, expanded);
            assert_eq!(
                webview.frame(),
                frame,
                "repeated placement must preserve the viewport"
            );
        }
    }
    println!("notch viewport: fixed size and top/center alignment passed");
}

#[cfg(not(target_os = "macos"))]
fn main() {}

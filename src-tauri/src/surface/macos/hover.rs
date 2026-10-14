//! AppKit tracking remains active while another application owns keyboard focus.
use objc2::{
    AnyThread, DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, rc::Retained,
};
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSEvent, NSTrackingArea, NSTrackingAreaOptions, NSView, NSWindow,
};
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect};
use std::cell::Cell;
use tauri::{Emitter, WebviewWindow};

pub struct HoverIvars {
    window: WebviewWindow,
    inside: Cell<bool>,
}

define_class!(
    #[unsafe(super(NSView))]
    #[name = "CNBNotchHoverView"]
    #[ivars = HoverIvars]
    struct NotchHoverView;

    impl NotchHoverView {
        #[unsafe(method(mouseEntered:))]
        fn mouse_entered(&self, _event: &NSEvent) {
            self.sync_hover();
        }

        #[unsafe(method(mouseExited:))]
        fn mouse_exited(&self, _event: &NSEvent) {
            self.sync_hover();
        }

        // This transparent tracking view must not intercept webview buttons or focus.
        #[unsafe(method(hitTest:))]
        fn hit_test(&self, _point: NSPoint) -> *mut NSView {
            std::ptr::null_mut()
        }
    }

    unsafe impl NSObjectProtocol for NotchHoverView {}
);

impl NotchHoverView {
    fn sync_hover(&self) {
        let Some(window) = self.window() else {
            return;
        };
        let point = NSEvent::mouseLocation();
        let frame = window.frame();
        let inside = point.x >= frame.origin.x
            && point.x < frame.origin.x + frame.size.width
            && point.y >= frame.origin.y
            && point.y < frame.origin.y + frame.size.height;
        // Resizing the tracking view can synthesize an exit/enter pair without
        // the pointer moving. Only broadcast actual changes in pointer containment.
        if self.ivars().inside.replace(inside) != inside {
            let _ = self.ivars().window.emit("notch-hover", inside);
        }
    }
}

pub fn install(
    window: WebviewWindow,
    native: &NSWindow,
    mtm: MainThreadMarker,
) -> Result<(), String> {
    let content = native.contentView().ok_or("刘海窗口没有内容视图")?;
    let bounds = content.bounds();
    let allocated = NotchHoverView::alloc(mtm).set_ivars(HoverIvars {
        window,
        inside: Cell::new(false),
    });
    // SAFETY: Initialize our NSView subclass with its superclass designated initializer.
    let view: Retained<NotchHoverView> =
        unsafe { msg_send![super(allocated), initWithFrame: bounds] };
    view.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    let options = NSTrackingAreaOptions::MouseEnteredAndExited
        | NSTrackingAreaOptions::ActiveAlways
        | NSTrackingAreaOptions::InVisibleRect
        | NSTrackingAreaOptions::EnabledDuringMouseDrag;
    // SAFETY: The content view retains this owner for the tracking area's full lifetime;
    // it implements both tracking event selectors. No userInfo is supplied.
    let tracking = unsafe {
        NSTrackingArea::initWithRect_options_owner_userInfo(
            NSTrackingArea::alloc(),
            NSRect::ZERO,
            options,
            Some(&view),
            None,
        )
    };
    view.addTrackingArea(&tracking);
    content.addSubview(&view);
    native.setAcceptsMouseMovedEvents(true);
    Ok(())
}

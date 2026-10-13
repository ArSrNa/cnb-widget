//! Menu-bar placement uses AppKit points and the notched screen's full frame,
//! rather than its visible frame (which excludes the menu bar).
use objc2::{MainThreadMarker, sel};
use objc2_app_kit::{NSScreen, NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior};
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize};
use tauri::{AppHandle, Manager, WebviewWindow};

use super::NotchGeometry;

mod hover;

pub fn install_hover(window: &WebviewWindow) -> Result<(), String> {
    let win = window.clone();
    on_main_thread(window.app_handle(), move |mtm| {
        let ptr = win
            .ns_window()
            .map_err(|e| format!("获取原生刘海窗口失败: {e}"))?;
        // SAFETY: Tauri owns this NSWindow and this closure runs on the AppKit main thread.
        let native = unsafe { &*ptr.cast::<NSWindow>() };
        hover::install(win, native, mtm)
    })
}

fn on_main_thread<T: Send + 'static>(
    app: &AppHandle,
    work: impl FnOnce(MainThreadMarker) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    if let Some(mtm) = MainThreadMarker::new() {
        return work(mtm);
    }
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let result = MainThreadMarker::new()
            .ok_or_else(|| "无法访问 macOS 主线程".into())
            .and_then(work);
        let _ = sender.send(result);
    })
    .map_err(|e| format!("调度刘海窗口失败: {e}"))?;
    receiver
        .recv()
        .map_err(|e| format!("读取刘海窗口失败: {e}"))?
}

fn screen_geometry(mtm: MainThreadMarker) -> Option<(NSRect, f64, NotchGeometry)> {
    for screen in NSScreen::screens(mtm).iter() {
        // safeAreaInsets and auxiliary areas were introduced in macOS 12.
        if !screen.respondsToSelector(sel!(safeAreaInsets)) {
            continue;
        }
        let height = screen.safeAreaInsets().top;
        if height <= 0.0 {
            continue;
        }
        let frame = screen.frame();
        let left = screen.auxiliaryTopLeftArea();
        let right = screen.auxiliaryTopRightArea();
        let notch_left = left.origin.x + left.size.width;
        let width = right.origin.x - notch_left;
        if width <= 0.0 {
            continue;
        }
        return Some((
            frame,
            notch_left + width / 2.0,
            NotchGeometry {
                available: true,
                notch_width: width,
                menu_bar_height: height,
            },
        ));
    }
    None
}

pub fn geometry(app: &AppHandle) -> Result<NotchGeometry, String> {
    on_main_thread(app, |mtm| {
        Ok(screen_geometry(mtm)
            .map(|(_, _, geometry)| geometry)
            .unwrap_or_default())
    })
}

pub fn place(window: &WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    let win = window.clone();
    on_main_thread(window.app_handle(), move |mtm| {
        let Some((screen, notch_center, _)) = screen_geometry(mtm) else {
            return Err("当前没有可用的刘海屏".into());
        };
        let ptr = win
            .ns_window()
            .map_err(|e| format!("获取原生刘海窗口失败: {e}"))?;
        // SAFETY: Tauri owns this NSWindow; all access occurs on the AppKit main thread.
        let native = unsafe { &*ptr.cast::<NSWindow>() };
        native.setLevel(NSStatusWindowLevel + 1);
        native.setCollectionBehavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Stationary,
        );
        native.setHidesOnDeactivate(false);
        // Equal wings keep the central camera gap aligned with the window midpoint.
        let x = notch_center - width / 2.0;
        let y = screen.origin.y + screen.size.height - height;
        let frame = NSRect::new(NSPoint::new(x, y), NSSize::new(width, height));
        if native.frame() != frame {
            // Do not force synchronous drawing of WebKit's old backing layer.
            // Let its resized viewport paint on the next normal display pass.
            native.setFrame_display(frame, false);
        }
        Ok(())
    })
}

//! 悬浮窗 / 刘海胶囊的窗口几何管理（spec/notch-ui.md §3）
//!
//! M1 最简版：单一透明窗口承载全部形态，随形态切换 resize 并保持贴顶居中。

use tauri::{LogicalSize, PhysicalPosition, WebviewWindow};

/// 将窗口调整为指定逻辑尺寸，并保持水平居中、贴住屏幕顶部。
#[tauri::command]
pub fn surface_resize(window: WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| format!("获取显示器失败: {e}"))?
        .ok_or("无可用显示器")?;
    let scale = monitor.scale_factor();
    let msize = monitor.size();

    let w = (width * scale) as i32;
    let x = ((msize.width as i32) - w) / 2;

    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("调整窗口尺寸失败: {e}"))?;
    window
        .set_position(PhysicalPosition::new(x.max(0), 0))
        .map_err(|e| format!("调整窗口位置失败: {e}"))?;
    Ok(())
}

//! 灵动岛 / 悬浮球的窗口几何与生命周期管理
//!
//! - `notch`：灵动岛，主屏顶部居中、与物理刘海融合，悬停加宽（codex-island 式）
//! - `float`：悬浮球，可拖动，位置持久化到 settings
//! - 两者均由面板内开关独立控制显隐；点击任意表面唤起主面板窗口。

use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

pub const NOTCH_LABEL: &str = "notch";
pub const FLOAT_LABEL: &str = "float";

/// 灵动岛空闲尺寸（逻辑像素）：略宽于物理刘海，与菜单栏同高
pub const NOTCH_IDLE_SIZE: (f64, f64) = (360.0, 32.0);
/// 悬浮球窗口尺寸（逻辑像素）
pub const FLOAT_SIZE: (f64, f64) = (64.0, 64.0);

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

/// 创建（或复用）并显示灵动岛窗口（主屏顶部居中）
pub fn show_notch_window(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(NOTCH_LABEL) {
        existing.show().map_err(|e| format!("显示灵动岛失败: {e}"))?;
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(app, NOTCH_LABEL, WebviewUrl::default())
        .title("cnb-widget")
        .inner_size(NOTCH_IDLE_SIZE.0, NOTCH_IDLE_SIZE.1)
        .visible(false)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .build()
        .map_err(|e| format!("创建灵动岛窗口失败: {e}"))?;

    // 主屏顶部居中（物理刘海位于主屏）
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let scale = monitor.scale_factor();
        let w = (NOTCH_IDLE_SIZE.0 * scale) as i32;
        let x = ((monitor.size().width as i32) - w) / 2;
        let _ = win.set_position(PhysicalPosition::new(x.max(0), 0));
    }

    win.show().map_err(|e| format!("显示灵动岛失败: {e}"))?;
    Ok(())
}

/// 创建（或复用）并显示悬浮球窗口（默认主屏右侧，拖动后位置持久化）
pub fn show_float_window(app: &AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(FLOAT_LABEL) {
        existing.show().map_err(|e| format!("显示悬浮球失败: {e}"))?;
        return Ok(());
    }

    let saved = crate::settings::load(app).float_pos;
    let win = WebviewWindowBuilder::new(app, FLOAT_LABEL, WebviewUrl::default())
        .title("cnb-widget")
        .inner_size(FLOAT_SIZE.0, FLOAT_SIZE.1)
        .visible(false)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .build()
        .map_err(|e| format!("创建悬浮球窗口失败: {e}"))?;

    let scale = win.scale_factor().unwrap_or(2.0);
    let (x, y) = match saved {
        Some([lx, ly]) => ((lx * scale) as i32, (ly * scale) as i32),
        None => match app.primary_monitor() {
            Ok(Some(monitor)) => {
                let s = monitor.scale_factor();
                let w = (FLOAT_SIZE.0 * s) as i32;
                let margin = (24.0 * s) as i32;
                (
                    (monitor.size().width as i32) - w - margin,
                    (monitor.size().height as f64 * 0.33) as i32,
                )
            }
            _ => (0, 0),
        },
    };
    let _ = win.set_position(PhysicalPosition::new(x.max(0), y.max(0)));

    win.show().map_err(|e| format!("显示悬浮球失败: {e}"))?;
    Ok(())
}

/// 悬浮球拖动：按逻辑像素增量移动窗口
#[tauri::command]
pub fn float_nudge(window: WebviewWindow, dx: f64, dy: f64) -> Result<(), String> {
    let scale = window
        .scale_factor()
        .map_err(|e| format!("获取缩放系数失败: {e}"))?;
    let pos = window
        .outer_position()
        .map_err(|e| format!("获取窗口位置失败: {e}"))?;
    window
        .set_position(PhysicalPosition::new(
            pos.x + (dx * scale).round() as i32,
            pos.y + (dy * scale).round() as i32,
        ))
        .map_err(|e| format!("移动窗口失败: {e}"))
}

/// 悬浮球拖动结束：持久化当前位置（逻辑坐标）
#[tauri::command]
pub fn float_settle(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let scale = window
        .scale_factor()
        .map_err(|e| format!("获取缩放系数失败: {e}"))?;
    let pos = window
        .outer_position()
        .map_err(|e| format!("获取窗口位置失败: {e}"))?;
    crate::settings::set_float_pos(&app, (pos.x as f64 / scale, pos.y as f64 / scale))
}

/// 显示并聚焦主面板窗口（灵动岛/悬浮球点击时调用）
#[tauri::command]
pub fn panel_show(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or("主面板窗口不存在")?;
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

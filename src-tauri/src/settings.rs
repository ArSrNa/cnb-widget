//! 应用设置（显示开关等），持久化到 `<app_data_dir>/settings.json`
//!
//! - `notch_enabled`：灵动岛（屏幕顶部，与物理刘海融合）
//! - `float_enabled`：悬浮球（可拖动，点击打开面板）
//! - `float_pos`：悬浮球位置（逻辑坐标）
//!
//! 两个开关相互独立，各自控制对应表面窗口的显隐。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

use crate::surface;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub notch_enabled: bool,
    pub float_enabled: bool,
    pub float_pos: Option<[f64; 2]>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            notch_enabled: true,
            float_enabled: true,
            float_pos: None,
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))
        .map(|dir| dir.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    settings_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, s: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let body = serde_json::to_string_pretty(s).map_err(|e| format!("序列化设置失败: {e}"))?;
    std::fs::write(&path, body).map_err(|e| format!("写入设置失败: {e}"))
}

/// 依据设置同步两个表面窗口的显隐，并向所有窗口广播 `settings-changed`
fn sync(app: &AppHandle, s: &Settings) -> Result<(), String> {
    save(app, s)?;
    if s.notch_enabled {
        surface::show_notch_window(app)?;
    } else if let Some(win) = app.get_webview_window(surface::NOTCH_LABEL) {
        let _ = win.hide();
    }
    if s.float_enabled {
        surface::show_float_window(app)?;
    } else if let Some(win) = app.get_webview_window(surface::FLOAT_LABEL) {
        let _ = win.hide();
    }
    let _ = app.emit("settings-changed", s);
    Ok(())
}

/// 持久化悬浮球位置（逻辑坐标，屏幕左上角）
pub fn set_float_pos(app: &AppHandle, pos: (f64, f64)) -> Result<(), String> {
    let mut s = load(app);
    s.float_pos = Some([pos.0, pos.1]);
    save(app, &s)
}

#[tauri::command]
pub fn settings_get(app: AppHandle) -> Result<Settings, String> {
    Ok(load(&app))
}

#[tauri::command]
pub fn settings_set_notch(app: AppHandle, enabled: bool) -> Result<Settings, String> {
    let mut s = load(&app);
    s.notch_enabled = enabled;
    sync(&app, &s)?;
    Ok(s)
}

#[tauri::command]
pub fn settings_set_float(app: AppHandle, enabled: bool) -> Result<Settings, String> {
    let mut s = load(&app);
    s.float_enabled = enabled;
    sync(&app, &s)?;
    Ok(s)
}

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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum UsageMetric {
    #[default]
    #[serde(rename = "credit")]
    Credit,
    #[serde(rename = "dev-corehour")]
    DevCorehour,
    #[serde(rename = "ci-corehour")]
    CiCorehour,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub enum NotchStatus {
    #[default]
    #[serde(rename = "NPC_WORKING")]
    Working,
    #[serde(rename = "NPC_REPLIED")]
    Replied,
    #[serde(rename = "NPC_FAILED")]
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub notch_enabled: bool,
    pub float_enabled: bool,
    pub float_pos: Option<[f64; 2]>,
    pub usage_org: Option<String>,
    pub usage_metric: UsageMetric,
    pub notch_status: NotchStatus,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            notch_enabled: true,
            float_enabled: true,
            float_pos: None,
            usage_org: None,
            usage_metric: UsageMetric::default(),
            notch_status: NotchStatus::default(),
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

#[tauri::command]
pub fn settings_set_notch_content(
    app: AppHandle,
    usage_org: Option<String>,
    usage_metric: UsageMetric,
    notch_status: NotchStatus,
) -> Result<Settings, String> {
    if usage_org.as_ref().is_some_and(|org| org.trim().is_empty()) {
        return Err("请选择有效组织".into());
    }
    let mut s = load(&app);
    s.usage_org = usage_org;
    s.usage_metric = usage_metric;
    s.notch_status = notch_status;
    save(&app, &s)?;
    app.emit("settings-changed", &s)
        .map_err(|e| format!("同步刘海设置失败: {e}"))?;
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_settings_keep_display_preferences_and_default_content() {
        let settings: Settings = serde_json::from_str(
            r#"{"notchEnabled":false,"floatEnabled":true,"floatPos":[12,34]}"#,
        )
        .unwrap();
        assert!(!settings.notch_enabled);
        assert_eq!(settings.float_pos, Some([12.0, 34.0]));
        let value = serde_json::to_value(settings).unwrap();
        assert_eq!(value["usageMetric"], "credit");
        assert_eq!(value["notchStatus"], "NPC_WORKING");
    }

    #[test]
    fn content_settings_round_trip_and_reject_unknown_choices() {
        let json =
            r#"{"usageOrg":"1024hub","usageMetric":"ci-corehour","notchStatus":"NPC_REPLIED"}"#;
        let value = serde_json::to_value(serde_json::from_str::<Settings>(json).unwrap()).unwrap();
        assert_eq!(value["usageOrg"], "1024hub");
        assert_eq!(value["usageMetric"], "ci-corehour");
        assert_eq!(value["notchStatus"], "NPC_REPLIED");
        assert!(serde_json::from_str::<Settings>(r#"{"notchStatus":"UNKNOWN"}"#).is_err());
    }
}

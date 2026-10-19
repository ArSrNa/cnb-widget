//! 发布接口版本检查：semver 比较本机版本，命中新版时由前端提示跳转官网下载。
//! 只做提示，不下载不安装 —— 应用内自动更新需要签名产物，另行评估。

use chrono::DateTime;
use semver::Version;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;
use tauri::AppHandle;

const RELEASE_API: &str = "https://api-gz.arsrna.cn/release/appUpdate/cnb-widget";
const CHECK_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    current_version: String,
    latest_version: Option<String>,
    available: bool,
    link: Option<String>,
    notes: Option<String>,
    published_at: Option<u64>,
    checked_at: Option<u64>,
    error: Option<String>,
}

/// 检查失败写进 `error` 而不是返回 Err：设置页仍需展示本机版本和上次检查时间。
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateInfo, String> {
    let current_version = app.package_info().version.to_string();
    let checked_at = Some(crate::data::now_ms());
    match check_release(&current_version, checked_at).await {
        Ok(info) => Ok(info),
        Err(error) => Ok(UpdateInfo {
            current_version,
            checked_at,
            error: Some(error),
            ..Default::default()
        }),
    }
}

async fn check_release(current: &str, checked_at: Option<u64>) -> Result<UpdateInfo, String> {
    let local = Version::parse(current).map_err(|_| format!("本机版本号异常：{current}"))?;
    let release = tauri::async_runtime::spawn_blocking(fetch_release)
        .await
        .map_err(|e| format!("版本检查任务失败：{e}"))??;

    let announced = field(&release, "version").ok_or("发布接口缺少 version 字段")?;
    let latest = Version::parse(announced.trim_start_matches('v'))
        .map_err(|_| format!("发布接口返回的版本号不是合法 semver：{announced}"))?;

    Ok(UpdateInfo {
        current_version: current.to_string(),
        latest_version: Some(latest.to_string()),
        available: latest > local,
        link: field(&release, "link")
            .filter(|link| link.starts_with("https://") || link.starts_with("http://")),
        notes: field(&release, "content"),
        published_at: field(&release, "time")
            .and_then(|time| DateTime::parse_from_rfc3339(&time).ok())
            .map(|time| time.timestamp_millis() as u64),
        checked_at,
        error: None,
    })
}

fn field(release: &Value, key: &str) -> Option<String> {
    release.get(key).and_then(Value::as_str).map(str::to_string)
}

fn fetch_release() -> Result<Value, String> {
    ureq::get(RELEASE_API)
        .timeout(CHECK_TIMEOUT)
        .call()
        .map_err(|e| format!("无法连接发布接口：{e}"))?
        .into_json::<Value>()
        .map_err(|e| format!("发布接口响应解析失败：{e}"))
}

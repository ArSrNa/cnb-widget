//! 跨平台凭据存储，Token 不返回前端、不写入设置文件。
use crate::cli::{self, CliState};
use keyring::{Entry, Error};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

const SERVICE: &str = "com.arsrna.cnb-widget";
const ACCOUNT: &str = "CNB_TOKEN";
#[derive(Default)]
struct Credentials {
    loaded: bool,
    token: Option<String>,
    persistent: bool,
    saved_token: bool,
    storage_error: Option<String>,
}
static CREDENTIALS: Mutex<Credentials> = Mutex::new(Credentials {
    loaded: false,
    token: None,
    persistent: false,
    saved_token: false,
    storage_error: None,
});

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthInfo {
    pub source: String,
    pub environment_present: bool,
    pub saved_token: bool,
    pub storage_error: Option<String>,
}
fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|_| "无法初始化系统凭据存储".into())
}
fn storage_message() -> String {
    "系统凭据存储不可用或已锁定，请解锁后重试；Linux 需要运行 Secret Service（如 GNOME Keyring 或 KWallet），也可选择仅本次会话使用".into()
}
fn load() -> Result<std::sync::MutexGuard<'static, Credentials>, String> {
    let mut cache = CREDENTIALS
        .lock()
        .map_err(|_| "认证状态不可用".to_string())?;
    if !cache.loaded {
        match entry().and_then(|entry| match entry.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(Error::NoEntry) => Ok(None),
            Err(_) => Err(storage_message()),
        }) {
            Ok(token) => {
                cache.persistent = token.is_some();
                cache.saved_token = token.is_some();
                cache.token = token;
            }
            Err(error) => cache.storage_error = Some(error),
        }
        cache.loaded = true;
    }
    Ok(cache)
}
fn environment_token() -> Option<String> {
    std::env::var("CNB_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty())
}
pub fn token() -> Result<Option<String>, String> {
    Ok(load()?.token.clone().or_else(environment_token))
}
pub async fn current_token() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(token)
        .await
        .map_err(|_| "无法读取认证信息".to_string())?
}
fn info() -> Result<AuthInfo, String> {
    let cache = load()?;
    let environment_present = environment_token().is_some();
    Ok(AuthInfo {
        source: if cache.token.is_some() {
            if cache.persistent { "saved" } else { "session" }
        } else if environment_present {
            "environment"
        } else {
            "cli"
        }
        .into(),
        environment_present,
        saved_token: cache.saved_token,
        storage_error: cache.storage_error.clone(),
    })
}
#[tauri::command]
pub async fn auth_status() -> Result<AuthInfo, String> {
    tauri::async_runtime::spawn_blocking(info)
        .await
        .map_err(|_| "无法读取认证状态".to_string())?
}
#[tauri::command]
pub async fn auth_save(
    app: AppHandle,
    state: State<'_, CliState>,
    token: String,
    persist: bool,
) -> Result<AuthInfo, String> {
    let token = token.trim().to_string();
    if token.is_empty() || token.chars().any(char::is_whitespace) {
        return Err("请输入完整的 CNB Token，不要包含空格或换行".into());
    }
    let _guard = state.call_lock.lock().await;
    cli::require_data(
        cli::call_with_token(&app, "users", "get-user-info", vec![], Some(&token)).await?,
    )?;
    cli::require_data(
        cli::call_with_token(
            &app,
            "organizations",
            "list-top-groups",
            vec!["--page-size".into(), "1".into()],
            Some(&token),
        )
        .await?,
    )?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut cache = load()?;
        if persist {
            entry()?
                .set_password(&token)
                .map_err(|_| storage_message())?;
            cache.storage_error = None;
            cache.saved_token = true;
        }
        cache.loaded = true;
        cache.token = Some(token);
        cache.persistent = persist;
        Ok::<_, String>(())
    })
    .await
    .map_err(|_| "保存认证信息失败".to_string())??;
    state
        .generation
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let result = info()?;
    let _ = app.emit("auth-changed", &result);
    Ok(result)
}
#[tauri::command]
pub async fn auth_clear(app: AppHandle, state: State<'_, CliState>) -> Result<AuthInfo, String> {
    let _guard = state.call_lock.lock().await;
    tauri::async_runtime::spawn_blocking(|| {
        let mut cache = load()?;
        match entry()?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => (),
            Err(_) if !cache.saved_token => (),
            Err(_) => return Err(storage_message()),
        }
        *cache = Credentials::default();
        Ok::<_, String>(())
    })
    .await
    .map_err(|_| "移除认证信息失败".to_string())??;
    state
        .generation
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let result = info()?;
    let _ = app.emit("auth-changed", &result);
    Ok(result)
}

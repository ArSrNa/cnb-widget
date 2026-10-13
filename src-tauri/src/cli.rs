//! cnb-cli 子进程封装（spec §2.1）
//!
//! - 安装：从 CNB 官方 release 下载预编译平台二进制，安装到应用数据目录
//!   （Tauri 的 `app_data_dir()`，等价 Electron 的 userData：
//!   macOS 下为 `~/Library/Application Support/<bundle-id>/bin/cnb`）；
//!   未安装时回退到系统 PATH 中的 `cnb`（复用用户已有安装与登录态）。
//! - 调用：`cnb <module> <tool> [args...] -v`，解析 stdout 的
//!   `{status, data}` 信封 JSON；单次 15s 超时；全局串行化避免限流。
//! - 错误分类：NotInstalled / NotLoggedIn / NoPermission / Other。

use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::process::Command;
use tokio::sync::Mutex;

const DOWNLOAD_BASE: &str = "https://cnb.cool/cnb/skills/cnb-skill/-/releases/download";
const NPM_LATEST: &str = "https://registry.npmjs.org/@cnbcool/cnb-cli/latest";
const CALL_TIMEOUT: Duration = Duration::from_secs(15);
const DOWNLOAD_TIMEOUT_SECS: u64 = 300;

#[derive(Default)]
pub struct CliState {
    /// 所有 cnb-cli 调用串行化（spec §2.1：避免并发触发限流）
    call_lock: Mutex<()>,
}

// ---------------------------------------------------------------------------
// 路径与解析
// ---------------------------------------------------------------------------

/// 应用托管的 cnb 二进制路径：`<app_data_dir>/bin/cnb[.exe]`
fn managed_bin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?
        .join("bin");
    let name = if cfg!(windows) { "cnb.exe" } else { "cnb" };
    Ok(dir.join(name))
}

/// 系统安装的 cnb 路径（PATH + 常见 Homebrew 目录兜底）
async fn find_system_cli() -> Option<PathBuf> {
    #[cfg(unix)]
    {
        // login shell 以覆盖 GUI 启动时受限的 PATH（/opt/homebrew/bin 等）
        if let Ok(out) = Command::new("sh")
            .arg("-lc")
            .arg("command -v cnb")
            .output()
            .await
        {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if out.status.success() && !p.is_empty() {
                return Some(PathBuf::from(p));
            }
        }
        let home = std::env::var("HOME").ok()?;
        for candidate in ["/opt/homebrew/bin/cnb", "/usr/local/bin/cnb"] {
            let p = PathBuf::from(candidate);
            if p.is_file() {
                return Some(p);
            }
        }
        let p = PathBuf::from(home).join(".cnb/bin/cnb");
        if p.is_file() {
            return Some(p);
        }
        None
    }
    #[cfg(windows)]
    {
        if let Ok(out) = Command::new("where").arg("cnb").output().await {
            if out.status.success() {
                let first = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if !first.is_empty() {
                    return Some(PathBuf::from(first));
                }
            }
        }
        None
    }
}

/// 当前应使用的 cnb 二进制：优先应用托管（appdata），其次系统
async fn resolve_cli(app: &AppHandle) -> Option<(PathBuf, &'static str)> {
    if let Ok(p) = managed_bin_path(app) {
        if p.is_file() {
            return Some((p, "managed"));
        }
    }
    find_system_cli().await.map(|p| (p, "system"))
}

// ---------------------------------------------------------------------------
// 子进程调用
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliOutput {
    pub ok: bool,
    /// Normalized / Other / NotInstalled / NotLoggedIn / NoPermission
    pub kind: String,
    pub data: Option<Value>,
    pub stdout: String,
    pub stderr: String,
}

async fn run_cli(bin: &Path, args: &[String], timeout: Duration) -> Result<CliOutput, String> {
    let fut = Command::new(bin).args(args).output();
    let out = tokio::time::timeout(timeout, fut)
        .await
        .map_err(|_| "调用超时".to_string())?
        .map_err(|e| format!("启动 cnb 子进程失败: {e}"))?;

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    let lower = format!("{} {}", stderr, stdout).to_lowercase();

    // 失败模式识别（spec §2.1）
    let mut kind = "Other".to_string();
    if stderr.contains("not found") || stderr.contains("No such file") {
        kind = "NotInstalled".into();
    } else if lower.contains("not logged in") || stderr.contains("请先登录") || lower.contains("请执行 cnb login") {
        kind = "NotLoggedIn".into();
    } else if lower.contains("has no permission") || lower.contains("only reporter") {
        kind = "NoPermission".into();
    }

    Ok(CliOutput {
        ok: out.status.success(),
        kind,
        data: None,
        stdout,
        stderr,
    })
}

/// 解析 `-v` 输出的 `{status, data}` 信封；成功时提取 `data`，按 HTTP 语义分类
fn normalize(mut out: CliOutput) -> CliOutput {
    if !out.ok {
        return out;
    }
    let Ok(v) = serde_json::from_str::<Value>(out.stdout.trim()) else {
        out.kind = "Other".into();
        return out;
    };
    if let Some(status) = v.get("status").and_then(Value::as_u64) {
        if status == 200 {
            out.data = v.get("data").cloned();
            out.kind = "Normalized".into();
        } else if status == 403 {
            out.ok = false;
            out.kind = "NoPermission".into();
        } else {
            out.ok = false;
            out.kind = "Other".into();
            out.data = v.get("data").cloned();
        }
    } else {
        out.data = Some(v);
        out.kind = "Normalized".into();
    }
    out
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliInfo {
    /// managed（应用数据目录）| system（系统安装）| missing
    pub source: String,
    pub path: Option<String>,
    pub version: Option<String>,
    pub latest_version: Option<String>,
    pub logged_in: Option<bool>,
    pub login_output: Option<String>,
}

/// 查询 cnb-cli 状态：安装来源、版本、登录态、npm 最新版本
#[tauri::command]
pub async fn cli_status(app: AppHandle) -> Result<CliInfo, String> {
    let resolved = resolve_cli(&app).await;
    let mut info = match &resolved {
        Some((path, source)) => CliInfo {
            source: source.to_string(),
            path: Some(path.display().to_string()),
            version: cli_version(path).await,
            latest_version: None,
            logged_in: None,
            login_output: None,
        },
        None => CliInfo {
            source: "missing".into(),
            path: None,
            version: None,
            latest_version: None,
            logged_in: None,
            login_output: None,
        },
    };
    info.latest_version = fetch_latest_version().await;

    if let Some((path, _)) = &resolved {
        let st = run_cli(path, &["status".into()], Duration::from_secs(10)).await?;
        info.logged_in = Some(st.ok);
        info.login_output = Some(if st.ok {
            st.stdout.trim().to_string()
        } else {
            st.stderr.trim().to_string()
        });
    }
    Ok(info)
}

async fn cli_version(bin: &Path) -> Option<String> {
    let out = run_cli(bin, &["--version".into()], Duration::from_secs(10))
        .await
        .ok()?;
    out.ok
        .then(|| out.stdout.trim().trim_start_matches('v').to_string())
}

/// 下载安装/升级 cnb-cli 到应用数据目录（`<app_data_dir>/bin/cnb`）
///
/// 过程中向前端 emit `cli-install-progress` 事件：`{ received, total }`
#[tauri::command]
pub async fn cli_install(app: AppHandle) -> Result<CliInfo, String> {
    let version = match fetch_latest_version().await {
        Some(v) => v,
        None => return Err("无法获取 cnb-cli 最新版本号，请检查网络".into()),
    };
    let (os, arch, ext) = platform_triple();
    let url = format!("{DOWNLOAD_BASE}/{version}/cnb-{os}-{arch}{ext}");

    let target = managed_bin_path(&app)?;
    let dir = target.parent().ok_or("目标路径异常")?.to_path_buf();
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;
    let tmp = dir.join("cnb.download");

    // 下载是阻塞 IO，放线程池执行，避免卡住异步运行时
    let app2 = app.clone();
    let tmp2 = tmp.clone();
    tauri::async_runtime::spawn_blocking(move || download_to(&url, &tmp2, &app2))
        .await
        .map_err(|e| format!("下载任务失败: {e}"))??;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("设置可执行权限失败: {e}"))?;
    }
    // 原子替换，避免半成品二进制
    std::fs::rename(&tmp, &target).map_err(|e| format!("安装失败: {e}"))?;

    // 记录安装元信息
    let meta = serde_json::json!({ "version": version, "installedAt": chrono_now() });
    let _ = std::fs::write(
        dir.join("cnb-cli.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    );

    let path = target.clone();
    let mut info = CliInfo {
        source: "managed".into(),
        path: Some(path.display().to_string()),
        version: cli_version(&path).await,
        latest_version: Some(version),
        logged_in: None,
        login_output: None,
    };
    let st = run_cli(&path, &["status".into()], Duration::from_secs(10)).await?;
    info.logged_in = Some(st.ok);
    info.login_output = Some(if st.ok {
        st.stdout.trim().to_string()
    } else {
        st.stderr.trim().to_string()
    });
    Ok(info)
}

/// 统一调用入口：`cnb <module> <tool> [args...] -v`，返回解析后的 JSON
#[tauri::command]
pub async fn cnb_call(
    app: AppHandle,
    state: State<'_, CliState>,
    module: String,
    tool: String,
    args: Vec<String>,
) -> Result<CliOutput, String> {
    let (bin, source) = resolve_cli(&app)
        .await
        .ok_or_else(|| "cnb-cli 未安装".to_string())?;

    let mut argv: Vec<String> = vec![module, tool];
    argv.extend(args);
    argv.push("-v".into()); // 输出 {status, data} 信封 JSON（decision §3.1）

    let _guard = state.call_lock.lock().await; // 串行化
    let out = run_cli(&bin, &argv, CALL_TIMEOUT).await?;
    let _ = source; // 仅用于日志/调试
    Ok(normalize(out))
}

// ---------------------------------------------------------------------------
// 下载与版本
// ---------------------------------------------------------------------------

fn platform_triple() -> (&'static str, &'static str, &'static str) {
    let os = match std::env::consts::OS {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "windows",
        other => other,
    };
    let arch = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    };
    let ext = if cfg!(windows) { ".exe" } else { "" };
    (os, arch, ext)
}

async fn fetch_latest_version() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let resp = ureq::get(NPM_LATEST)
            .timeout(Duration::from_secs(10))
            .call()
            .ok()?;
        let v: Value = resp.into_json().ok()?;
        v.get("version")?.as_str().map(str::to_string)
    })
    .await
    .ok()?
}

fn download_to(url: &str, dest: &Path, app: &AppHandle) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(15))
        .timeout_read(Duration::from_secs(60))
        .build();
    let resp = agent
        .get(url)
        .timeout(Duration::from_secs(DOWNLOAD_TIMEOUT_SECS))
        .call()
        .map_err(|e| format!("下载失败: {e}"))?;

    let total: u64 = resp
        .header("content-length")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    let mut reader = resp.into_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| format!("写入临时文件失败: {e}"))?;

    use std::io::{Read, Write};
    let mut buf = [0u8; 64 * 1024];
    let mut received: u64 = 0;
    let mut last_emit: u64 = 0;
    loop {
        let n = reader.read(&mut buf).map_err(|e| format!("下载中断: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| format!("写入失败: {e}"))?;
        received += n as u64;
        // 每 512KB 上报一次进度，减少事件风暴
        if received - last_emit >= 512 * 1024 || (total > 0 && received == total) {
            last_emit = received;
            let _ = app.emit(
                "cli-install-progress",
                serde_json::json!({ "received": received, "total": total }),
            );
        }
    }
    if total > 0 && received != total {
        return Err(format!("下载不完整：{received}/{total} 字节"));
    }
    Ok(())
}

fn chrono_now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string()
}

//! 所有窗口共享组织快照；CLI 串行调用，逐组织处理 403。
use crate::{
    auth,
    cli::{self, CliState},
};
use serde::Serialize;
use serde_json::Value;
use std::{
    sync::atomic::Ordering,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

#[derive(Clone, Serialize)]
pub struct UsageQuota {
    used: f64,
    quota: f64,
    frozen: Option<f64>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgUsage {
    slug: String,
    name: String,
    charge_forbidden: bool,
    error: Option<String>,
    credit: Option<UsageQuota>,
    git_storage: Option<UsageQuota>,
    object_storage: Option<UsageQuota>,
    dev_corehour: Option<UsageQuota>,
    ci_corehour: Option<UsageQuota>,
    dev_gpu_corehour: Option<UsageQuota>,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    username: Option<String>,
    orgs: Vec<OrgUsage>,
    updated_at: Option<u64>,
    error: Option<String>,
}
#[derive(Default)]
struct UsageCache {
    snapshot: UsageSnapshot,
    attempted: Option<Instant>,
    generation: u64,
    groups: Vec<Value>,
    groups_at: Option<Instant>,
}
#[derive(Default)]
pub struct DataState {
    usage: Mutex<UsageCache>,
    npc: Mutex<NpcCache>,
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn strings(args: &[&str]) -> Vec<String> {
    args.iter().map(|value| (*value).into()).collect()
}
fn array(value: Value) -> Result<Vec<Value>, String> {
    value
        .as_array()
        .cloned()
        .ok_or_else(|| "CNB 返回的列表格式异常".into())
}
fn quota(volume: &Value, limits: &Value, key: &str, divisor: f64) -> Option<UsageQuota> {
    let used = volume.get(key)?.as_f64()? / divisor;
    let quota = limits.get(key)?.get("total")?.as_f64()? / divisor;
    if !used.is_finite() || !quota.is_finite() || used < 0.0 || quota < 0.0 {
        return None;
    }
    Some(UsageQuota {
        used,
        quota,
        frozen: volume
            .get(format!("freeze_{key}"))
            .and_then(Value::as_f64)
            .map(|value| value / divisor),
    })
}

#[tauri::command]
pub async fn usage_get(
    app: AppHandle,
    cli_state: State<'_, CliState>,
    state: State<'_, DataState>,
    force: bool,
) -> Result<UsageSnapshot, String> {
    let requested_at = Instant::now();
    let mut cache = state.usage.lock().await;
    let generation = cli_state.generation.load(Ordering::SeqCst);
    if cache.generation != generation {
        *cache = UsageCache {
            generation,
            ..Default::default()
        };
    }
    if cache.attempted.is_some_and(|at| at >= requested_at) {
        return Ok(cache.snapshot.clone());
    }
    let retry = if cache.snapshot.error.is_some()
        || cache.snapshot.orgs.iter().any(|org| org.error.is_some())
    {
        60
    } else {
        1800
    };
    if !force
        && cache
            .attempted
            .is_some_and(|at| at.elapsed() < Duration::from_secs(retry))
    {
        return Ok(cache.snapshot.clone());
    }
    // 采集前重新检查认证版本，旧账号缓存不能参与新采集。
    let generation = cli_state.generation.load(Ordering::SeqCst);
    if cache.generation != generation {
        *cache = UsageCache {
            generation,
            ..Default::default()
        };
    }
    let token = auth::current_token().await?;
    if force {
        cache.groups_at = None;
    }
    let result = collect_usage(&app, &mut cache, token.as_deref()).await;
    if let Err(error) = result {
        cache.snapshot.error = Some(error);
    }
    let _guard = cli_state.call_lock.lock().await;
    if cli_state.generation.load(Ordering::SeqCst) != generation {
        *cache = UsageCache::default();
        return Ok(cache.snapshot.clone());
    }
    cache.attempted = Some(Instant::now());
    let snapshot = cache.snapshot.clone();
    let _ = app.emit("usage-changed", &snapshot);
    Ok(snapshot)
}
async fn collect_usage(
    app: &AppHandle,
    cache: &mut UsageCache,
    token: Option<&str>,
) -> Result<(), String> {
    if cache
        .groups_at
        .is_none_or(|at| at.elapsed() >= Duration::from_secs(21600))
    {
        let user = versioned_request(
            app,
            cache.generation,
            "users",
            "get-user-info",
            vec![],
            token,
        )
        .await?;
        let username = user
            .get("username")
            .and_then(Value::as_str)
            .ok_or("CNB 返回的用户信息缺少用户名")?;
        let mut groups = vec![];
        for page in 1.. {
            let values = array(
                versioned_request(
                    app,
                    cache.generation,
                    "organizations",
                    "get-groups-by-user-id",
                    strings(&[
                        "--username",
                        username,
                        "--page",
                        &page.to_string(),
                        "--page-size",
                        "100",
                    ]),
                    token,
                )
                .await?,
            )?;
            let count = values.len();
            groups.extend(values);
            if count < 100 {
                break;
            }
        }
        cache.groups = groups;
        cache.groups_at = Some(Instant::now());
        cache.snapshot.username = Some(username.into());
    }
    let mut orgs = vec![];
    for group in &cache.groups {
        let slug = group
            .get("path")
            .and_then(Value::as_str)
            .ok_or("CNB 返回的组织信息缺少路径")?;
        let mut org = OrgUsage {
            slug: slug.into(),
            name: group
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(slug)
                .into(),
            charge_forbidden: false,
            error: None,
            credit: None,
            git_storage: None,
            object_storage: None,
            dev_corehour: None,
            ci_corehour: None,
            dev_gpu_corehour: None,
        };
        let volume = versioned_call(
            app,
            cache.generation,
            "charge",
            "get-volume",
            strings(&["--slug", slug]),
            token,
        )
        .await;
        let volume = match volume {
            Ok(out) if out.kind == "NoPermission" => {
                org.charge_forbidden = true;
                orgs.push(org);
                continue;
            }
            Ok(out) if out.kind == "NotLoggedIn" => {
                return Err("认证失败：Token 无效或已过期，请在首页重新配置".into());
            }
            Ok(out) => cli::require_data(out),
            Err(error) => Err(error),
        };
        let limits = versioned_call(
            app,
            cache.generation,
            "charge",
            "get-quota",
            strings(&["--slug", slug]),
            token,
        )
        .await;
        let limits = match limits {
            Ok(out) if out.kind == "NoPermission" => {
                org.charge_forbidden = true;
                orgs.push(org);
                continue;
            }
            Ok(out) if out.kind == "NotLoggedIn" => {
                return Err("认证失败：Token 无效或已过期，请在首页重新配置".into());
            }
            Ok(out) => cli::require_data(out),
            Err(error) => Err(error),
        };
        match (volume, limits) {
            (Ok(volume), Ok(limits)) => {
                org.credit = quota(&volume, &limits, "credit_in_milli", 1000.0);
                org.git_storage = quota(&volume, &limits, "git_in_byte", 1_073_741_824.0);
                org.object_storage = quota(&volume, &limits, "object_in_byte", 1_073_741_824.0);
                org.dev_corehour = quota(&volume, &limits, "dev_in_sec", 3600.0);
                org.ci_corehour = quota(&volume, &limits, "ci_in_sec", 3600.0);
                org.dev_gpu_corehour = quota(&volume, &limits, "dev_gpu_in_sec", 3600.0);
            }
            (Err(error), _) | (_, Err(error)) => org.error = Some(error),
        }
        orgs.push(org);
    }
    cache.snapshot.orgs = orgs;
    cache.snapshot.updated_at = Some(now_ms());
    cache.snapshot.error = None;
    Ok(())
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcIssue {
    repo: String,
    number: u64,
    title: String,
    state: String,
    last_acted_at: String,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcSnapshot {
    issues: Vec<NpcIssue>,
    updated_at: Option<u64>,
    error: Option<String>,
    warnings: Vec<String>,
}
#[derive(Default)]
struct NpcCache {
    snapshot: NpcSnapshot,
    attempted: Option<Instant>,
    generation: u64,
    comments: std::collections::HashMap<String, (String, Vec<Value>)>,
}
#[tauri::command]
pub async fn npc_get(
    app: AppHandle,
    cli_state: State<'_, CliState>,
    state: State<'_, DataState>,
    force: bool,
) -> Result<NpcSnapshot, String> {
    let requested_at = Instant::now();
    let mut cache = state.npc.lock().await;
    let generation = cli_state.generation.load(Ordering::SeqCst);
    if cache.generation != generation {
        *cache = NpcCache {
            generation,
            ..Default::default()
        };
    }
    if cache.attempted.is_some_and(|at| at >= requested_at) {
        return Ok(cache.snapshot.clone());
    }
    if !force
        && cache
            .attempted
            .is_some_and(|at| at.elapsed() < Duration::from_secs(90))
    {
        return Ok(cache.snapshot.clone());
    }
    let generation = cli_state.generation.load(Ordering::SeqCst);
    if cache.generation != generation {
        *cache = NpcCache {
            generation,
            ..Default::default()
        };
    }
    let token = auth::current_token().await?;
    match collect_npc(&app, &mut cache, token.as_deref(), force).await {
        Ok(snapshot) => cache.snapshot = snapshot,
        Err(error) => cache.snapshot.error = Some(error),
    }
    let _guard = cli_state.call_lock.lock().await;
    if cli_state.generation.load(Ordering::SeqCst) != generation {
        *cache = NpcCache::default();
        return Ok(cache.snapshot.clone());
    }
    cache.attempted = Some(Instant::now());
    let snapshot = cache.snapshot.clone();
    let _ = app.emit("npc-changed", &snapshot);
    Ok(snapshot)
}
fn npc_groups(value: &Value) -> Vec<&Value> {
    value
        .pointer("/statuses/npc")
        .and_then(Value::as_array)
        .map(|groups| groups.iter().collect())
        .unwrap_or_default()
}
fn recent(value: &Value, seconds: i64) -> bool {
    value
        .get("created_at")
        .and_then(Value::as_str)
        .and_then(|date| chrono::DateTime::parse_from_rfc3339(date).ok())
        .is_some_and(|date| chrono::Utc::now().signed_duration_since(date).num_seconds() < seconds)
}
fn issue_state(issue: &Value, comments: &[Value]) -> &'static str {
    let latest = comments.first().unwrap_or(issue);
    if comments.is_empty() && npc_groups(issue).is_empty() {
        return "WAITING_REPLY";
    }
    let groups = npc_groups(latest);
    let checks: Vec<&Value> = groups
        .iter()
        .flat_map(|group| {
            group
                .get("statuses")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .collect();
    if checks
        .iter()
        .any(|check| check.get("state").and_then(Value::as_str) == Some("pending"))
        || groups.iter().any(|group| {
            group
                .pointer("/annotations/npc.work_mode")
                .and_then(Value::as_str)
                == Some("true")
                && recent(latest, 1800)
        })
    {
        return "NPC_WORKING";
    }
    let npc = latest
        .pointer("/author/is_npc")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if npc
        && checks.iter().any(|check| {
            matches!(
                check.get("state").and_then(Value::as_str),
                Some("error" | "failure")
            )
        })
    {
        return "NPC_FAILED";
    }
    if npc {
        return "NPC_REPLIED";
    }
    let body = latest.get("body").and_then(Value::as_str).unwrap_or("");
    let all_groups: Vec<&Value> = std::iter::once(issue)
        .chain(comments.iter())
        .flat_map(npc_groups)
        .collect();
    let mentioned = all_groups
        .iter()
        .filter_map(|group| group.pointer("/key/slug").and_then(Value::as_str))
        .any(|slug| {
            body.split_whitespace().any(|word| {
                word.trim_matches(|c: char| matches!(c, ',' | '，' | ':' | '：'))
                    .strip_prefix('@')
                    == Some(slug)
            })
        });
    if mentioned {
        "NPC_QUEUED"
    } else {
        "WAITING_REPLY"
    }
}
async fn collect_npc(
    app: &AppHandle,
    cache: &mut NpcCache,
    token: Option<&str>,
    force: bool,
) -> Result<NpcSnapshot, String> {
    let mut repos = vec![];
    for page in 1.. {
        let values = array(
            versioned_request(
                app,
                cache.generation,
                "repositories",
                "get-repos",
                strings(&[
                    "--role",
                    "Guest",
                    "--page-size",
                    "100",
                    "--page",
                    &page.to_string(),
                ]),
                token,
            )
            .await?,
        )?;
        let count = values.len();
        repos.extend(values);
        if count < 100 {
            break;
        }
    }
    let mut snapshot = NpcSnapshot::default();
    let mut active = std::collections::HashSet::new();
    for repo in repos {
        if repo.get("open_issue_count").and_then(Value::as_u64) == Some(0) {
            continue;
        }
        let Some(path) = repo.get("path").and_then(Value::as_str) else {
            continue;
        };
        let issues = versioned_request(
            app,
            cache.generation,
            "issues",
            "list-issues",
            strings(&[
                "--repo",
                path,
                "--state",
                "open",
                "--order-by=-last_acted_at",
                "--page-size",
                "20",
            ]),
            token,
        )
        .await;
        let issues = match issues.and_then(array) {
            Ok(issues) => issues,
            Err(_) => {
                snapshot.warnings.push(format!(
                    "{path}：无法读取 Issue，请检查 repo-issue:r 和仓库访问范围"
                ));
                continue;
            }
        };
        for issue in issues {
            let number = issue
                .get("number")
                .and_then(|value| {
                    value
                        .as_u64()
                        .or_else(|| value.as_str().and_then(|number| number.parse().ok()))
                })
                .ok_or("CNB 返回的 Issue 编号格式异常")?;
            let acted = issue
                .get("last_acted_at")
                .or_else(|| issue.get("updated_at"))
                .or_else(|| issue.get("created_at"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let key = format!("{path}#{number}");
            active.insert(key.clone());
            let cached = cache
                .comments
                .get(&key)
                .filter(|(previous, comments)| {
                    !force && *previous == acted && issue_state(&issue, comments) != "NPC_WORKING"
                })
                .map(|(_, comments)| comments.clone());
            let comments = match cached {
                Some(comments) => comments,
                None if issue.get("comment_count").and_then(Value::as_u64) == Some(0) => vec![],
                None => {
                    match versioned_request(
                        app,
                        cache.generation,
                        "issues",
                        "list-issue-comments",
                        strings(&[
                            "--repo",
                            path,
                            "--number",
                            &number.to_string(),
                            "--sort=-created",
                            "--page-size",
                            "5",
                        ]),
                        token,
                    )
                    .await
                    .and_then(array)
                    {
                        Ok(comments) => comments,
                        Err(_) => {
                            snapshot.warnings.push(format!("{path}#{number}：无法读取评论，请检查 repo-notes:r；未推断该任务状态"));
                            continue;
                        }
                    }
                }
            };
            let state = issue_state(&issue, &comments).to_string();
            cache.comments.insert(key, (acted.clone(), comments));
            snapshot.issues.push(NpcIssue {
                repo: path.into(),
                number,
                title: issue
                    .get("title")
                    .and_then(Value::as_str)
                    .unwrap_or("未命名 Issue")
                    .into(),
                state,
                last_acted_at: acted,
            });
        }
    }
    cache.comments.retain(|key, _| active.contains(key));
    snapshot
        .issues
        .sort_by(|a, b| b.last_acted_at.cmp(&a.last_acted_at));
    snapshot.updated_at = Some(now_ms());
    Ok(snapshot)
}

async fn versioned_request(
    app: &AppHandle,
    generation: u64,
    module: &str,
    tool: &str,
    args: Vec<String>,
    token: Option<&str>,
) -> Result<Value, String> {
    cli::require_data(versioned_call(app, generation, module, tool, args, token).await?)
}
async fn versioned_call(
    app: &AppHandle,
    generation: u64,
    module: &str,
    tool: &str,
    args: Vec<String>,
    token: Option<&str>,
) -> Result<cli::CliOutput, String> {
    let state = app.state::<CliState>();
    let _guard = state.call_lock.lock().await;
    if state.generation.load(Ordering::SeqCst) != generation {
        return Err("认证信息已变更".into());
    }
    cli::call_with_token(app, module, tool, args, token).await
}

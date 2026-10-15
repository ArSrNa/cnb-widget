# 数据层 Spec

## 1. cnb-cli 封装（`cli.rs`，已实现）

- **安装**：从官方 release 下载预编译平台二进制（darwin/linux/windows × x64/arm64），安装到 `<app_data_dir>/bin/cnb`；最新版本号取自 npm registry（`@cnbcool/cnb-cli` 的 latest tag 与 release tag 同号）；未安装时回退系统 PATH 中的 `cnb`；
- **统一入口**：`cnb_call(module, tool, args)` → spawn `cnb <module> <tool> [args...] -v`，解析 stdout 的 `{status, data}` 信封 JSON；
- **错误分类**：
  - `status: 403` / `has no permission` → `NoPermission`，UI 隐藏对应维度（指数退避至 30min，不反复重试）；
  - stderr `not found` / spawn 失败 → `NotInstalled`，展示安装引导；
  - 401 / `cnb status` 非登录 → `NotLoggedIn`，首页引导填写 Token 或复用 CLI 登录态；
- **约束**：单次 15s 超时；所有调用全局串行化（tokio Mutex），避免并发触发限流。

## 2. 数据集与刷新策略

| 数据集 | 来源命令 / 端点 | 频率（默认） | 备注 |
|---|---|---|---|
| 身份 | `users get-user-info` | 启动 1 次 | — |
| 组织列表 | `organizations get-groups-by-user-id` | 6h | 当前读取全部所属组织，组织白名单尚未实现 |
| 仓库列表 | `repositories get-repos --role Guest --page-size 100`，按 `--page` 翻页 | 随 NPC 快照采集，缓存 90s | 当前账号 / Token 授权范围；跳过明确没有 open Issue 的仓库 |
| Issue 列表 | `issues list-issues --repo <repo> --state open --order-by=-last_acted_at --page-size 20` | 随 NPC 快照采集 | 每仓库仅取最近活跃的前 20 个 open Issue，不继续翻页 |
| Issue 评论 | `issues list-issue-comments --repo <repo> --number <n> --sort=-created --page-size 5` | 随 Issue 采集；未变化且非工作中时复用缓存 | 最多读取最近 5 条；工作中或强制刷新时重新读取；明确无评论时跳过请求 |
| NPC 观测（后续增强，未接入） | `/{org}/-/npc-observability/actions` | 未实现 | 当前完全由 Issue / 评论推导状态 |
| 组织用量（六维度） | `charge get-volume --slug <org>`（本月已用）+ `charge get-quota --slug <org>`（月度额度） | 30min | ✅ 2026-10-13 实测 owner 组织可读；字段映射见下；成员组织 403 → 该组织用量降级隐藏 |
| 特权额度（可选） | `charge get-special-amount --slug <org>` | 6h | 核时/GiB/credit 特权明细，仅在详细面板展示 desc 与数值 |
| 构建日志 AI audit 聚合（备选） | 直连 `/{repo}/-/build/logs` → `/-/build/logs/ai-audit/{sn}/{pipeline}` 逐日聚合 | 30min | owner 组织 charge 不可用时的备选 credit 路线（按模型明细），首版不实现 |

> **charge 路线决策（2026-10-13 实测修正）**：内置 cnb-cli token 对 **owner 组织**可读 `get-volume` / `get-quota`（200），六维度（AI Credits、代码仓库存储、对象存储、构建 CPU、开发 CPU、开发 GPU）直接可得；**成员组织 403** —— 该组织用量维度优雅降级（详细面板「无权限查看」，悬浮球汇总口径跳过），不影响 issue/NPC 维度。原「构建日志聚合为默认路线」方案作废，降级为备选。

### charge 字段映射与单位换算

| 展示维度 | 已用（get-volume） | 额度（get-quota.data.<k>） | 换算 |
|---|---|---|---|
| AI Credits | `credit_in_milli` | `credit_in_milli.total` | milli ÷ 1000 = Credits |
| 代码仓库存储 | `git_in_byte` | `git_in_byte.total` | byte ÷ 2³⁰ = GiB |
| 对象存储 | `object_in_byte` | `object_in_byte.total` | byte ÷ 2³⁰ = GiB |
| 云原生构建-CPU | `ci_in_sec` | `ci_in_sec.total` | sec ÷ 3600 = 核时 |
| 云原生开发-CPU | `dev_in_sec` | `dev_in_sec.total` | sec ÷ 3600 = 核时 |
| 云原生开发-GPU | `dev_gpu_in_sec` | `dev_gpu_in_sec.total` | sec ÷ 3600 = 核时 |

- 六项由同一份 get-volume / get-quota 响应读取；每个组织仍仅需两个 charge 请求。前端设置与详情维度共用资源定义，统一标签和单位。
- Git 存储不含 LFS；对象存储包含 Git LFS、制品、Release 和 commit 附件。

- 百分比口径：`已用 ÷ total`；冻结额度（`freeze_dev_in_sec` / `freeze_credit_in_milli`）暂不计入分母，详细面板单独标注；
- `get-quota` 的 `free` 为月度免费额度（已含在 total 内），面板「剩余」= total − 已用。

- **监控范围**：当前为账号与 Token 可访问资源；组织白名单制为后续配置意图（见 [../intent/data.md](../intent/data.md) §3）。
- **缓存**：当前共享 Rust 内存快照；退出快照到 `<app_data_dir>/cache.json` 与启动先渲染磁盘缓存留待后续。
- **NPC 请求成本示例**：10 个有 open Issue 的仓库，每仓库读取 1 次 Issue 列表、约 3 次评论，则约 40 次请求 / 轮，另加仓库列表分页请求。首次采集或强制刷新可能读取更多评论；请求全局串行，没有额外固定 500ms 间隔。

## 3. Issue 状态推导规则（核心业务逻辑）

当前实现位于 [`src-tauri/src/data.rs`](../../src-tauri/src/data.rs) 的 `collect_npc` / `issue_state`，前端标签位于 [`src/lib/npc.ts`](../../src/lib/npc.ts)。数据来自 CNB CLI 的真实响应，展示状态由应用本地推导；统计单位是 **Issue 数量**，每个 Issue 只归入一种状态。

分类优先读取最新一条评论；没有评论时读取 Issue 本身。以下称其为「最新内容」。若没有评论，且 Issue 本身没有 `statuses.npc` 分组，直接归为 `WAITING_REPLY`；其余情况按下表自上而下匹配，命中即停止。

| 优先级 | 显示状态 | 内部状态 | 当前判断条件 |
|---|---|---|---|
| 1 | 工作中 | `NPC_WORKING` | 最新内容的 `statuses.npc[].statuses[].state` 中存在 `pending`；或某个 NPC 分组的 `annotations["npc.work_mode"]` 为字符串 `"true"`，且最新内容的 `created_at` 距今不足 1800 秒 |
| 2 | 失败 | `NPC_FAILED` | 最新内容的 `author.is_npc == true`，且其 NPC 状态中存在 `error` 或 `failure` |
| 3 | 待回复 | `NPC_REPLIED` | 最新内容的 `author.is_npc == true`，且未命中更高优先级规则；不要求存在 `success` 状态 |
| 4 | 已派发 | `NPC_QUEUED` | 最新内容未标记为 NPC 作者，正文中有可识别的 `@<npc-slug>` 提及 |
| 5 | 等待人 | `WAITING_REPLY` | 其余情况，包括普通用户发言且无可靠 NPC 提及、没有评论且无 NPC 状态 |

「已派发」中的 NPC 标识必须来自 Issue 或最近 5 条评论的 `statuses.npc[].key.slug`。正文按空白拆分，移除词两端的中英文逗号、冒号后匹配 `@<npc-slug>`；不会把任意 `@用户名` 当作 NPC，也没有“评论后 5 分钟内出现流水线”这一额外判断。

### 3.1 采集、刷新与缓存

1. `useNpc` 挂载时请求 `npc_get`，此后每 90 秒请求一次；后端使用所有窗口共享的 Rust 内存快照，普通请求在上次采集完成后 90 秒内复用快照。采集为轮询，不是服务端实时推送，实际更新还受串行请求耗时影响。
2. 快照需要重新采集时，先分页读取授权仓库，再逐仓库读取前 20 个 open Issue 及其最近 5 条评论。仅按授权范围采集，没有组织白名单、当前用户参与或指派人筛选。
3. 评论按 `仓库路径#Issue编号` 缓存；Issue 活动时间未变，且按缓存评论推导的状态不是 `NPC_WORKING` 时，复用评论。活动时间优先取 `last_acted_at`，缺失时依次回退 `updated_at`、`created_at`。工作中任务每轮重新读取评论，即使活动时间未变。
4. “刷新任务”按钮调用 `npc_get(force=true)`，绕过 90 秒快照缓存和评论复用。切换认证后清空旧账号缓存并重新读取。
5. 采集完成后广播 `npc-changed`，各窗口同步同一份快照。

### 3.2 统计范围与已知边界

- 每仓库仅统计最近活跃的前 20 个 open Issue，不包含已关闭 Issue，也不是仓库全量任务统计；多个 NPC 在同一 Issue 中活动仍只计为一个 Issue。
- “待回复”表示最新内容来自 NPC，未判断具体在等谁回复；也未判断该回复是否表示任务完成。“等待人”是兜底分类，不能据此确认存在某个人的待办。
- “工作中”规则优先于“失败”，且 `pending` 没有超时上限。1800 秒阈值只用于 `npc.work_mode`，取最新内容的创建时间，不取 status 创建时间；阈值当前硬编码，未提供配置或 UI 设置。
- 读取仓库的 Issue 列表失败时跳过该仓库，读取评论失败时跳过该 Issue，并在 `warnings` 中记录原因；数据读取失败不会归为 `NPC_FAILED`。整体采集失败时保留上次快照并设置 `error`。
- NPC 动态页显示读取告警及当前可用列表；刘海主计数在未更新、存在 `error` 或任一 `warning` 时显示暂无数据，展开区的状态徽标仍按当前快照计数。刘海主计数可在工作中、待回复、失败三种状态中选择，不随左侧用量组织选择而过滤。
- `npc.work_mode` 和 NPC status 字段的变化可能影响推导结果；当前没有接入独立的 NPC 运行状态接口。

# 数据层 Spec

## 1. cnb-cli 封装（`cli.rs`，已实现）

- **安装**：从官方 release 下载预编译平台二进制（darwin/linux/windows × x64/arm64），安装到 `<app_data_dir>/bin/cnb`；最新版本号取自 npm registry（`@cnbcool/cnb-cli` 的 latest tag 与 release tag 同号）；未安装时回退系统 PATH 中的 `cnb`；
- **统一入口**：`cnb_call(module, tool, args)` → spawn `cnb <module> <tool> [args...] -v`，解析 stdout 的 `{status, data}` 信封 JSON；
- **错误分类**：
  - `status: 403` / `has no permission` → `NoPermission`，UI 隐藏对应维度（指数退避至 30min，不反复重试）；
  - stderr `not found` / spawn 失败 → `NotInstalled`，展示安装引导；
  - `cnb status` 非登录 → `NotLoggedIn`，展示「运行 cnb login」引导；
- **约束**：单次 15s 超时；所有调用全局串行化（tokio Mutex），避免并发触发限流。

## 2. 数据集与刷新策略

| 数据集 | 来源命令 / 端点 | 频率（默认） | 备注 |
|---|---|---|---|
| 身份 | `users get-user-info` | 启动 1 次 | — |
| 组织列表 | `organizations get-groups-by-user-id` | 6h | 与组织白名单求交集 |
| 仓库列表 | `repositories get-repos --page-size 100` 翻页 | 10min | 按 `path` 前缀聚合组织维度汇总：Σ `open_issue_count`、`npc_created_pull_count`、`npc_builded_count` |
| Issue 列表 | `issues list-issues --state open --order-by -last_acted_at` | 90s（仅白名单仓库） | 只拉 open，取前 N 条活跃 |
| Issue 评论 | `issues list-comments --page-size 5` | 随 issue 轮询，仅当 `last_acted_at` 变化 | 500ms 间隔串行 |
| NPC 观测（可选增强） | 直连 `/{org}/-/npc-observability/actions` | 30min | 需 Reporter+；缺失时降级为纯 issue 推导 |
| credit 用量（方案 A） | 直连 `/{repo}/-/build/logs` → `/-/build/status/{sn}` + `/-/build/logs/ai-audit/{sn}/{pipeline}` 逐日聚合 | 30min | 只需构建日志读权限；按模型明细；聚合成本高，仅对白名单组织执行 |
| credit 额度（方案 B） | 直连 `/group/-/charge/repos-volume` 等 | 30min | 需高权限 token（PAT / 管理员令牌）；403 时隐藏用量维度 |
| token 用量（备选指标） | 方案 B 同源（`charge_type_token`） | 30min | 用户可切换展示指标 |

> **credit 路线决策**：A（构建审计聚合）权限门槛低、口径细，作为默认路线；B（charge 接口）在用户配置了高权限 token 时启用，提供 quota 口径。两条路线都失败 → 该组织隐藏用量维度，不影响 NPC 面板。

- **监控范围**：组织白名单制（见 [../intent/data.md](../intent/data.md) §3）。
- **缓存**：内存为主；退出时快照到 `<app_data_dir>/cache.json`，启动先渲染缓存再后台刷新。
- **成本估算**：10 仓库 × (1 issue 列表 + ~3 变更评论) ≈ 40 次/90s；credit 聚合按日缓存（当日 15s 短缓存、历史日长缓存）。

## 3. Issue 状态推导规则（核心业务逻辑）

对每个 open issue，按最新评论推导状态（优先级自上而下）：

```
1. 最新评论 statuses.npc[] 存在未终结 pending，
   或 npc.work_mode == "true" 且该 status 创建于 30min 内
      → NPC_WORKING（工作中）           🟡 呼吸动画
2. 最新评论 author.is_npc == true 且 npc status state == "error"
      → NPC_FAILED（失败，等待人）       🔴
3. 最新评论 author.is_npc == true
      → NPC_REPLIED（已回复，等待人）    🔵
4. 最新评论 author 为人 且 body 含 @<npc-slug>（或评论后 5min 内出现 npc pipeline status）
      → NPC_QUEUED（已派发，NPC 未响应） 🟠
5. 最新评论 author 为人，无 @npc
      → WAITING_REPLY（等待人/闲置）     ⚪ 仅展开面板显示，不占胶囊
```

- 「30min」等阈值进配置文件，初版不做成 UI 设置；
- 已知边界：无评论的 open issue 落入状态 5；`npc.work_mode` 字段可靠性待观察；
- 推导规则集中在一个模块，字段变动时只改一处。

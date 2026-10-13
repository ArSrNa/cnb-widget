# CNB Island — 决策记录（Intent + Decision）

> 状态：草案 v0.1（2026-10-13）
> 配套文档：[spec.md](./spec.md)（详细规格）

## 1. 产品意图

做一个 macOS 灵动刘海（Notch）常驻 widget，参考 CodexIsland 展示 Codex 用量的形态，展示 **CNB 平台**的：

1. **组织 credit 用量** — 按「能获取到 credit 用量的组织」分维度展示，实时感知剩余额度；
2. **NPC 工作动态** — 聚合各仓库 open issue，区分「NPC 正在工作中 / NPC 已回复（等待人）/ NPC 已失败 / 等待 NPC 接手」，一眼掌握当前 CNB 上的 AI 工作情况。

核心用户场景：开发者日常在多个 CNB 组织下同时跑 NPC 任务，需要在不切换窗口的前提下，瞥一眼刘海就知道「额度还剩多少、哪些 NPC 在跑、哪些在等我回复」。

## 2. 数据源：cnb-cli 能力调研结论（2026-10-13 实测，cnb-cli 1.17.32）

### 2.1 已验证可用 ✅

| 能力 | 命令 | 关键字段 | 用途 |
|---|---|---|---|
| 当前用户 | `cnb users get-user-info` | `username`、`group_count` | 确定身份、引导监控范围 |
| 组织列表 | `cnb organizations get-groups-by-user-id --username <u>` | `path`、`name`、`member_count` | 组织维度的基础列表 |
| 我的仓库 | `cnb repositories get-repos` | `path`、`open_issue_count`、`open_pull_request_count`、`npc_created_pull_count`、`npc_merged_pull_count`、`npc_builded_count` | **低成本聚合组织维度的 NPC 活跃度**，无需遍历 issue |
| Issue 列表 | `cnb issues list-issues --repo <o/r> --state open` | `author.is_npc`、`comment_count`、`last_acted_at`、`assignees`、`labels` | NPC 工作面板主数据 |
| Issue 评论 | `cnb issues list-comments --repo <o/r> --number <n>` | `author.is_npc`、`created_at`、**`statuses.npc[].statuses[].state`（success/error）**、`npc.work_mode`、`pipeline_id`、`target_url`、任务清单 JSON | **判断「工作中/已回复/失败」的关键信号** |

### 2.2 受限待解决 ⚠️

| 能力 | 命令 | 实测结果 | 分析 |
|---|---|---|---|
| 组织月度额度 | `cnb charge get-quota --slug <org>` | 403 `User has no permission`（对用户自有组织同样 403） | 需 `group-resource:r` 权限。疑似 `cnb_cli` 内置 OAuth client 的 token 不含该 scope，或需组织 owner 角色 |
| 组织资源用量 | `cnb charge get-volume / get-repos-volume`（含 `charge_type_credit`/`charge_type_token`） | 同上 403 | credit/token 用量展示被阻塞，**是本次最大的不确定性** |
| NPC 调用/PR 记录 | `cnb npc-observability npc-observability-actions/prs` | 403 `Only Reporter and above`（自有仓库也 403） | 疑似同类 scope 问题。**非必需**：issue 评论里的 NPC pipeline 状态可替代 |

**结论**：Issue/NPC 动态维度数据完备，可立即开工；credit 用量维度取决于权限问题解决与否，设计上将其定义为「可选数据源，缺失时优雅降级」。

## 3. 技术选型决策

### 决策：Tauri v2 + tauri-nspanel

| 备选 | 结论 | 理由 |
|---|---|---|
| **Tauri v2** | **采用** | 24/7 常驻应用，内存占用 30~80MB（Electron 需 200~400MB）；`tauri-nspanel` 社区插件直接提供 NSPanel + nonactivating 能力，正对本场景 |
| Electron | 备选（放弃） | 生态参考多（NotchDrop 等），但常驻内存开销不可接受；NSPanel 需自写 native module |
| Swift 原生 | 放弃 | 交互细节（展开面板、动画）用 Web 技术迭代更快；单人项目维护成本高 |

### 关键架构决策

1. **数据层走 cnb-cli 子进程，而非直接实现 CNB OpenAPI 客户端**（已确认，2026-10-13）
   - 复用用户已有的 `cnb login` 登录态与 token 生命周期，widget 自己不做 OAuth；
   - CLI 输出结构化 JSON（`-v`），解析稳定；
   - 例外：charge/credit 类接口内置 token 无权限，走 **PAT + 直连 OpenAPI**（见 spec §2.2）；
   - 路线图：后续版本内置 OAuth 设备授权流，去掉 cnb-cli 安装依赖；
   - 代价：当前要求用户安装 cnb-cli —— 目标用户（CNB 重度用户）大概率已安装，检测到缺失时给下载引导。
2. **刘海几何探测用屏幕录制权限**（CGDisplayStream 探测 notch frame），与 CodexIsland/NotchNook 同方案；无权限时降级为「贴顶居中悬浮胶囊」。
3. **窗口为 NSPanel + nonactivating**，不抢焦点；非交互区域 `setIgnoreMouseEvents` 穿透。
4. **前端框架：Svelte 5**（体积极小、响应式状态机适合刘海动画），如无强偏好可替换为 React。

## 4. MVP 边界

- **做**：issue/NPC 工作状态面板（全功能）、组织 credit 用量（权限就绪后接入，未就绪时隐藏该维度）、收起/展开/事件提醒三种形态。
- **不做（首版）**：NPC-observability 增强数据、多账号、Windows/Linux、点击跳转之外的深度交互（如直接在刘海回复 issue）、数据统计图表。

详细规格见 [spec.md](./spec.md)。

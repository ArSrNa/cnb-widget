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
| 组织月度额度 | `cnb charge get-quota --slug <org>` | **owner 组织 200 ✅**（2026-10-13 复测修正）；成员组织 403 `User has no permission` | `group-resource:r` 对 owner 组织放行，成员组织仍拒绝 |
| 组织资源用量 | `cnb charge get-volume`（含 `credit_in_milli`/`dev_in_sec`/`ci_in_sec` 等） | **owner 组织 200 ✅**；成员组织 403 | 三维度数据直接可得，见 spec/data.md 字段映射；成员组织降级隐藏 |
| NPC 调用/PR 记录 | `cnb npc-observability npc-observability-actions/prs` | 403 `Only Reporter and above`（自有仓库也 403） | 疑似同类 scope 问题。**非必需**：issue 评论里的 NPC pipeline 状态可替代 |

**结论（2026-10-13 更新）**：Issue/NPC 动态维度数据完备；credit/核时用量维度在 **owner 组织**直接可用，成员组织优雅降级。原「credit 维度被权限阻塞」的判断作废。

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
2. **刘海几何探测**：分级方案（2026-10-13 修订）——「刘海屏可用性」探测用 `NSScreen.safeAreaInsets`（macOS 12+，无需权限）+ `hw.model` 型号兜底，提前实施；原 CGDisplayStream 屏幕录制权限方案保留为 M4「精确贴合刘海 frame」的增强项。
3. **窗口为 NSPanel + nonactivating**，不抢焦点；非交互区域 `setIgnoreMouseEvents` 穿透。
4. **前端框架：React 19 + shadcn/ui + Tailwind v4**（Vite；全部 UI 由 shadcn 组件组合，刘海与悬浮球使用 Button 的命名变体）。

## 4. MVP 边界

- **做**：issue/NPC 工作状态面板（全功能）、组织 credit 用量（权限就绪后接入，未就绪时隐藏该维度）、收起/展开/事件提醒三种形态。
- **不做（首版）**：NPC-observability 增强数据、多账号、Windows/Linux、点击跳转之外的深度交互（如直接在刘海回复 issue）、数据统计图表。

详细规格见 [spec.md](./spec.md)。

## 5. 需求变更：应用分区与悬浮球定形（2026-10-13 需求评估）

### 5.1 应用分区

- **主面板**（设置/连接）与**展示层**（悬浮球 + 灵动刘海）职责分离；主面板控制展示层的显隐与用量口径（组织 × 维度）；
- 灵动刘海仅 MacBook 刘海屏可用：能力探测见 spec/notch-ui.md §4，不满足时主面板开关禁用。

### 5.2 悬浮球与气泡面板定形（2026-10-13 已确认）

- 原形态参考 360 加速球；§7 全 UI 重构后采用 shadcn 圆形 Button，内部百分比 + Progress，取消表面自绘例外；
- 点击弹出**气泡详细面板**（独立 NSPanel + nonactivating，不抢焦点），刘海与悬浮球行为一致；`tauri-nspanel` 引入时间从 M4 提前至 M3；
- 详细面板展示各组织用量余额（逐组织 × 三维度，403 组织降级提示）+ issue NPC 对话（状态计数 + 活跃列表）；
- **主面板随之重构为设置中心**：原 home 概览视图（用量/issue 列表）迁至气泡面板，主面板只留显隐、口径、连接。

### 5.3 用量维度与口径（2026-10-13 已确认）

- credit 单维度 → 三维度：credit / 云原生开发核时（`dev_in_sec`）/ 云原生构建核时（`ci_in_sec`）；GPU 核时与存储字段已就绪，首版不做；
- 数据源实测确认（见 §2.2 修正）：owner 组织 charge 可读，成员组织 403 逐组织降级；
- 悬浮球/刘海 idle 口径 = **单选组织 × 单选维度**（`usageMetric` × `usageOrg`），组织选项 = 白名单 ∩ owner 组织；刘海与悬浮球共用同一口径配置。

## 6. 需求变更：主面板工作台化与组织二级导航（2026-10-13 需求）

- 主面板由「纯设置中心」（§5.2）调整为**工作台**：左右布局，左侧一级导航（用量详情 / NPC 动态 / 设置），顶部全局横栏移除；「用量详情」下挂组织二级菜单（含组织头像）；与气泡面板分工不变（气泡 = 瞥一眼，主面板 = 完整明细 + 设置）。意图见 [intent/panel.md](./intent/panel.md)；
- 组织头像实测：`https://cnb.cool/{orgPath}/-/logos/s|l` 公开可访问（无需登录；不存在则 404，前端降级首字母）；组织接口本身无头像字段（见 [spec/panel-ui.md](./spec/panel-ui.md) §5）；
- 间距与密度问题一并修复：统一间距刻度与卡片 / 列表密度规范（见 [spec/panel-ui.md](./spec/panel-ui.md) §2）。

## 7. 全 UI 重构与间距修正（2026-10-13）

- 所有 UI 使用官方 shadcn/ui 组件组合；新增组件经官方 CLI 获取，桌面特殊尺寸通过组件命名变体表达。
- 移除样式层外的全局 margin/padding 清零；基础窗口几何放进 `@layer base`，允许 Tailwind utilities 正常控制间距。
- padding 是组件内留白的标准做法；gap 控制相邻元素间距，二者都需要。取消「组件不得调整密度 / 页面不得覆盖 padding」的硬性限制。
- 内容区 16–24px，卡片 24px，列表行 16px，区块间 24px；所有页面使用同一布局与语义配色。

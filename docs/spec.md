# CNB Island — 详细规格（Spec）

> 状态：草案 v0.1（2026-10-13）
> 前置阅读：[decision.md](./decision.md)
> 标注 🚫 的条目依赖待确认问题（见 §9），设计上均可降级

## 1. 总体架构

```
┌─────────────────────────────────────────────┐
│ macOS App (Tauri v2)                        │
│                                             │
│  Frontend (Svelte 5, WebView)               │
│   ├─ NotchWindow   刘海胶囊 + 展开面板（UI 状态机）  │
│   └─ ← IPC(Tauri command/event) ─┐          │
│                                  │          │
│  Rust Core                       │          │
│   ├─ Collector   轮询调度 + 增量拉取        │
│   ├─ Store       内存态 + 磁盘快照(缓存)     │
│   ├─ NotchProbe  屏幕录制探测刘海 frame 🚫    │
│   ├─ Panel       tauri-nspanel / NSPanel    │
│   └─ Cli         spawn `cnb` 子进程封装      │
└────────────┬────────────────────────────────┘
             │ 子进程 JSON
        cnb-cli (用户已 login 的 token)
             │ HTTPS
        CNB OpenAPI
```

## 2. 数据层 Spec

### 2.1 cnb-cli 封装（`Cli` 模块）

- 统一入口：`fn call(tool: &str, args: &[&str]) -> Result<Json>`，spawn `cnb <module> <tool> ... -v`，解析 stdout JSON；
- 识别失败模式：
  - `status: 403` + `errmsg` → 标记该数据源 `NoPermission`，UI 隐藏对应维度（不反复重试，指数退避至 30min）；
  - stderr 含 `not found` / spawn 失败 → 判定 cnb-cli 未安装，展示引导；
  - `cnb status` 非登录 → 展示「运行 cnb login」引导。
- 超时：单次调用 15s；所有调用串行化（避免并发触发限流）。

### 2.2 数据集与刷新策略

| 数据集 | 命令 | 频率（默认） | 备注 |
|---|---|---|---|
| 身份 | `users get-user-info` | 启动 1 次 | — |
| 组织列表 | `organizations get-groups-by-user-id --page-size 100` | 6h | 与用户配置的监控范围求交集 |
| 仓库列表 | `repositories get-repos --page-size 100` 翻页 | 10min | 一次拉全量（数百级规模），内存中按 `path` 前缀聚合出**组织维度汇总**：Σ `open_issue_count`、`npc_created_pull_count`、`npc_builded_count` |
| Issue 列表 | `issues list-issues --state open --order-by -last_acted_at --page-size 30`（每仓库） | 90s（仅监控清单内的仓库） | 只拉 open；取前 N 条活跃 |
| Issue 评论 | `issues list-comments --page-size 5`（每活跃 issue 取最新页） | 随 issue 轮询，但**仅当 issue 的 `last_acted_at` 变化时** | 500ms 间隔串行，避免突发 |
| credit 额度 🚫 | OpenAPI `charge get-quota` 等价接口（widget 直连，用 PAT） | 30min | 无 PAT 或 403 时该组织隐藏用量维度 |
| credit 用量 🚫 | OpenAPI 组织资源用量接口（`charge_type_credit` / `charge_type_token`，widget 直连） | 30min | 同上 |

> **已确认（2026-10-13）**：cnb_cli 内置 token 拿不到 `group-resource:r`，credit 维度采用 **PAT 方案**——设置页引导用户创建勾选「组织资源读（group-resource:r）」权限的 personal access token，widget 对 charge 类接口**直连 OpenAPI**（仅这两个数据集不走 cnb-cli），PAT 仅存 macOS Keychain。

- **监控范围（已确认）**：**组织白名单**制——首次启动从所属组织勾选，空选等于未完成配置；白名单内仓库默认全量，支持 `org/repo` 级排除。
- **缓存**：内存为主；退出时快照到 `~/Library/Application Support/cnb-island/cache.json`，启动先渲染缓存再后台刷新。
- **成本估算**：10 仓库 × (1 issue 列表 + ~3 变更评论) ≈ 40 次/90s，串行 + 变更检测足够保守。

### 2.3 Issue 状态推导规则（核心业务逻辑）

对每个 open issue，按最新评论推导状态（优先级自上而下）：

```
1. 最新一条评论的 statuses.npc[] 中存在 state ∈ {pending} 未终结，
   或 npc.work_mode == "true" 且该 status 创建于 30min 内
      → NPC_WORKING（工作中）           🟡 动画：呼吸/进度
2. 最新一条评论的 author.is_npc == true
   且其 npc status state == "error"
      → NPC_FAILED（NPC 失败，等待人）   🔴
3. 最新一条评论的 author.is_npc == true
      → NPC_REPLIED（NPC 已回复，等待人）🔵
4. 最新一条评论 author 为人 且 body 含 @<npc-slug>（或评论后 5min 内出现 npc pipeline status）
      → NPC_QUEUED（已派发，NPC 未响应） 🟠
5. 最新一条评论 author 为人，无 @npc
      → WAITING_REPLY（等待人回复/闲置）  ⚪ 仅在展开面板显示，不占胶囊
```

- 「30min 内」等阈值进入配置文件，初版不做成 UI 设置。
- **已知边界**：无评论的 open issue 落入状态 5；`npc.work_mode` 字段可靠性待观察（§9-Q3）。

## 3. UI Spec（刘海形态状态机）

### 3.1 几何与权限

- 🚫 有屏幕录制权限：CGDisplayStream 探测含摄像头开孔的内建屏 notch frame（宽高 + x 偏移），胶囊精确贴合刘海两侧；
- 无权限/外接显示器：降级为顶部居中悬浮胶囊（宽 180pt），设置页提示可授权增强。

### 3.2 形态

| 形态 | 触发 | 内容 | 尺寸 |
|---|---|---|---|
| **Idle 收起** | 默认 | 刘海左右各一枚小胶囊：左侧 credit 剩余环形进度（🚫 无权限时隐藏），右侧圆点矩阵（每个工作中的 NPC 一点，黄=工作中 红=失败 蓝=待回复） | 每侧 ≤ 90×24pt |
| **Peek 悬停** | 鼠标移入 | 展开为横条：组织名 + credit bar、正在工作的 issue 标题滚动、各状态计数 | ~480×36pt |
| **Panel 展开** | 点击 | 完整面板：组织分区（额度进度条 + 本月用量 🚫）→ 活跃 issue 列表（状态徽标 / 仓库 / 标题 / 最后动作时间 / 点击浏览器打开 issue） | ~560×420pt，NSPanel 附着刘海下方 |
| **Event 弹出** | 状态跃迁事件 | 「NPC ✅ 完成 xxx」「NPC ❌ 失败 xxx」横幅，6s 自动收回 | Peek 尺寸，出现在 Idle 之上 |

### 3.3 事件与提醒

- 状态跃迁 → `NPC_WORKING→NPC_REPLIED`（蓝点+横幅）、`→NPC_FAILED`（红点+横幅+可选系统通知）；
- credit 剩余 🚫 低于阈值（默认 20%）→ 环变红，一次性提醒；
- 免打扰：检测到前台 App 为全屏时，Event 只收进胶囊不打横幅。

## 4. 窗口/系统集成 Spec

| 项 | 方案 |
|---|---|
| 窗口 | NSPanel（tauri-nspanel），`nonactivating` 样式，不抢焦点 |
| 层级 | `NSStatusWindow` 级别；全屏 space 下 `visibleOnAllWorkspaces` + 收起为胶囊 |
| 鼠标穿透 | Idle 态胶囊外区域 `setIgnoreMouseEvents(true, forward)`；hover/Panel 恢复 |
| 多显示器 | 跟随含刘海的内建屏；无刘海屏时居中胶囊 |
| 自启动 | `SMAppService`（LoginItem），设置页开关 |
| 权限 | 屏幕录制（可选增强）；无辅助功能需求 |
| 菜单栏 | 同时提供一个 NSStatusItem 图标作为兜底入口（打开面板/设置/退出） |

## 5. 工程结构（Tauri v2）

```
cnb-island/
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs / lib.rs      // 入口
│  │  ├─ panel.rs              // NSPanel 管理
│  │  ├─ notch_probe.rs        // 刘海几何 🚫
│  │  ├─ cli.rs                // cnb-cli 封装
│  │  ├─ collector.rs          // 轮询调度
│  │  ├─ model.rs              // 数据模型 + 状态推导
│  │  └─ store.rs              // 缓存
│  └─ tauri.conf.json
├─ src/                        // Svelte 5
│  ├─ App.svelte
│  ├─ states/                  // idle / peek / panel / event
│  └─ components/
└─ docs/
```

## 6. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M1 骨架 | Tauri v2 + nspanel 贴顶胶囊显示假数据，hover/点击形态切换 | 胶囊不抢焦点、穿透正确 |
| M2 数据 | cli.rs + collector + 状态推导，真实 issue 数据上胶囊 | 状态点与 CNB 网页一致 |
| M3 面板 | Panel 展开：组织/issue 列表、点击跳转、Event 横幅 | 全状态机走通 |
| M4 刘海 | notch-probe + 权限流 + 精确贴合 | 内建屏贴合刘海 |
| M5 用量 🚫 | PAT 引导页 + charge 直连接入（Keychain 存储） | credit 进度条正确 |
| M6 打磨 | 自启动、设置页、打包 dmg | 可日常自用 |

## 7. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| charge 接口权限拿不到 | credit 维度无法实现 | 已设计为可降级维度；issue/NPC 面板独立可用 |
| `npc.work_mode`/status 字段非公开契约，可能变动 | 状态推导失准 | 推导规则集中在一个模块；规则可配置 |
| 轮询量大触发限流 | 数据延迟 | 变更检测 + 串行 + 组织白名单收窄范围 |
| tauri-nspanel 插件跟随 Tauri 版本不稳 | M1 受阻 | 锁版本；兜底用 `setAlwaysOnTop` + window level 方案 |
| 全屏 App 下显示异常 | 体验 | visibleOnAllWorkspaces 收起策略 + 收集真机用例 |

## 8. 非功能需求

- 冷启动 < 1s（先渲染缓存）；常驻内存目标 < 100MB；CPU 空闲 < 1%；
- 所有 API 失败静默降级，UI 不白屏；
- token 仅存在于用户 cnb-cli 配置中，widget 不落盘任何凭据。

## 9. 已确认决策与遗留问题

### 9.1 已确认（2026-10-13）

- **Q1 credit 权限** → 采用 PAT 方案，见 §2.2 确认注记。
- **Q2 监控范围** → 组织白名单制，见 §2.2。
- **Q3 CLI 依赖** → 当前版本以「预装 cnb-cli + `cnb login`」为前提；**后续版本内置 OAuth 设备授权流**（widget 自己发起 device flow 换取 token），列入 M6 之后的路线图。
- **Q4 状态口径** → §2.3 五态推导规则确认通过。

### 9.2 遗留问题

- **Q5 交互参考**：CodexIsland 若有具体想要的形态/动画（弹出动画、credit 环样式等），提供截图或链接后据此细化 §3。
- **Q6 PAT 创建入口**：CNB 个人设置中 personal access token 的权限项粒度待确认（是否可单独勾选 `group-resource:r`），M5 前验证。

# 刘海 / 悬浮窗 UI Spec

## 1. 双表面（Surface）模型

| 表面 | 触发条件 | 形态 |
|---|---|---|
| 刘海胶囊 | 内建刘海屏 + 屏幕录制权限 | 贴合刘海两侧的胶囊，与刘海视觉融合 |
| 悬浮窗 | 兜底 / 无刘海屏 / 外接屏 | 贴顶居中悬浮胶囊；hover 直接展开完整面板 |

## 2. 形态状态机（NotchSurface）

```
idle ──hover──▶ peek ──click──▶ panel
  ▲              │                │
  └────── mouse leave ◀───────────┘（panel 内点击外部/Esc 也收回）

idle/peek/panel 之上可叠加 event 横幅（6s 自动收回）
```

| 形态 | 内容 | 尺寸（逻辑像素） |
|---|---|---|
| **idle** | 左胶囊：汇总指标（默认 credit 汇总）；右胶囊：NPC 状态圆点矩阵 | 200×32 |
| **peek** | 横条：逐组织 credit 用量条 + 各状态计数 | 480×140 |
| **panel** | 完整面板：组织切换 tabs → 用量明细（进度条/本月消耗）→ 活跃 issue 列表（状态徽标/仓库/标题/最后动作时间/点击打开 issue） | 600×440 |
| **event** | 「NPC ✅ 完成 xxx」「NPC ❌ 失败 xxx」横幅 | peek 尺寸，叠加于当前形态之上 |

- 无刘海屏：hover idle 胶囊直接进 panel（跳过 peek）；
- panel 内按组织切换查看明细（intent/display.md §2）。

## 3. 窗口实现（M1 最简版，已实现）

- 单一透明窗口（`transparent + decorations:false + alwaysOnTop + skipTaskbar + shadow:false`）承载全部形态；
- 窗口随形态切换 resize + 重新贴顶居中（`surface_resize` 命令，物理像素换算 scale factor）；
- idle 态窗口只占胶囊大小，自然实现「胶囊外区域可点击穿透到下层应用」；
- 非刘海屏 hover 语义：胶囊区域 `mouseenter` → panel。

## 4. 后续增强（按里程碑）

| 项 | 方案 |
|---|---|
| 刘海贴合 | `notch_probe`（CGDisplayStream）探测 notch frame，胶囊左右分置刘海两侧 🚫 |
| 全屏 App 不抢焦 | NSPanel（tauri-nspanel）+ `nonactivating` + `visibleOnAllWorkspaces` |
| 事件提醒 | 状态跃迁 → 蓝点/红点 + 横幅 + 可选系统通知；前台全屏时只收进胶囊 |
| 鼠标穿透精细化 | `set_ignore_mouse_events(true, forward)` 按内容边界切换 |
| 自启动 | `SMAppService`（LoginItem），设置页开关 |
| 菜单栏兜底 | NSStatusItem 图标（打开面板/设置/退出） |

## 5. 设置项（展示可配置）

- 左胶囊指标：credit / token 用量 / 构建次数；
- 悬浮窗内容模块：用量 / NPC 动态 / 组合；
- 面板字段显隐、组织白名单（见 intent/data.md §3）。

# 工程 Spec

## 1. 工程结构（Tauri v2）

```
cnb-island/
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs / lib.rs      // 入口 + 命令注册
│  │  ├─ cli.rs                // cnb-cli 安装与调用封装（已完成）
│  │  ├─ surface.rs            // 窗口几何管理（已完成，最简版）
│  │  ├─ collector.rs          // 轮询调度
│  │  ├─ model.rs              // 数据模型 + 状态推导
│  │  └─ store.rs              // 缓存
│  └─ tauri.conf.json
├─ src/                        // React 前端
│  ├─ App.tsx                  // NotchSurface 形态状态机
│  ├─ surfaces/                // idle / peek / panel / event
│  └─ lib/                     // mock 数据、invoke 封装
└─ docs/                       // intent / spec / decision
```

## 2. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 cli 接入 | cnb-cli 托管安装（appdata）+ 调用封装 + 引导页 | 可安装、可调用、错误分类正确 |
| **M1 刘海骨架** | **透明窗口贴顶胶囊 + hover/click 形态切换（mock 数据）** | **不抢焦点、穿透正确、三形态走通** |
| M2 数据 | collector + store + 状态推导，真实 issue/credit 上胶囊 | 状态点与 CNB 网页一致 |
| M3 面板 | 组织切换、issue 列表、点击跳转、event 横幅、设置页 | 展示内容可配置 |
| M4 刘海 | notch-probe + 屏幕录制权限流 + NSPanel 精确贴合 | 内建屏贴合刘海 |
| M5 打磨 | 自启动、菜单栏兜底、打包 dmg | 可日常自用 |

## 3. 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| credit 聚合路线（方案 A）扫描量大 | API 配额、延迟 | 按日缓存 + 仅白名单组织 + 30min 刷新 |
| charge 接口权限拿不到（方案 B） | quota 口径缺失 | A/B 双路线互备；都失败则隐藏维度 |
| `npc.work_mode`/status 字段非公开契约 | 状态推导失准 | 规则集中单模块、可配置 |
| 轮询量触发限流 | 数据延迟 | 变更检测 + 串行 + 白名单收窄 |
| tauri-nspanel 跟随 Tauri 版本不稳 | M4 受阻 | 锁版本；兜底 `setAlwaysOnTop` + window level |
| 全屏 App 下显示异常 | 体验 | `visibleOnAllWorkspaces` 收起策略 + 真机用例收集 |

## 4. 非功能需求

- 冷启动 < 1s（先渲染缓存）；常驻内存 < 100MB；CPU 空闲 < 1%；
- 所有数据源失败静默降级，UI 不白屏；
- 凭据只存在于 cnb-cli 配置或 macOS Keychain，widget 自身不落盘任何 token。

# 总体架构

```
┌─────────────────────────────────────────────┐
│ macOS App (Tauri v2)                        │
│                                             │
│  Frontend (React, WebView)                  │
│   ├─ NotchSurface 刘海胶囊 + 悬浮窗形态状态机     │
│   │    idle / peek / panel / event          │
│   └─ ← IPC(Tauri command/event) ─┐          │
│                                  │          │
│  Rust Core                       │          │
│   ├─ Collector   轮询调度 + 增量拉取        │
│   ├─ Store       内存态 + 磁盘快照(缓存)     │
│   ├─ Surface     窗口几何/层级/穿透管理       │
│   ├─ NotchProbe  屏幕录制探测刘海 frame 🚫    │
│   └─ Cli         cnb-cli 子进程封装          │
└────────────┬────────────────────────────────┘
             │ 子进程 JSON
        cnb-cli（托管安装于应用数据目录，或用户已有安装）
             │ HTTPS
        CNB OpenAPI（部分 credit 数据集直连）
```

## 模块职责

| 模块 | 职责 | 状态 |
|---|---|---|
| `cli.rs` | cnb-cli 安装（appdata 托管）、调用封装、错误分类 | ✅ 已实现 |
| `surface.rs` | 胶囊/悬浮窗窗口尺寸与定位（贴顶居中） | ✅ 最简版已实现 |
| `collector.rs` | 轮询调度、变更检测、串行化 | 待实现 |
| `store.rs` | 内存态 + 启动渲染缓存 | 待实现 |
| `notch_probe.rs` | CGDisplayStream 探测刘海几何 | 🚫 后续里程碑 |

## 关键决策（沿用 decision.md）

1. 数据层走 cnb-cli 子进程（复用登录态），例外：charge/credit 类走直连 OpenAPI；
2. 刘海几何探测用屏幕录制权限，无权限降级为贴顶居中悬浮胶囊；
3. 窗口不抢焦点、非交互区域鼠标穿透；
4. credit 维度有多条可达路线（见 [data.md](./data.md)），设计为可降级数据源。

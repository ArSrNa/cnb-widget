# 全 UI 布局与间距 Spec

> 2026-10-13 全量重构。需求见 [../intent/panel.md](../intent/panel.md)。
> React 19 + shadcn/ui（new-york / Radix）+ Tailwind v4；固定暗色。

## 1. 布局骨架

- 主面板为独立窗口（label `main`，780×560，最小 620×460）。
- 左侧 shadcn `Sidebar` 固定 208px，`collapsible="none"`，显式 `shrink-0 border-r`；品牌在 SidebarHeader，一级导航在 SidebarContent，数据状态在 SidebarFooter。
- 右侧 SidebarInset 使用 `min-h-0 min-w-0`，ScrollArea 高度限制在窗口内；路由切换后滚动回顶部。
- 内容区最大宽度 896px，窄窗口 padding 16px，窗口宽度 ≥740px 时 padding 24px，区块间 gap 24px。
- 多页面由 TanStack Router 内存历史承载：`/usage/$orgSlug`、`/npc`、`/settings`；`/` 进入首个组织用量页。

## 2. Padding 与间距规范

**必须保留组件内边距。padding 用于组件内留白，gap 用于相邻元素间距。允许页面通过 className 调整 padding、gap 和尺寸，特殊组件几何可定义命名变体。**

- 基础字号 16px；使用 shadcn 的标题、描述和状态组件形成文字层次。
- 全局 reset 交给 Tailwind Preflight；窗口几何 CSS 写在 `@layer base` 中。样式层外不能使用通配选择器清零 margin/padding，否则会覆盖 utilities。
- 优先使用组件内置 variant 和 size；布局调整允许使用 Tailwind padding、gap、width、height。
- 统一使用 4px 刻度；相同层级保持相同间距。

| 区域 | 内边距 / 间距 |
|---|---|
| 页面内容 | `p-4 min-[740px]:p-6` / `gap-6` |
| 页面标题 | shadcn Item 默认 `p-4 gap-4`，媒体 / 标题 / 描述 / 动作组合 |
| Card | 默认上下 `py-6`，Header / Content / Footer 水平 `px-6`，区块 `gap-6` |
| 用量列表 | ItemGroup `gap-4`；Item `variant="outline"`，行内 `p-4`，数据栈 `gap-3` |
| NPC 与连接列表 | ItemGroup `gap-3`；Item 行内 `p-4` |
| 侧栏 | Header / Group `p-3`；Footer `p-4` |
| 一级导航 | `h-9 px-3`，项间 `gap-2` |
| 组织子菜单 | `py-2 gap-2`；子项 `h-9` |
| 状态筛选 | ToggleGroup `spacing={2}`，允许换行；无需手工模拟选中态 |
| 显示设置 | FieldGroup + Field + FieldSeparator，Switch 对齐文案 |
| 操作区 | CardFooter `flex-wrap gap-3` |
| 桌面表面 | Button 命名变体，刘海 `px-4 py-3`；悬浮球圆形 `p-2` |

- 使用语义颜色和 Badge variants；所有空态用 Empty，错误和提示用 Alert，加载用 Skeleton / Spinner，分隔用 Separator。
- 不要求组件文件逐字保持 registry 原样；合理扩展 variant 和补全无障碍属性均可。

## 3. 侧栏

- 用量详情（Gauge）、NPC 动态（Activity）、设置（Settings）。
- 用量详情的导航 Link 与 CollapsibleTrigger 分开，点击文字导航，点击箭头展开 / 收起组织列表。
- 组织项使用 OrgAvatar + SidebarMenuSubButton + Link；当前项由路由决定。
- 组织头像来自 `https://cnb.cool/{orgPath}/-/logos/s`，失败时 AvatarFallback 显示首字符。
- 固定侧栏适用于最小窗口，不因 768px 移动端断点隐藏菜单。

## 4. 页面

- **用量**：PageHeading 显示组织头像、名称和演示状态。Card 内每个资源维度一条 outline Item，包含已用 / 总量、Progress、真实百分比、剩余额度与告警 Badge。缺失 / 非正额度显示暂无数据；无权限组织显示 Empty。进度图限于 0–100，数值允许超过 100% 以表达超额。
- **NPC**：PageHeading + 任务 Card；ToggleGroup 筛选五种状态和全部。每个 Item 显示状态 Badge、标题、仓库、编号和时间。Tauri 使用 opener 打开外部浏览器，浏览器预览使用正常链接；失败显示 Alert，筛选无结果显示 Empty。
- **设置**：PageHeading + 显示 Card + CNB 连接 Card。原有 Tauri 命令和 settings-changed 事件保留；加载与保存期间禁用开关，保存失败回滚并显示错误。浏览器预览明确展示桌面功能提示。
- **CNB 连接**：来源、路径、登录状态使用 outline Item；路径可折行和复制；刷新、安装、验证使用 Button + Spinner，下载使用 Progress，提示使用 Alert。

## 5. 刘海与悬浮球

- 两个窗口保持透明，全局 body 不铺背景。
- 刘海用 shadcn Button 的 surface / notch 变体；idle 360×32，peek 520×180，展开后逐组织 Progress、NPC Badge、Separator 与工作台入口。
- 悬浮球用 shadcn Button 的 float 尺寸变体（56px 圆形），显示 credit 汇总百分比与 Progress；窗口 64×64，保留拖动、位置持久化和点击打开主面板。
- 当前沿用汇总 mock 口径；单组织 × 单维度设置、刘海可用性探测与气泡窗口属于后续数据/原生能力工作。

## 6. 验收

1. 780×560 与 620×460 保留左右布局，内容独立滚动，无横向溢出。
2. 页面、卡片、列表、导航与表单均有实际生效的 padding / gap。
3. 组织切换、子菜单展开、NPC 筛选、设置和连接交互正常。
4. 空态、错误态和加载态使用组件库，文案不误导用户。
5. 刘海 hover / Esc 与悬浮球拖动 / 点击行为保持，透明区域不铺底色。

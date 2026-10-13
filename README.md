# cnb-widget

基于 Tauri、React 和 shadcn/ui 的 CNB 桌面工作台，展示真实组织资源用量与 Issue / NPC 状态。

## 连接 CNB

首次打开进入首页，安装或检测 cnb-cli，再填入个人访问令牌。创建位置为 [CNB 个人访问令牌](https://cnb.cool/profile/token)。勾选只读权限：

- `account-profile:r`：读取当前用户。
- `account-engage:r`：读取所属组织和仓库。
- `group-resource:r`：读取组织用量及额度。
- `repo-issue:r`：读取 Issue。
- `repo-notes:r`：读取评论及 NPC 状态。

令牌使用范围须覆盖需要查看的资源。组织用量还受账号角色约束，无权限的组织会单独提示。

应用配置的 Token 优先于 `CNB_TOKEN` 环境变量，最后复用本机 cnb-cli 登录态。默认保存在 macOS Keychain、Windows Credential Manager 或 Linux Secret Service；Linux 需有可用的 Secret Service（如 GNOME Keyring 或 KWallet）。也可选择仅本次会话使用，临时 Token 不覆盖之前保存的凭据。

主面板、悬浮球支持 macOS、Windows 和 Linux；灵动刘海仅支持 macOS 刘海屏。浏览器预览展示未连接状态，不访问 CNB。应用内 OAuth 尚在规划，见 [认证意图](docs/intent/auth.md)。

## 本地开发

安装 Bun、Rust 和 [Tauri 平台依赖](https://v2.tauri.app/start/prerequisites/)，运行：

```sh
bun install
bun run tauri dev
```

前端构建：`bun run build`。Rust 编译检查：`cargo check --manifest-path src-tauri/Cargo.toml`。

实现细节见 [认证与数据采集](docs/spec/auth.md)。

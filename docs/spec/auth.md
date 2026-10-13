# CNB Token 实现

## 存储与 IPC

Rust 使用 keyring 3.6.3。按编译目标启用 apple-native、windows-native 或 sync-secret-service + crypto-rust + vendored；Linux 需要运行实现 Secret Service 的桌面凭据服务。DBus 依赖随构建打包，不要求用户手工配置数据库或明文文件。

凭据标识为 service `com.arsrna.cnb-widget`、account `CNB_TOKEN`。凭据操作串行化并放入阻塞任务池，Token 仅保留于系统凭据存储及 Rust 内存，不写入 settings.json、localStorage、日志。前端输入使用 password 控件，成功后清空。子进程通过环境注入 CNB_TOKEN，参数不携带 Token；返回输出对当前 Token 脱敏。

- `auth_status`：返回认证来源、环境变量是否存在、是否保存过 Token、凭据存储错误，不返回 Token。
- `auth_save(token, persist)`：通过 users/get-user-info 与 organizations/list-top-groups 验证后写入系统凭据存储，或仅在本次会话使用。临时替换不覆盖原保存凭据，重启后恢复原凭据。
- `auth_clear`：移除应用保存及会话中的 Token，保留外部环境变量和 cnb-cli 登录态。
- `auth-changed`：广播非敏感状态；认证版本增加，各数据缓存失效，所有窗口重新读取。

## 权限

| Scope | 用途 |
|---|---|
| account-profile:r | 读取当前用户 |
| account-engage:r | 读取所属组织、仓库 |
| group-resource:r | 读取组织资源用量、额度 |
| repo-issue:r | 读取 Issue 列表 |
| repo-notes:r | 读取评论、NPC 状态 |

用户应按监控范围配置令牌可访问的资源类型。即使拥有 scope，组织角色仍可能限制 charge 读取；403 逐组织显示无权限，不阻断其他组织或 NPC 数据。

## 数据采集

展示设置 `usageDisplay` 默认 `remaining`，剩余比例为 max(0, 100 − 已用比例)；可切换为 `used`，在 settings.json 持久化并广播到全部窗口。旧设置文件缺少该字段时使用剩余模式。用量详情保留明确标注的已用数值、总额度和剩余额度，进度与百分比随展示口径切换。

`usage_get(force)`：分页读取所属顶层组织，调用 charge/get-volume + get-quota，统一换算 credit、开发核时、构建核时。组织列表缓存 6 小时，用量缓存 30 分钟，整体失败 60 秒后可重试；手动刷新绕过用量缓存。零额度保留数值，不计算比例；冻结数值单独显示。各窗口共享 Rust 内存快照并监听 usage-changed。

`npc_get(force)`：分页读取授权仓库，逐仓库读取最近活跃的 20 个 open Issue 及最近 5 条评论，按状态推导规则展示。快照缓存 90 秒；未变化且非工作中的评论复用，工作中每次更新评论状态。无法读取的 Issue/评论显示告警并跳过，不填入演示数据。没有可靠 NPC 标识的提及不推断为 NPC 派发。各窗口监听 npc-changed。磁盘快照与组织白名单选择暂待后续实现，当前范围为账号与 Token 可访问的资源。

所有 CLI 请求全局串行，单次 15 秒超时且超时终止子进程。各采集在每次调用间释放 CLI 锁，认证切换后丢弃未完成的旧采集。浏览器预览不调用 CNB、不保存 Token。

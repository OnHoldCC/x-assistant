# 本机后台常驻服务

2026-10-30 已把本机 18431 后台安装为当前 macOS 用户的 LaunchAgent，服务名为 `cc.onhold.backend`。登录后自动启动，进程退出后由 launchd 自动恢复；不依赖终端或 Codex 对话保持打开。

- 配置：`~/Library/LaunchAgents/cc.onhold.backend.plist`
- 数据：`~/Library/Application Support/cc.onhold.admin/onhold-admin.sqlite3`
- 程序、静态资源和日志：`~/Library/Application Support/cc.onhold.admin/runtime/`

程序和静态资源使用独立版本副本。重新编译工作区不会覆盖正在运行的程序，也不会让正在构建的前端目录临时缺失。后续部署新版本时，需要更新服务配置中的程序和资源路径，再重启该服务；只构建工作区不会更新已部署页面。

检查状态：

```sh
launchctl print gui/$(id -u)/cc.onhold.backend
curl --fail http://127.0.0.1:18431/health
```

不要再同时用 `cargo run` 或工作区二进制启动同一端口。需要维护时先核对执行中的任务，再通过 launchctl 管理已有服务。

浏览器助手仍需单独在线。常驻后台不代表电脑休眠、关机、退出登录或关闭浏览器后仍能执行 X 页面自动化。

## X 助手自动重连（1.5.18）

助手保留原绑定账号与连接意图，不把暂时的 WS/CDP 断线当作手动断开。WS 使用1–30秒退避重试，Chrome 30秒闹钟用于唤醒或兜底；浏览器重启后自动恢复原账号。原标签页关闭时复用可用 X 标签页，缺少 X 页面时只创建一个 `active:false` 的连接页，不抢前台焦点。账号切换或未登录时等待原账号恢复；密钥无效停止重试，保存新的配对信息后恢复。用户点击“断开”会持久关闭自动重连，即使后台离线也先停止本地连接。

系统日志的 `browser.connected`、`browser.disconnected` 记录后续连接变化，心跳超时会写入原因。此升级修复旧版清除绑定后无法继续重试的问题；旧版首次升级仍由“安装或重载助手”流程完成一次重载和配对，此后普通断线不需要手动连接。

已学习过的读取接口在核对登录 UID 与页面账号一致后复用，并刷新 Cookie；没有缓存时才重新学习，避免页面缓存未触发网络请求导致每次重连失败。

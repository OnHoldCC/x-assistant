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

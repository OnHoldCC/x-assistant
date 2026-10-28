# CDP 登录态与 Rust 后台采集

插件 1.4.4 连接 X 时，通过 `Network.getCookies` 读取 `auth_token`、`ct0`、`twid`，在临时标签页捕获真实的 GET 请求及 Bearer 认证头。只上报资料、帖子、分析、创作者的接口地址和认证头，不上报整个响应样本。学习完毕关闭临时标签页，账号或 Cookie 在学习期间发生变化则取消。

`learn_x_session` 校验域名、HTTPS、只读操作、请求账号、UID、Cookie 和 CSRF，再保存到本机数据库。`refresh_x_session` 更新轮换的 Cookie；相同 Cookie 不会自动恢复已失效的凭证。HTTP 和 Tauri 共用这些操作。

独立 Rust 服务和桌面应用均在启动时运行采集循环。连接后立即安排首轮，之后每 5 分钟执行；关闭 X 标签页、浏览器或插件的 WebSocket 不会停止已授权的后台采集。后台自身必须保持运行，重启后读取数据库恢复调度。手动采集也使用同一个任务队列，新插件不再领取这些数据任务。关注、取关仍需浏览器在线；旧插件账号保留原采集方式。

每轮先校验资料响应中的 UID 与用户名，再保存粉丝/关注数和最多 50 篇本人帖子及指标。排除其他账号的帖子、转推正文，保留缺失值与真实的零。凭证更新或撤销后，在途旧结果不能写入。

401、资料接口 403 和认证错误会暂停此账号；429 按 `Retry-After` 或 `x-rate-limit-reset` 延迟，手动排队也遵守等待时间。网络故障延后重试。任务详情保留经过清理的错误，不记录 Cookie、请求头或服务器错误原文。

## 接口适配范围

资料支持 `UserByScreenName` / `UserByRestId` 的 `rest_id`、`core` / `legacy`；帖子支持 `UserTweets` 的 `legacy`、`views`、长文和带时区日期。

分析、创作者仅学习真实出现的 `Get…` / `Fetch…` 只读接口。当前分析适配带 `metrics`、`period` 的节点（沿用已有 Count / series 格式）；创作者适配已有 `state` 及门槛字段。没有捕获到接口、无访问权限、响应结构不支持或验证失败时，不猜测统计口径、不覆盖旧数据；任务会显示未取得的部分。当前不承诺兼容所有 X 私有接口版本、动态签名、所有分析周期或完整历史分页。实际账号的私有分析响应仍需联调。

## 停止与存储

账号页「断开采集」或插件主动断开会移除后台凭证与接口模板，并取消在途采集。检测到浏览器退出登录或切换账号，也会撤销原绑定。撤销后保留不含凭证的状态记录，防止旧插件重新触发采集；重新连接可重新授权。帖子、收藏及其他历史数据保留。

凭证存放于 `onhold-admin.sqlite3`，Unix 主数据库权限为 `0600`，没有额外做静态加密；它和数据库一致性备份均应按敏感登录资料保管。API 返回、连接列表、任务详情和系统日志不包含凭证。发送凭证的插件配对仍仅接受本机地址。传输使用的 [CDP Network API](https://chromedevtools.github.io/devtools-protocol/tot/Network/) 和 [reqwest 重定向策略](https://docs.rs/reqwest/latest/reqwest/redirect/index.html) 分别用于读取浏览器登录态及禁止带凭证跟随重定向。

## 验证与使用

1. 更新并启动 Rust 后台/桌面应用，重载 1.4.4 插件，在已登录的 X 页面重新连接。
2. 账号页应显示「后台定时采集」，任务记录可看到后台执行结果。首轮后关闭 X 标签页，后台保持运行，下一轮应仍执行。
3. 从账号页断开，下一轮应停止，已有帖子不删除。重新登录、连接后恢复。

自动检查：`cargo test --manifest-path backend/Cargo.toml --locked`、`cargo check --manifest-path app/src-tauri/Cargo.toml --locked`、`npm test`、`npm run app:build`、`npm run installer:check`。Rust 夹具覆盖无浏览器采集、重启恢复、手动队列、限流、失效、账号隔离、撤销竞态和未知结构保留旧数据；Node 夹具覆盖 CDP 请求学习、Cookie 变化及清理临时标签页。这些夹具不代替真实 X 账号联调。

# OnHold 运营后台与多端应用

0.9.0 使用 React + TypeScript、shadcn/ui 官方 dashboard-01 布局、Radix 交互与 X 业务数据、Rust/Axum/SQLite 数据服务及 Tauri 2 原生宿主。0.7.0 的 Electron 模型控制台原型已退出主流程。

界面包含运营概览、账号管理、内容分析、CDP 连接、采集任务与连接设置。数据从配套插件采集的实际 X 页面获取，不预置示例账号。浏览量、评论数、评论率及加权参考值分别展示；缺失计数不补零，缩写计数标记估算。

## 开发与验证

```sh
npm --prefix app ci
npm run app:build
npm run backend:test
npm test
npm run desktop:start
```

单独运行 Rust Web 后台：

```sh
npm run backend:start -- --home /path/onhold-data --port 18431
```

访问 `http://127.0.0.1:18431`。使用独立端口，避免与旧版 x-local-ops 的 18429 端口冲突。后台只监听回环地址，校验 Host、Origin 和配对密钥。数据库、配对密钥、账号快照与任务状态由 Rust 管理，无需 Node.js 来运行统计后台。旧翻译推理安装器及模型工作进程保留兼容。

## 插件与采集任务

首次打开显示 OnHold 连接引导。安装配套 1.4.0 插件后，在首次引导或右上角状态灯的账号抽屉中点击「连接 X 助手插件」：桌面端打开本机后台的连接页面，通过限定回环来源的扩展消息自动配对，选择最近使用的 X 标签页并建立经过密钥校验的 WebSocket。无需手填地址和密钥。浏览器要求的首次扩展加载和调试权限确认仍由用户操作。

插件通过 `chrome.debugger` 使用 CDP，只允许固定的页面读取函数。浏览器会显示调试连接提示。Rust 后台每 5 分钟生成采集任务，通过 WS 通知插件。插件每 20 秒报告登录状态和心跳，WS 断开后自动重连；退出登录、切换账号或页面不可用时暂停采集并显示原因。会话留在浏览器中，后台保存账号、登录状态与数据快照。后台队列支持 `capture`（账号与帖子）和 `capture_analytics`（官方分析）：领取任务、验证账号、在后台标签页读取个人主页资料和已加载的本人帖子、写入快照并回报完成/失败。任务不能跨账号领取，重复任务会被拒绝，超时任务标为失败；没有开放任意 JavaScript 执行接口。

插件依赖桌面版 Chrome/Edge；手机应用通过 HTTPS 连接同一 Rust 服务查看和管理数据，不宣称在手机 Chrome 中运行桌面插件。远程模式需要先部署带 TLS 的反向代理；上游 Host 转发为本机后台地址，访问仍须配对密钥。默认不会把服务暴露到局域网或公网。

## 桌面打包与模型

```sh
npm run desktop:pack -- --bundle /path/complete-offline-bundle
```

默认模型资源来自 `desktop/payload`。打包前校验完整离线清单、Hy-MT2、Laya、Node/Python 与当前平台运行时；缺失不降级为在线下载。模型及运行环境随桌面包的 `offline/` 资源提供，不提交到 Git。已有离线包的模型资产可以复用，统计后台不依赖模型加载成功才能打开。

桌面构建输出位于 Tauri `target/release/bundle/`；使用 `CARGO_TARGET_DIR` 时位于对应目标目录。Mac 生成 APP/DMG；Windows 超大模型安装包仍需实际构建验证。

## Android 与 iOS

```sh
npm run android:init
npm run android:pack
npm run ios:init
npm run ios:pack
```

Android 需要 Android SDK、NDK、JDK 和 Rust Android targets。iOS 需要完整 Xcode、CocoaPods、iOS SDK 与签名团队配置。当前开发机缺少 Android SDK/NDK、完整 Xcode 和 CocoaPods，尚未生成 APK/IPA；手机端布局测试与 Rust 桌面编译通过不等于移动端原生打包通过。

移动端模型方案仍待确认：当前实现支持连接远程 Rust 服务；尚未实现 Hy-MT2/Laya 在 Android/iOS 上的本机离线推理。请勿把随桌面包提供的 Mac/Windows 运行时当作移动推理运行时。

## 检查范围

Rust 测试覆盖快照基线、未知与零、近似/精确计数切换、持久化、输入拒绝与任务归属。浏览器集成测试使用隔离的 X 页面夹具和临时数据库，覆盖真实 CDP attach/读取/任务回报、密钥与来源校验、375/768/1320 布局和交互口径。未用用户的在线 X 账号执行自动化或发布。

插件正文点击已修复：翻译文本的普通点击继续传给 X，翻译按钮和链接独立处理。更新插件文件后，需在浏览器重载插件并刷新旧 X 标签页。

翻译优先触发并复用 X 原生翻译；目标为中文而 X 已将中文转成英文时，先恢复中文原文。原生翻译缺失或失败后才使用本机翻译。译文正文点击走原帖的原生时间链接，蓝框选择不再修改帖子外边距，避免内容在鼠标下移动。


## 运营页面与组件规划（0.8.3）

本次按 Marketing Skills 的 [social](https://github.com/coreyhaines31/marketingskills/blob/main/skills/social/SKILL.md)（2.4.0）、[analytics](https://github.com/coreyhaines31/marketingskills/blob/main/skills/analytics/SKILL.md)（2.2.1）与 [onboarding](https://github.com/coreyhaines31/marketingskills/blob/main/skills/onboarding/SKILL.md)（2.0.2）规划，读取日期 2026-10-27。应用在既有 Tauri 项目内接入 shadcn 源码，参考 tauri-ui 的桌面交互原则，没有覆盖重建 Rust 服务。

| 页面 | 要回答的问题 | 已实现内容 | 数据来源与限制 |
| --- | --- | --- | --- |
| 运营概览 | 账号在增长吗？触达和讨论怎样变化？ | 当前粉丝、已采集浏览/评论、可比帖评论率、可切换指标的趋势、重点帖子、数据覆盖 | 净增来自所选周期可比快照；累计值只覆盖已采集内容。官方分析保持独立周期 |
| 内容分析 | 哪些帖子和话题值得复盘？ | 搜索、表现排序、话题对比、帖子详情侧栏、打开原帖与评论 | 只统计已采集本人帖子；一帖多话题不可合并成去重曝光。加权值独立标注 |
| 账号管理 | 哪些账号可正常采集？ | 账号切换、登录状态、长连接状态、采集时间、手动采集 | 按账号隔离；退出登录、切换账号或离线时暂停 |
| 采集任务 | 采集是否按时完成？失败原因是什么？ | 排队/执行/完成/失败计数、最近 100 条记录和错误说明 | 复用现有 Rust 队列与 5 分钟采集机制 |
| 连接与设置 | 怎样开始使用，异常时怎样恢复？ | 一键连接、首次安装帮助、账号与连接状态、本机存储、折叠的远程设置 | 地址和密钥自动配对；首次加载与新增权限由浏览器正常确认 |

指标服务于触达、互动、转化与数据质量四类决策。当前没有独立访客、归因订单或合格收益数据，因此没有虚构转化率、用户画像或收益。官方快照内同周期的主页访问/曝光只作为访问事件比率。可比帖评论率只汇总同次观测且评论与浏览数据可读的帖子，不把缺失项补零。

`app/src/shared/operations.tsx` 中的 MetricCard、SessionCard、PostPerformanceTable 与 PostDetail 是 OnHold 自有业务组件。`components/ui/` 保存可维护的 shadcn 基础组件源码；业务状态不进入基础层。桌面沿用 dashboard-01 结构，手机改为底部导航、内容与任务卡片，功能和数据口径见 [移动端与 CDP 助手](MOBILE-OPERATIONS.md)。电脑首次安装按安装、连接、完成逐步显示，手机先连接 HTTPS 工作空间。

首次激活以“真实账号已绑定、长连接在线、首次采集完成”为目标，不以打开引导页或点击连接按钮冒充成功。后续发布日历、草稿队列与转化归因仍需对应数据和执行能力，本版不显示尚未实现的操作入口。

浏览器助手会导出到应用数据目录的 `browser-extension` 文件夹。Mac 为 `~/Library/Application Support/cc.onhold.admin/browser-extension`，Windows 使用 Tauri 的应用数据目录。界面显示和复制的路径指向该插件根目录；打开文件管理器时则在父目录中选中 browser-extension，方便选择或拖动整个文件夹，不从 DMG 或 `.app` 内部加载。应用移动或升级后目录保持不变；更新替换完整资源，Chrome 存储仍由浏览器保留。

## OnHold UI 规范

设计变量、组件公共入口和多端交互约定已统一到 [OnHold UI 设计规范](ONHOLD-UI.md)。页面从 `@/components/onhold` 导入，图表使用 `@/components/onhold/charts` 子入口。`ui.html` 是独立组件预览页，示例数据不进入运营数据库。

桌面端最新功能与验证范围见 [0.8.4 更新](RELEASE-0.8.4.md)。

0.8.5 修复安装时的目录定位：Mac 在 Finder 中打开 cc.onhold.admin 并选中 browser-extension，Windows 使用资源管理器选中文件夹。加载扩展时仍选择 browser-extension 本身。

0.8.6 统一手动入口为「立即采集」，移除常驻「刷新数据」和「新建采集任务」；执行中禁用重复提交并加快状态刷新。趋势显示真实零增长与单点，缺失日期保留为空。助手补齐粉丝、关注、浏览、点赞、评论和转发摘要，兼容粉丝链接格式并修复独立设置页的账号识别。

0.8.7 补齐概览指标；帖子指标使用图标和数字；观测趋势改为平滑曲线，单点显示摘要、空值保留断点。官方分析按 X 提供的 1D 至 3M 周期逐一切换并保存独立快照，28 天与 30 天分别存储。官方周期总量与本地按日净增保持独立。

0.9.0 增加官方 CSV 日曲线、多指标切换、创作者资格与校准收益、OnHold 收藏标签、运营记忆与 BYO 模型、受限即停止的自动化、作者页与系统日志。连接入口合并到全局右上角状态灯，细节见 [0.9 运营口径](OPERATIONS-0.9.md)。

## Mac 覆盖安装（0.9.0）

优先使用 `OnHold-Admin-0.9.0-mac-arm64.pkg`。关闭两个旧应用后打开安装包，由系统安装器固定替换 `/Applications/OnHold Admin.app`，不在其他副本位置安装；安装规则采用整包升级并阻止较旧版本覆盖新版。后续名称固定为 OnHold Admin，Bundle ID 固定为 `cc.onhold.admin`。`npm run desktop:pack` 在 Mac 构建应用后会同时生成 PKG；已有 `.app` 可执行 `npm run desktop:installer -- /absolute/path/OnHold\ Admin.app` 单独生成安装器。

0.7.0 原型使用 OnHold Assistant / `cc.onhold.assistant`，因此不会被同名替换规则识别成新版。安装成功后，仅将标识与版本均匹配的 `/Applications/OnHold Assistant.app` 移到 `/Library/Application Support/OnHold/Previous Versions/upgrade.XXXXXX/OnHold Assistant.app.backup`，保留原文件以便恢复。两个应用的用户数据目录、账号数据库、配对和模型缓存不做清理。不匹配的应用、其他版本和符号链接保持原位。应用仍在运行时安装器会要求先退出，不强制终止。

DMG 是拖拽安装的镜像，直接双击其中应用只会运行该副本；不要将它当作自动覆盖安装器。旧 DMG 的挂载磁盘图标也不代表又安装了一份应用。安装包尚未使用 Developer ID Installer 签名或公证，系统仍可能提示来源风险。安装关闭规则依据 [Apple Distribution XML](https://developer.apple.com/library/archive/documentation/DeveloperTools/Reference/DistributionDefinitionRef/Chapters/Distribution_XML_Ref.html)，整包覆盖与禁止重定位使用本机 `pkgbuild(1)` 的组件策略。

## 插件升级引导（0.9.2）

以插件运行中的 `chrome.runtime.getManifest().version` 心跳为准，不能以磁盘中已导出的 manifest 冒充浏览器已升级。新桌面启动后发现当前账号连接的是旧版或版本未知，会显示“更新助手”：先打开扩展管理页与新版目录，在原卡片重载，再检查连接。收到目标版本或更高版本的在线心跳后确认完成；未升级时保留提示。新版文件仍导出到固定 browser-extension 目录，不卸载扩展或清空设置。

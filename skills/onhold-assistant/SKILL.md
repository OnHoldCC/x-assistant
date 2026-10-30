---
name: onhold-assistant
description: Install, update or diagnose OnHold Assistant by fetching its open-source repository and building with the user's local Docker. Guides browser extension installation, version reload, X connection and first data collection; local translation is optional; news writing uses public hotlists/RSS and Codex verification.
---

用户说“安装 OnHold”“更新 OnHold”或“升级后台和插件”后直接执行，把后台和浏览器运行中的插件作为同一次升级验证。主流程是 **AI 拉开源代码 → 本地 Docker 构建 → 启动并验证 → 打开浏览器引导插件与数据**。不分发应用镜像，不安装桌面程序；本 Skill 不携带应用源码或模型权重。

## 安装

1. 检查 Git、Docker Engine、Compose v2+ 和可用磁盘/内存。缺失时由你按当前系统从官方来源安装/引导，不要求用户装 Node、Rust、Python。macOS/Windows 需 Linux 容器模式；Docker Desktop 首次协议与系统授权由用户本人完成。Git 不可用时先安装 Git，不用任意源码快照冒充已检出的版本。
2. 默认安装根目录为 `~/OnHold`（Windows `%USERPROFILE%\OnHold`），源码放 `source/`，浏览器加载的插件固定放根目录 `extension/`。检查已有安装及 18431/18427 端口，不结束无关程序，不覆盖用户已有文件。
3. 从官方仓库 `https://github.com/OnHoldCC/x-assistant.git` 克隆到 `source/`。使用用户指定的 tag/commit；未指定时拉取 main 当前版本。记录 `git rev-parse HEAD`，核对仓库来源及 `compose.yaml`、`docker/deploy.sh`、`docker/deploy.ps1` 是否存在。缺部署文件时报告实际版本与缺失文件，不能声称此版本支持 Docker。不要把未提交的本地代码说成其他用户已经能拉到。
4. 在源码目录运行安装，固定导出插件到安装根目录：

   macOS/Linux：
   ```bash
   ONHOLD_INSTALL_DIR="$HOME/OnHold" bash "$HOME/OnHold/source/docker/deploy.sh" install
   ```

   Windows PowerShell：
   ```powershell
   $env:ONHOLD_INSTALL_DIR=Join-Path $env:USERPROFILE 'OnHold'
   & (Join-Path $env:ONHOLD_INSTALL_DIR 'source/docker/deploy.ps1') -Action install
   ```

   自定义目录时所有操作使用同一根目录。依赖安装与构建都在 Docker 内完成，按宿主 CPU 原生构建 Linux amd64/arm64，不强制跨架构模拟。
5. 长命令保留实时输出或写入本地日志并持续读取。至少每 60 秒报告真实阶段、构建步骤、下载字节/百分比/速度。首次会下载构建镜像和依赖，临时磁盘占用大于最终运行镜像；后续利用缓存。卡住时说清最后一次进度与错误，不编造总体百分比。
6. 后台健康检查通过后，用浏览器打开 `http://127.0.0.1:18431/`，继续下方接入引导。运行容器或完成下载不等于接入完成。

## 插件、账号与数据

- 构建脚本从本次构建出的容器导出插件到 `<安装根目录>/extension`，部署验证成功后才替换。源码与浏览器加载目录分离，避免生成文件弄脏 Git 工作区。
- 初装通过 Chrome 正常扩展 UI 开启开发者模式、加载固定目录。用户在浏览器登录 X，再在后台连接。检查插件版本、WebSocket 心跳与登录状态，不读取或索取用户密码/Cookie，不修改浏览器策略/配置文件。
- 后台只保留安装 → 连接两步；连接后自动进入后台并采集首批数据，不再要求用户确认账号或点击首次采集。继续观察任务结果，报告实际账号和采集范围。官方分析、关注/粉丝名单是单独采集范围；缺失继续标为未知，不能宣布所有数据到齐。
- 升级完成并同步插件目录后，在安装了该插件的 Chrome/Edge 打开后台 `/#/connect?upgrade=1`。1.5.16 起支持已配对后台发起插件自身重载，空闲检查通过后重载、重新连接并核对实际运行版本；不重启整个浏览器，不把 X 页面带到前台。旧客户端缺少此能力时，由 agent 通过正常扩展管理页重载一次；浏览器工具不可用时只交接这一次点击。不能用 IAB 中的成功连接代替原浏览器插件验收，也不能把文件复制完成当作运行版本已更新。插件重载不会自动替换已打开页面中的旧内容脚本。若更新涉及内容脚本，agent 检查目标 X 页没有未提交正文后，在后台刷新并验证；有草稿则保留页面，单独报告这一步待完成。
- 安装与升级验证不发布帖子、不回关或取消关注。浏览器执行的任务需要已登录且连接的插件；后台已学习的只读采集依赖会话仍有效。

## 可选模型

默认只构建并运行前端静态页面和 Rust 后台，不下载权重、Python/PyTorch 或 Codex。网页“账号与模型”展示选配状态与安装指令。

用户选择后，在同一源码目录、同一 `ONHOLD_INSTALL_DIR` 下执行 `docker/deploy.sh translation`（翻译 Hy-MT2，权重约 1.91 GB）或 `login`（构建 Codex 服务并发起设备登录）；Windows 使用对应 PowerShell `-Action`。选项写入 `source/.env`，重启和升级保留。只验证已选择模型的真实翻译/缓存；跳过不等于已通过。

Codex 用户本人在官方页面完成设备授权，不复制或打印宿主机 `~/.codex` 凭据。登录后用 `docker compose --project-name onhold exec -T agent codex login status` 验证。官方说明：[设备登录](https://developers.openai.com/codex/auth#login-on-headless-devices)。文章也可直接在网页配置用户自己的 API；不默认选付费服务或替用户授权发送资料。

模型默认 CPU，各 2 线程；Mac Docker 不等于原生 Metal 加速。默认后台内存上限 384 MiB，选配网关 256 MiB、翻译 3 GiB；上限不等于实际 RSS。报告实测平台，不把 ARM64 成功说成所有平台已验收。

自动发文可先用 60s hot-topics 的公开 API 获取微博、小红书热榜，并按 news-aggregator-skill 的方式读取 BBC 娱乐、Guardian 文化 RSS，再交给 Codex 核实最近48小时新闻。无需额外安装这两个项目的全部依赖、浏览器或 Python；后台预览 `news_sources` 可核对实际来源计数与错误，5分钟缓存。热榜标题是选题线索，采集时间不是原文发布时间；全部来源失败时不空转调用模型。按用户配置生成短帖，保留来源、发布时间和去重记录；正文不附链接时来源仍存任务记录。当前只支持文字，不声称已支持自动图片/视频上传。不再安装评分模型。安装验收不启用发布计划，不把生成草稿等同于公开发送成功。

## 更新与维护

一次“升级 OnHold”依次完成以下实际阶段，持续展示当前阶段，不要求用户逐步确认：

1. **检查版本**：核对安装目录和官方 Git remote，记录旧 commit 与工作区状态；fetch 用户指定版本，未指定则用 origin/main。读取目标 commit 中的本 Skill 与部署入口，避免沿用旧安装包中的过期流程；执行仍限于本次授权的升级范围。未推送的本地修改不能称为用户可拉取版本。
2. **备份**：等待当前发布、回复、模型生成和关注操作完成。用旧代码的 `backup` 停止本项目并备份数据；保留 `.env`、已选 profiles、数据/模型卷和固定插件路径。有用户修改时使用独立检出或保留处理，不做 reset/clean。
3. **更新后台**：切换目标 commit，运行新版本 `start` 本地重建并验证容器。检查 `/health` 的 `source_commit` 等于目标 commit，记录 `extension_version`；不能只根据容器标签或“启动成功”宣布升级。源码带 `-dirty` 或缺版本证据时如实说明。
4. **更新插件**：部署脚本验证后把插件导出到同一个 `<安装根目录>/extension`，保留旧副本；维持 manifest key 与扩展 ID。核对目录 manifest.version 与后台 `extension_version` 一致。
5. **加载与验收**：按上面的升级连接入口让运行中的插件重载并重连；再核对后台连接的 `extension_version`、WebSocket 在线和账号归属，确认等于目标版本或更新的兼容版本。采集仅作只读验证，失败单独报告，不发布测试帖或试关注。旧插件/浏览器工具阻塞时，把“后台已更新”和“插件尚待重载”分开报告，不宣布全部完成。

无需重启整个 Docker，不重新下载未选择的模型。失败保留数据与旧插件目录，按 [维护说明](references/docker.md) 处理，不能循环重试或删卷。

源码与部署脚本更新必须来自用户选定的官方版本；没有镜像仓库需要维护。保留 LICENSE 与 THIRD_PARTY_NOTICES，遵守仓库许可证。完成报告分别说明源码 commit、后台验证、模型选配状态、插件新版本连接与首批数据；受用户登录/浏览器确认阻塞的步骤明确列出。

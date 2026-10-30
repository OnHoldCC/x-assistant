# 维护、更新与恢复

## 目录和所有权

默认安装根目录 `~/OnHold`，Git 工作区 `source/`，浏览器固定加载 `extension/`。设置 `ONHOLD_INSTALL_DIR` 为根目录后执行源码中的 `docker/deploy.sh`，Windows 为 `docker/deploy.ps1`。不要把导出目录放回 Git 跟踪的 `source/extension`；Docker 内编译不会修改宿主源码。

Compose 项目名固定 `onhold`；`onhold_state`、`onhold_secrets`、按需创建的 `onhold_models` 分别保存账号/配置/缓存/Codex 登录、内部模型密钥、权重。接口默认只发布到本机 18431/18427；不直接暴露公网。

## 从 Git 更新

- 核对 `git remote get-url origin` 为用户选定的官方仓库，记录旧 commit 与 `git status --porcelain`。有用户修改时不要 reset/clean/stash 后假装没发生；保留并处理，或使用独立检出目录。
- fetch 并解析用户指定版本，未指定则使用 origin/main 当前 commit。检查新版本包含 Docker 部署入口。拉取代码本身不代表容器或插件已更新。
- 更新前等待正在发布或执行关系动作的任务结束。用**旧代码**的 `backup` 操作停止当前项目并备份 state 到根目录 `backups/`。备份含账号会话与密钥，应私密保存。
- 检出新 commit，保留忽略的 `source/.env`，继续使用相同 `ONHOLD_INSTALL_DIR`。执行新代码的 `start`，它会重新 build、up，并验证后台和已选模型。无需重启整个 Docker，也不需要拉取已发布的应用镜像。
- 构建成功后导出新版插件到固定目录；构建失败不提前替换现用插件。检查 `/health.source_commit` 与目标 commit、`/health.extension_version` 与导出目录 manifest.version，随后在原 Chrome/Edge 打开 `/#/connect?upgrade=1`。支持自动重载的旧运行版本会先核对已配对 token、等待空闲、重载自身、发现新版本并重新连接。低于 1.5.16 的运行版本需要一次正常扩展 UI 重载；有可用浏览器工具时由 agent 执行，否则交接用户点击，不用隐藏策略或修改浏览器配置。后台 worker 重载不等于既有页面内容脚本已换新；涉及内容脚本变更时，检查未提交正文，安全的目标 X 页在后台刷新，有草稿保留并报告待刷新。最后验证连接中实际版本与账号。
- 若失败，保留卷、旧 commit 和备份，报告具体阶段。不能无限重试、删卷或自动重新发送任务。恢复时用旧代码配套旧 state 备份，恢复前先备份当前 state；没有实际验证，不声称回滚成功。

## 日常操作

在源码目录设置安装根目录后，部署脚本支持 `status / doctor / start / stop / verify / backup`。`start` 重建并验证当前源码及所选服务；`stop` 保留数据/模型。读取日志使用 `docker compose --project-name onhold --profile '*' logs --tail 100 <服务>`，避免输出凭据。选配使用 `translation / login`；profiles 保存在 `.env`。

卸载容器可 `docker compose --project-name onhold --profile '*' down`，卷仍保留。只有用户明确要求删除数据才删除本项目对应卷；不做系统级 prune 或删除其他服务。GitHub、Docker Hub、npm、crates.io 或模型源不可达时，报告失败来源，不私自切不明镜像站。

## 旧原生数据迁移

macOS 原后台默认库 `~/Library/Application Support/cc.onhold.admin/onhold-admin.sqlite3`，旧模型目录 `~/Library/Application Support/OnHoldAssistant`。停止已确认属于用户的旧 OnHold 服务释放端口；用 SQLite backup 或 VACUUM INTO 生成一致性副本，integrity_check 后再复制进已停止的新 state 卷 `admin/onhold-admin.sqlite3`，归属 1000:1000、权限 0600。保留原库和备份；新库已有数据时不静默覆盖或合并，不直接复制活动 WAL 数据库主文件。

钥匙串 API Key 不自动迁入容器，用户重新保存；Codex 在可选容器中独立设备登录，不挂载宿主机凭据目录。原生官方源模型可在逐文件匹配 `lib/runtime-lock.json` 的 SHA-256 后复用：翻译放 models 卷根，原始 Laya 文件保持子目录置于 `laya-source/`。不要复用被运行时修改过的 tokenizer JSON。

# 源码 + Docker 安装

用户安装 `skills/onhold-assistant` 这份轻量 Skill，向 AI 说“安装 OnHold”。AI 检查或引导安装 Git/Docker，克隆官方开源仓库，在用户本机 Docker 中构建并启动，然后打开网页引导加载插件、连接 X 和首次采集。**不分发应用镜像**，不安装桌面客户端，也不要求宿主机有 Node/Python/Rust。

默认目录为 `~/OnHold/source`（Git 源码）和 `~/OnHold/extension`（浏览器固定加载目录）。启动示例：

```bash
git clone https://github.com/OnHoldCC/x-assistant.git "$HOME/OnHold/source"
ONHOLD_INSTALL_DIR="$HOME/OnHold" bash "$HOME/OnHold/source/docker/deploy.sh" install
```

Windows 由 Skill 调用源码中的 `docker/deploy.ps1`，设置同一个 `ONHOLD_INSTALL_DIR`。后台默认 `http://127.0.0.1:18431/`。

默认只构建 Vue 静态页面 + Rust 后台，最终运行镜像不包含编译工具。翻译 `translation`、Codex 新闻搜索与文章服务 `login` 独立选配；不选就不下载权重或推理环境。API 文章模型可直接在网页配置。

更新是 **fetch 新代码 → 旧版本脚本 backup → 检出目标 commit → 新版本 start 本地重建**。记录实际 commit；数据卷、选配 profiles 和插件固定路径保留，不需要重启整个 Docker。构建验证完成后同步插件文件，后台 `/health` 回报实际构建 commit 和内置插件版本，再打开 `/#/connect?upgrade=1`，让支持的插件检查空闲、自动重载并重新连接。1.5.16 以前的运行版本需要一次正常 Chrome 扩展管理页重载，随后升级可由 Skill 完成；文件更新与浏览器实际加载版本分别验收。

兼容目标为 macOS/Windows Docker Desktop 的 Linux 容器模式、Linux Docker Engine；按本机 amd64/arm64 架构构建。首次需要联网下载基础镜像、npm/crates 依赖，构建临时空间比最终镜像大；后续复用缓存。Windows 使用 PowerShell，源码 shell/CRLF、目录空格、Docker 目录挂载需验证。Mac Docker CPU 模型不等于原生 Metal 加速。只报告实测平台。

默认后台内存上限 384 MiB；选配网关 256 MiB、翻译 3 GiB、Codex 512 MiB；上限不是 RSS。端口仅绑定 loopback，内部模型/Codex RPC 不发布端口。

运行 `npm run docker:pack` 生成 `desktop/dist/OnHold-Docker-Skill-0.9.5.tgz`，只包含 Skill 指引、维护文档和许可，不携带镜像、应用源码或模型。部署代码必须已经进入用户可拉取的仓库版本，未推送的本地改动不会被 Git 拉取。

详细维护见 Skill 的 `references/docker.md`。相关依据：[Docker 多架构与模拟限制](https://docs.docker.com/build/building/multi-platform/)、[源码构建上下文](https://docs.docker.com/build/concepts/context/)。

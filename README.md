# OnHold 助手 · x-assistant

本机网页互译、X 多语言草稿预览、短语标签和参考评分。默认阅读译为简体中文、草稿译为英语。正文逐段显示；输入框、代码和独立账号引用跳过。原帖话题与提炼标签分别复制。不会自动发布。

## 安装与维护

需要 Node.js 22.20+。安装器准备模型、独立 Python/PyTorch 和本机服务，无需 Docker/Ollama。Mac 使用 Metal，Windows 首版使用 CPU；Windows 真机和全新机器下载流程尚未实测。

```sh
node bin/cli.mjs doctor
node bin/cli.mjs setup --no-open
node bin/cli.mjs upgrade --no-open
node bin/cli.mjs status
node bin/cli.mjs stop
node bin/cli.mjs start
node bin/cli.mjs uninstall --no-open
```

收到本地 npm 包后：

```sh
npx --yes --package ./onhold-assistant-0.4.0.tgz onhold-assistant setup --no-open
```

替换后续包时用新包运行 `upgrade`。当前未发布到 npm，因此不能把 `npx onhold-assistant` 当成已可用命令。

Mac 默认目录 `~/Library/Application Support/OnHoldAssistant`；Windows `%LOCALAPPDATA%/OnHoldAssistant`。可通过 `--home` 指定目录。模型下载约 1.91 GB + 678 MB，含运行环境至少预留 8 GiB。服务只监听本机 18427/18428/18430，不修改开机自启，不停止其他应用占用的端口。

首次 Chrome/Edge 加载扩展仍需浏览器操作；安装器输出扩展目录。在扩展管理页加载，之后在插件中保存设置。升级保留同一扩展路径，随后重新加载扩展。卸载服务不会替用户编辑浏览器个人资料，请在扩展管理页另行移除扩展。

## 新架构

`浏览器 → 本机接口 → 内存热点缓存 → SQLite 最终数据 → 本机模型`

- 浏览器仅保留设置、迁移标识与页面临时状态，不写译文或标签缓存。
- 本机 RAM 缓存：7 天有效，最多 2,000 项 / 32 MiB；过期、超限、重启只影响这一层。
- SQLite：保存原文版本、来源/Post ID、译文、分析结果、原帖话题、可见互动快照及统计，不自动按缓存容量淘汰。
- 精确索引：来源按平台/Post ID 或 URL 定位；结果按内容指纹、目标语言、模型/流程版本查找。修改原文会保留新旧版本；分段译文也能关联回原帖。
- Hy-MT2 负责翻译；候选短语由词库和词性边界提取，Laya 筛选相关标签和内容参考分。最终分数仍结合观察到的互动数据。
- 草稿不自动存成帖子，也不保存草稿原文；生成的译文可保存在本机结果层。

本机接口提供 `/translate`、`/analyze`、`/observe`、`/lookup`、`/metrics`。`/cache/clear` 仅清内存，不删除最终数据。`/lookup` 通过 `post_id`、`id`、`url` 或 `content_hash` 查询，不需要扫描所有记录。

旧浏览器统计只迁移一次，旧浏览器结果缓存失效。`setup --import-data <旧SQLite文件>` 可保留旧 Python 译文记录；旧缓存缺失的原文无法反向恢复。不同提示/模型版本不会把旧记录冒充成新推理结果。

平均耗时只算模型推理；缓存命中单列。CPU 和内存仅汇总本程序的本机接口、翻译模型及评分模型进程（单核心满载为100%）。GPU 无法可靠按本程序读取时显示不可读取，不使用整机占用率。数据占用只计浏览器设置与 SQLite/WAL/SHM，排除模型、运行时和下载缓存。

## 升级、回退、卸载

升级保留数据与模型选择，先备份 SQLite、旧代码和配置；启动失败会恢复旧代码、配置并尝试恢复旧服务。备份保存在安装目录 `backups/`。维护操作互斥。

卸载默认保留 `data/` 和 `backups/`，只删除本安装器管理的文件。外部模型路径不删除。明确希望同时删除原文、译文、标签、统计和备份时，才使用 `uninstall --purge-data`。

## 替换模型

```sh
node bin/cli.mjs replace-model --translation /path/model.gguf --sha256 <可信SHA256> --no-open
node bin/cli.mjs replace-model --decision /path/laya --manifest /path/manifest.json --no-open
node bin/cli.mjs replace-model --translation default --decision default --no-open
```

翻译端仅支持 llama.cpp 兼容 GGUF；评分端仅支持兼容 Laya 的检查点。决策清单包含 `name`、`files`，每个文件包含相对 `name`、`size`、`sha256`，必须覆盖 `lib/runtime-lock.json` 的必要文件。替换检查启动状态，保留旧权重与数据；模型指纹隔离旧结果。模型可启动不代表翻译质量已验证。

## Skill

`skills/onhold-assistant` 附带完整安装器和维护脚本。可安装本地 Skill 目录，或通过 `npx skills add OnHoldCC/x-assistant --skill onhold-assistant` 安装仓库中的 Skill。Skill 支持安装、升级、卸载、替换兼容模型和诊断；不会绕过浏览器首次加载步骤。

## 一键加入当前网站

网页中点插件图标，再点“将当前网站加入自动翻译”。仅加入当前协议、域名和端口的全部路径，不包含子域名。拒绝权限则不保存；内置页和扩展商店不支持。

项目当前仍为 UNLICENSED，尚未替作者选定开源许可证或发布。名称、Logo、X/Telegram 保持原样；未加入虚假的不可修改或加密锁定机制。

## 作者与官方渠道

OnHoldCC · [X](https://x.com/OnHoldCC) · [Telegram](https://t.me/On_Hold_CC)

版权与开源许可证尚未最终确定；当前代码为 UNLICENSED，不代表授权第三方移除版权声明或冒充官方。

# 项目结构、性能与升级兼容

## 代码按什么层级放

```text
app/
  src/
    main.ts                  # Vue 后台启动入口
    bridge.ts                # Naive UI 插件弹窗入口
    ui.ts                    # 原生组件预览入口
    layouts/                 # Soybean 原版布局、导航、页签、主题抽屉
    views/onhold/            # 业务页面、连接、模型与共享业务状态
    router/                  # Soybean 路由与现有链接兼容
    store/                   # Soybean Pinia 框架状态
    theme/                   # Soybean 原生主题设置
    components/              # Soybean 原生通用组件
    shared/                  # 保留 API 传输、数据类型与指标计算
    hooks/common/            # Soybean 通用组合函数，包括 useEcharts
    styles/                  # 原版样式与保留字体、必要的内容布局
  vendor/soybean/             # 直接复用的原版源码包和 MIT 许可
  src-tauri/                 # 原生宿主、模型进程、密钥、插件导出
backend/
  src/
    lib.rs                   # 各传输共用的 operation 分发
    http.rs                  # HTTP 鉴权、来源校验、静态资源
    ws.rs                    # 浏览器心跳和任务通知
    store.rs                 # 数据库入口、公共类型、账号校验
    store/
      schema.rs              # 版本化、事务化数据库迁移
      ingest.rs              # 采集输入校验与入库
      dashboard.rs           # 统计窗口、趋势、后台汇总
      sessions.rs            # 浏览器连接与登录状态
      identities.rs          # 不可变 X UID 绑定及账号引用
      x_sync.rs              # 登录凭证、只读接口重放及后台定时采集
      jobs.rs                # 采集任务排队、领取与完成
      automation.rs          # 自动化及操作限制
      operations.rs          # 收藏与创作者数据
      journal.rs             # 日志与运营记忆
extension/                   # 浏览器端源码；admin-ui 为构建产物
lib/                         # 本机翻译、评分、缓存、模型与安装生命周期
bin/                         # CLI 和离线分发的现有入口
scripts/                     # 仓库维护脚本
skills/onhold-assistant/     # Agent 安装入口与分发副本
test/                        # Node 单元测试与浏览器集成检查
design/references/           # 原参考图，保留文件名；不进入运行包
docs/                        # 架构与发布说明
```

页面专有逻辑放在 `views/onhold`，多个功能实际共用的能力放在 `shared`；通用 UI 不调用业务 API。原生宿主负责系统能力，Rust Store 负责数据规则，HTTP、WebSocket 和 Tauri 继续复用同一套 Store。

前端已迁入 Soybean Admin 的 Vue 框架，业务页面按路由延迟加载；Rust 743 行的 Store 拆为数据库入口与功能模块。公共 `Store` 方法、CLI 路径、API operation、插件脚本加载顺序和用户数据位置保持兼容。本次没有更改产品版本号。

## 保留的性能策略（历史测量不代表 Vue 版性能）

| 改动 | 作用与验证 |
| --- | --- |
| 页面按功能延迟加载 | 内容复盘等页面不预先加载运营图表。相同空数据夹具、独立浏览器上下文下，内容复盘首次加载 JS 从 837,443 字节降至 443,473 字节，约减少 47%；这是未压缩 JS 资源总量，不是整个应用体积或启动耗时。 |
| 自动刷新串行执行 | 完成本轮请求后才安排下一轮，保留隐藏页面暂停、请求序号保护和采集时加快刷新的行为。浏览器时钟测试覆盖请求耗时 30 秒时不叠加自动请求。手动动作仍可触发即时刷新。 |
| 页面内复用帖子计算 | 过滤、排序、话题分组移入内容复盘；使用 Vue `computed`，概览也复用重点帖和汇总计算，避免其他页面及无关状态触发重复计算。 |
| 统计窗口二分定位 | 历史记录按时间加载一次，预计算精度变化边界；窗口查询由扫描全部历史改为二分定位，不再为每个窗口分配候选数组。差分测试覆盖空历史、窗口边界、缺失值、零和负增量及精度切换，保持原统计口径。 |
| 远程 HTTP 客户端复用 | Tauri 宿主共用一个 reqwest Client，允许连接池复用；保留每次地址/密钥校验、15 秒超时与禁止重定向。 |

这里没有把局部统计计算的提速倍数当成整个后台的提速。SQL 仍读取账号历史，页面仍可收到最多 5,000 篇帖子，需要实际数据量下测量整体耗时。

## 后续优化优先级

| 优先级 | 代码中可见的限制 | 建议与兼容边界 |
| --- | --- | --- |
| 高：历史数据增加时 | `dashboard` 每次读取账号全部观测历史，持有单连接互斥锁完成统计；前端每次取完整后台、连接、任务 | 先记录数据库规模、请求耗时和响应字节，再将概览汇总与帖子分页拆开。保留现有 `dashboard` 返回格式，为新版增加分页读取能力。 |
| 高：帖子数上千时 | 帖子表现直接渲染列表，最多可有 5,000 条 | 优先分页；仍有长列表需求再考虑虚拟滚动。排序、搜索和汇总必须明确是全量还是当前页。 |
| 中：轮询与数据库写入 | 自动化、日志、插件心跳各有刷新周期；部分 WebSocket 分支同步访问 Store | 按可见性暂停非必要轮询，先测锁等待；耗时操作移至阻塞线程。沿用现有日志事件通道，补推送前保留断线后的补读。 |
| 中：分发大小 | Vite 将全部入口的 assets 复制给插件，包括组件展示页的资源 | 如下载/安装体积成为问题，再按 `bridge.html` 依赖图裁剪；需同时检查动态模块和许可证文件。 |

本机模型已有延迟准备、缓存、请求合并及阅读翻译优先队列；没有真实 CPU/GPU 和模型负载数据前，不提高推理并发，不改变模型或精度。

## 升级后如何兼容

应用版本、后端组件版本、插件版本、API 协议版本和数据库版本是不同概念。目前桌面为 0.9.0，Node 安装器与 Rust crate 为 0.8.0，插件为 1.4.0，协议为 1。不能按某一个产品版本字符串直接决定是否可读取数据库或执行新任务。

### 数据库

`backend/src/store/schema.rs` 用 SQLite `PRAGMA user_version` 标记格式，当前为 1：

1. 未标版本的历史库视为 0，保留账号、任务、收藏、设置和配对密钥，补齐既有缺失字段后写入 1。
2. 建表、补字段及更新版本号在同一事务中完成，任一步失败会回滚，启动返回错误。
3. 格式高于程序支持值时拒绝打开，并提示升级应用或恢复升级前备份，避免继续操作未知格式。
4. 后续每次新增迁移时递增版本，依次运行缺失步骤；已发布迁移不改写。新增字段优先使用默认值，字段重命名、删除和数据重算需要对应旧库夹具与升级检查。

版本检查只存在于包含这次改动的程序中，更早的历史版本不会自动获得拒绝新格式的能力。回退不能仅替换可执行文件，应使用匹配的旧代码、配置及数据库备份。

Node 安装器 `upgrade` 已备份其翻译数据库、代码与配置，并在新服务启动失败时恢复旧代码与配置；不会自动把数据库覆盖回备份。Rust 后台的 `onhold-admin.sqlite3` 是另一份数据库，目前没有自动快照恢复功能，发布前应单独备份。备份应使用 SQLite 一致性备份，或在所有连接完全关闭后进行；运行中不要只复制主文件而遗漏 WAL。

### 接口与插件

- 保留现有 `/api/admin`、`operation`、字段含义和默认值；新增返回字段允许旧客户端忽略，新客户端读取新增可选字段时提供默认值。
- 继续按 `analytics_supported`、`automation_supported` 判断能力，缺失按不支持处理；旧插件可以继续基础采集，不能领取它无法执行的任务。
- WebSocket 首次认证报文使用严格字段校验。不能假设旧服务会接受任意新增认证字段；新能力应扩展现有可兼容的心跳字段，或在确认服务能力后发送。
- `/health` 返回后端实际 crate 版本、协议和数据库版本，便于诊断；这些信息本身不等于已经实现跨协议协商。未来确需破坏接口时增加独立版本入口或显式协商，给旧协议保留过渡期。
- 保持 `cc.onhold.admin` 应用标识、用户数据路径和插件固定导出路径。桌面升级后重载浏览器插件；不要清除 Chrome storage 或配对数据来模拟升级。

### 分发与发布检查

只编辑根目录 `bin/`、`lib/`、`extension/` 等源码；Skill 中的 `assets/installer` 是生成副本，不手工各改一份：

```sh
npm run app:build
npm run installer:sync
npm run installer:check
npm test
npm run backend:test
cargo check --manifest-path app/src-tauri/Cargo.toml --locked
```

`installer:sync` 清理并重建有差异的副本项，包括删除失效的旧构建文件；`installer:check` 只读校验，CI 会因副本漂移失败。以上维护命令在完整源码仓库运行。

有 Playwright 环境时，还应运行 `test/admin-performance-browser.mjs`、`test/admin-browser.mjs`、`test/desktop-browser.mjs`、`test/mobile-browser.mjs`、`test/operations-browser.mjs`、`test/trend-browser.mjs` 和 `test/ui-browser.mjs`。可以通过 `PLAYWRIGHT_MODULE` 指定已有模块。发布兼容承诺前，至少验证上一版数据升级、新后台配旧插件、升级失败恢复，以及目标平台的实际安装包；当前自动化结果不代替 Windows/移动设备真机和真实模型测试。

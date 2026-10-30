# OnHold UI

2026-10-29 · Vue 3 / Soybean Admin 2.3.0 / Naive UI / ECharts

直接使用 [Soybean Admin](https://github.com/soybeanjs/soybean-admin) 的原版框架代码。布局、侧栏、顶栏、页签、面包屑、主题抽屉、主题变量、路由和 Pinia Store 保存在 `app/src/layouts`、`theme`、`router`、`store`。内部源码包位于 `app/vendor/soybean`，随附 MIT 许可和来源说明。包配置适配 npm workspaces，运行源码沿用上游。

业务页面在 `app/src/views/onhold`，直接使用 Naive UI 的 NCard、NDataTable、NForm、NButton、NInput、NSelect、NDrawer、NModal、NTabs、NProgress、NPagination 等组件。没有 React 兼容层或自制控件样式覆盖。`workspace.ts` 管理账号、连接、刷新和提交状态；身份验证继续通过原有 `shared/api.ts`，不使用演示后台登录。

页面内容、账号隔离、API operation 和输入字段、SQLite 存储与密钥保存位置保持现有行为。任务和日志每页 20 条；后台刷新不会关闭任务详情；请求修订号阻止旧账号响应覆盖当前账号；自动刷新在上轮完成后再调度，隐藏页面暂停。

字体保留系统字体栈 `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`，品牌保留本地 Nunito（Launch Rounded），等宽保留 SFMono/Consolas。通过 Naive UI 的字体主题配置接入，主题色、控件与布局采用框架原生设置。默认深色，可从原生主题控件切换。

官方趋势使用原版 `useEcharts`：平滑多色曲线，后续指标以虚线/点线区分，小样本显示点。全部指标按各自绝对峰值归一到 100，悬停显示原始值；单指标显示实际数值。缺失值留空，真实零值保留；日/周/月汇总、互动率和收益计算复用 `shared/metrics.ts`。曲线配色按用户参考图保留。

`main.ts`、`bridge.ts`、`ui.ts` 分别启动后台、插件弹窗与原生组件预览。旧的 `#overview`、`#tasks`、`#connect` 链接继续兼容 Vue hash 路由。执行 `npm run ui:dev` 后可访问 `http://127.0.0.1:1420/` 与 `/ui.html`。

`npm --prefix app run build` 执行 Vue 类型检查、Vite 构建、插件弹窗资源与第三方许可同步。数据库与 Rust/插件业务代码不由前端构建修改。

布局密度：自动化任务配置、关系名单、热点列表各有独立侧边栏入口。关系名单选人后可跳转到任务配置创建回关/取关任务；热点列表支持渠道和执行状态组合筛选。桌面页边距和分区间距为 24px，小屏保持 16px；业务表格使用原生 large 尺寸。任务表操作列固定在右侧，长目标说明通过原生省略与悬停提示展示完整文本。


运营概览合并（2026-10-29）：移除“观测数据 / 账号分析”切换，同页展示账号与帖子观测指标以及官方表现趋势；移除“重点帖子”区块。顶部统一“采集运营数据”操作，官方采集可用时采集官方分析，否则保留账号与帖子采集能力。观测对比周期与官方统计范围各自标明，保持数据口径与未知值规则。

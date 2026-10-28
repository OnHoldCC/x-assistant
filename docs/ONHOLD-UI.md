# OnHold UI 设计规范

版本：1.0.0 · 2026-10-28 · React + TypeScript + Tailwind CSS 4

OnHold UI 基于已经选用的 **shadcn/ui New York / neutral、Radix 和 dashboard-01**，保留其组件结构与交互方式。OnHold 维护自己的设计变量、组件入口、组合模式和产品用语。新页面从这一套组件开始。

## 规范入口

| 内容 | 位置 | 维护方式 |
| --- | --- | --- |
| 颜色、字体、布局、动效变量 | [tokens.css](../app/src/styles/tokens.css) | 变量值的唯一来源，页面不另配主题 |
| Tailwind 映射、基础行为、触屏适配 | [onhold.css](../app/src/styles/onhold.css) | 每个 React 应用入口引入一次 |
| 基础组件源码 | [components/ui](../app/src/components/ui) | 保留上游 MIT 许可，按规范维护 |
| OnHold 公共入口 | [components/onhold/index.ts](../app/src/components/onhold/index.ts) | 页面与业务代码从这里导入 |
| 通用组合组件 | [patterns.tsx](../app/src/components/onhold/patterns.tsx) | 不依赖 X、Rust API 或具体账号类型 |
| 图表子入口 | [charts.ts](../app/src/components/onhold/charts.ts) | 按需导入，避免弹窗和表单加载图表依赖 |
| X 业务组件 | [operations.tsx](../app/src/shared/operations.tsx) | 负责数据口径与业务动作，使用 OnHold 基础层 |
| 规范预览页 | [ui.html](../app/ui.html) | 使用真实组件，展示数据明确标为示例 |

预览：在仓库根目录执行 `npm run ui:dev`，打开 **http://127.0.0.1:1420/ui.html**。构建后也会生成 `app/dist/ui.html`，可由本机静态服务或 Rust 后台提供。规范页独立于运营后台菜单，不读取账号或配对密钥。

当前为仓库内的源码组件模块，未发布独立 npm 包。预览页可演示深浅主题；产品默认仍为浅色，没有新增产品设置项。

## 视觉原则

1. **中性、清晰、紧凑。** 黑白灰建立层级，颜色只承担状态、警告和多数据系列区分。
2. **结构保持一致。** 侧栏、顶栏、卡片、表格和抽屉沿用选定模板；新页面通过组合组件构建。
3. **文字服务操作。** 页面标题是名词，按钮使用明确动词；说明只在首次操作、错误恢复或数据口径确有需要时出现。
4. **状态完整。** 默认、悬停、聚焦、不可用、处理中、成功、失败、空数据和未知数据都要有确定表现。

## 颜色与主题

设计变量同时提供浅色 `:root` 和深色 `.dark`。使用 `bg-background`、`text-foreground` 等语义类；不在页面写品牌色值。

| 角色 | 变量 | 使用范围 |
| --- | --- | --- |
| 页面与正文 | `--background` / `--foreground` | 页面底色、主要文字 |
| 卡片与浮层 | `--card` / `--popover` 及对应 foreground | 内容容器、下拉、详情 |
| 主操作 | `--primary` / `--primary-foreground` | 当前页面最重要的动作 |
| 次级与悬停 | `--secondary` / `--muted` / `--accent` | 次操作、非主内容、选中与悬停层 |
| 辅助文字 | `--muted-foreground` | 时间、说明、次级标签 |
| 边界与焦点 | `--border` / `--input` / `--ring` | 分区、控件边界、键盘焦点 |
| 成功 | `--success` / `--success-surface` | 已完成、已连接 |
| 提醒 | `--warning` / `--warning-surface` | 需要登录、需要处理 |
| 进行中与信息 | `--info` / `--info-surface` | 正在执行、操作说明 |
| 失败与危险操作 | `--destructive` / `--destructive-foreground` / `--danger-surface` | 失败提示、不可逆操作入口 |

浅色状态文字：成功 `#15803D`、提醒 `#92400E`、信息 `#1D4ED8`、失败 `#B91C1C`。深色使用对应浅色文字与深色底，具体值以 `tokens.css` 为准。

颜色需要配合文字或图标，不能只用红绿表达成功失败。图表单系列使用 `--chart-1`；增加系列时按 `--chart-2` 至 `--chart-5` 顺序使用，并保留图例、提示与数值。图表颜色不代表业务结果好坏。

## 字体、数字与图标

| 层级 | 字号 / 行高 | 字重 | 示例 |
| --- | --- | --- | --- |
| 指标值 | 24 / 32，容器 ≥ 250px 时 30 / 36 | 600 | 粉丝、采集量 |
| 页面内容标题 | 20 / 28 | 600 | 独立详情标题 |
| 顶栏标题、卡片标题 | 16 / 24 | 500 / 600 | 运营概览、重点帖子 |
| 正文与控件 | 14 / 21 | 400 / 500 | 按钮、表格、表单 |
| 次级说明 | 12 / 16 或 13 / 20 | 400 | 时间、来源、辅助说明 |
| 代码与路径 | 12 / 16，系统等宽字体 | 400 | 插件目录、字段名 |

- 系统无衬线字体：Mac 优先系统字体，Windows 优先 Segoe UI，中文回退 PingFang SC / Microsoft YaHei。无需下载字体。
- 数值使用 `tabular-nums`，数值列右对齐。使用 `NumberValue` 区分未知、近似与零值。
- 移动输入框保留 16px 字号，避免 iOS 聚焦自动放大。
- 图标统一使用 Lucide 描边系列。按钮内默认 16px，品牌字标使用文字 OnHold。
- 带文字的装饰图标设置 `aria-hidden="true"`；只有图标的按钮必须有 `aria-label`。

## 间距、圆角与层级

| 项目 | 规则 |
| --- | --- |
| 间距基准 | 4px；常用 4、8、12、16、24、32、48px，对应 Tailwind 标准档位 |
| 控件内部 | 图文间距 8px，左右内边距依 size 决定 |
| 表单标签 | 标签到控件 8px；字段组之间 24px |
| 卡片 | 上下留白 24px，内容横向 24px，区块间距 24px |
| 页面边距 | 手机 / 平板 16px，桌面 24px |
| 圆角 | sm 6px、md 8px、lg 10px、xl 14px；输入框与按钮用 md，卡片用 xl，状态徽标保留胶囊形 |
| 层级 | 内容使用 border / shadow-sm；浮层使用上游组件的遮罩与 z-index，不为单个页面另加层级 |

## 基础组件

骨架屏单独预览：**http://127.0.0.1:1420/ui.html#skeleton**，包含卡片、列表、表格占位及完成态切换。骨架仅表示加载，不生成虚构指标；减少动态效果时显示静态占位。

| 组件 | 约定 | 不采用的方式 |
| --- | --- | --- |
| `Button` | `default` 主操作；`outline` 次操作；`secondary` 辅助操作；`ghost` 行内操作；`destructive` 危险操作；`link` 导航 | 用页面 CSS 把普通按钮染成另一套主色 |
| `Button` 尺寸 | `sm` 最小 32px、默认最小 36px、`lg` 最小 40px；图标按钮对应 `icon-sm` / `icon` / `icon-lg` | 同级操作混用尺寸 |
| `Input` / `Label` | 每个输入都有 label；错误用 `aria-invalid` 和 `aria-describedby` 关联说明 | 仅 placeholder 代替标签；错误只显示在页面顶部 |
| `Select` | 适合有限选项；Trigger 有可访问名称；保留方向键与 Esc | 用不能键盘操作的 div 下拉 |
| `Checkbox` | 带标签，保留 checked / indeterminate 语义；触屏时标签也可点 | 用颜色块模拟勾选状态 |
| `Tabs` | 默认分段用于筛选；`variant="line"` 用于内容层级 | 和当前页筛选无关的标签全部堆在一起 |
| `Card` | 用 Header / Content / Footer / Action 组合，统一内边距 | 每张卡片再定义不同 padding 与阴影 |
| `Table` | 数字右对齐；选中态使用 `data-state="selected"`；操作按钮含义明确 | 整行点击与行内操作相互抢事件 |
| `Sheet` | 查看详情或轻量编辑；保留标题、说明、关闭按钮与返回焦点 | 无出口的全屏遮罩；关闭后焦点丢失 |
| `Skeleton` | 仅表示加载中，不填入零或虚构指标 | 加载中显示 0 冒充真实数据 |

手机宽度 < 768px 或触屏设备上，按钮、输入、下拉、侧栏入口、标签页与抽屉关闭入口的点击高度至少 44px；图标按钮同时保证宽度。Checkbox 保持 16px 外观并扩展为 44px 点击区，结合可点击 Label 使用。基础视觉密度和点击区由共享主题处理。

文字放大时，按钮标签可以换行并增加高度，不裁切文字；图标按钮保持方形点击区。

处理中使用 `aria-busy`、加载图标和明确文案；不可重复的操作同时禁用按钮。禁用必须使用真正的 `disabled` 属性。

## OnHold 组合组件

| 组件 | 接口 | 规则 |
| --- | --- | --- |
| `Brand` | 无必填属性 | 统一文字字标 OnHold |
| `StatusBadge` | `tone`、`children` | tone 为 neutral / success / warning / danger / info，带状态点与文本 |
| `Notice` | `tone`、`children` | 提示图标与底色一致；danger 使用 alert，其余使用 status；一条提示给出一个结果或下一步 |
| `SectionTitle` | `title`、可选 `description` / `action` | 统一卡片标题和右侧操作；说明可省略 |
| `StatCard` | `label`、`value`、可选 `change` / `footer` | value 支持格式化节点；变化与周期分开，不能用累计值冒充周期增长 |
| `NumberValue` | `value`、可选 `approximate` / `compact` | null / undefined 显示 —，0 显示 0，近似数显示 ≈；compact 将万级大数缩写，精确值保留在提示或详情中 |
| `EmptyState` | `title`、可选 `description` / `action` / `icon` | 简短说明下一步；没有有效操作时不放按钮 |

```tsx
import { Button, NumberValue, StatCard, StatusBadge } from "@/components/onhold";
import "@/styles/onhold.css";

<StatCard
  label="已采集帖子"
  value={<NumberValue value={count} />}
  footer="近 7 天"
/>
<StatusBadge tone="success">已连接</StatusBadge>
<Button variant="outline" onClick={refresh}>刷新数据</Button>
```

`MetricCard`、帖子详情、采集状态等业务组件可在通用组件上封装数据口径，不把 X API 或数据库类型带入通用层。

## 页面模板与多端规则

| 可用宽度 | 导航 | 布局 |
| --- | --- | --- |
| < 768px | 运营应用使用五项底部导航；复杂层级可使用 Sidebar 抽屉 | 单列为主；指标可排两列；帖子、话题、账号和任务使用卡片列表 |
| 768–1023px | 可收起侧栏 | 页面边距 16px；卡片按剩余容器宽度决定列数 |
| ≥ 1024px | 288px 侧栏，48px 顶栏 | 页面边距 24px；保留模板的容器查询与响应式卡片 |

`SidebarInset` 已提供 main landmark，内部用 div 承载内容，页面只保留一个 main。

不能仅按整屏宽度把四张卡片强行排成一行；侧栏、窗口缩放和字体放大会减少内容可用宽度。详情默认宽 520px，手机使用当前可用宽度。

```tsx
<SidebarProvider>
  <AppSidebar variant="inset" {...navigation} />
  <SidebarInset>
    <SiteHeader title="内容分析">{actions}</SiteHeader>
    <div className="@container/main flex min-w-0 flex-1 flex-col gap-6 p-4 lg:p-6">
      {content}
    </div>
  </SidebarInset>
</SidebarProvider>
```

- 引导按安装 → 连接 → 完成推进，每次仅显示当前步骤，提供返回与明确出口。
- 内容只在需要时滚动，不隐藏滚动条来掩盖溢出。表格滚动不推宽整页。
- 长路径用只读输入框和复制按钮，不要求窗口横向展开。
- 插件弹窗、安装引导、React 后台共用基础组件与变量。X 页面内注入的旧样式尚未迁移；将来接入时使用 Shadow DOM 或严格作用域，不能向 X 全局注入 Tailwind Preflight。
- 手机功能与插件状态约定见 [移动端运营与 CDP 助手](MOBILE-OPERATIONS.md)。插件旧设置页通过构建导出的 `onhold-tokens.css` 共用主题，不向 X 页面注入这些样式。

## 交互与文字

- Hover / focus 等轻反馈 150ms；抽屉与遮罩 200ms。使用 `--motion-fast` / `--motion-panel`，避免布局跳动。系统减少动态效果时关闭动画与平滑滚动。
- 键盘 Tab 顺序与视觉顺序一致，焦点可见；下拉与抽屉可用 Esc 关闭，关闭后恢复触发点焦点。
- 通常每页只有一个主操作；错误要说明恢复方式。成功文案使用“已保存”“已连接”，无需长句复述流程。
- 字段中放必要帮助；技术配置折叠到高级设置。页面不重复展示产品口号。
- 账号、周期、来源、更新时间按数据实际情况展示；未知不等于零，近似值不伪装成精确值。

## 新组件与维护

1. 先检查已有组件；同一语义的变化优先增加 variant，不新增同义组件。
2. 多处使用的组合放进 `components/onhold`；只有一个业务页面使用的逻辑留在业务层。
3. 新颜色和尺寸先定义为语义 token，再由组件引用。主题修改不在页面分散实施。
4. 添加组件时同步预览中的默认、聚焦、禁用、错误、空与加载状态，检查深浅主题、375px 与桌面布局。
5. 先对照上游再更新源码，不能使用 shadcn `--overwrite` 覆盖已经沉淀的差异。公共属性或语义变化按设计系统版本记录。

本版沉淀的差异：统一语义状态色与对比度、独立主题文件、系统字体、触屏点击区、中文可访问名称、文字放大与按钮换行、150/200ms 动效、通用组合和按需图表入口。原版基础结构继续保留。

验证：`npm run app:build`；在已安装 Playwright 的环境执行 `node test/ui-browser.mjs`，也可通过 `PLAYWRIGHT_MODULE` 指定现有模块。测试覆盖主题对比、控件状态、表格筛选、抽屉焦点、移动导航、减弱动效与文本放大。

## 来源与许可

- [shadcn/ui GitHub](https://github.com/shadcn-ui/ui)：基础组件源码与 MIT 许可。
- [主题变量](https://ui.shadcn.com/docs/theming)、[Sidebar](https://ui.shadcn.com/docs/components/sidebar)：语义变量与导航组合方式。
- 当前源码由 shadcn CLI 4.23.0 的 New York / neutral、Radix 组件建立；本次没有切换到 Base UI 或升级底层依赖。
- 上游许可保留于 `app/src/components/ui/LICENSE` 和发行包的第三方声明中；OnHold 新增代码遵循仓库 LICENSE。OnHold UI 的名称不改变上游组件的许可与作者归属。

运营数据组件补充（0.8.7）：概览宽屏每行四项，窄屏每行两项；帖子计数使用 Lucide 图标与数字，保留无障碍名称和悬停说明。趋势使用 monotone 平滑曲线、细描边和浅填充；不足两个有效时间点显示摘要，缺失时间点保留断点，近似值带 ≈。X Analytics 的周期总量独立展示，不能把不同累计周期连成时间曲线；官方页面未提供的指标显示 —。

运营组件补充（0.9）：主色为黑、灰、蓝，沿用现有语义 token 和 X 风格图标控件。主导航移除连接与设置，右上角呼吸灯显示连接状态，点击打开账号与模型抽屉；自动化受限时指示灯常亮红色并全局提示。顶部费用政策标签使用白光斜扫 GIF，尊重减少动态效果设置。作者页固定三行图标链接，版本日志默认折叠。

官方账号分析使用 X 实际提供的周期与 CSV 每日数据，支持日、周、月聚合；全部指标同图用各自峰值100比较，悬停显示原值，点击指标卡切换单一原值曲线。缺失保留断点，不以本地采到的少量帖子冒充官方全量。定时采集刷新最近7天曲线，手动采集刷新全部可用周期。

创作者卡片补充（0.9.1）：账号指标与官方曲线先于资格进度展示，资格卡片正常随页面滚动。没有创作者快照时只显示标题与“尚未采集”，不画不确定进度、不展示空门槛或收益占位。部分采集时只展示已有资格项，真实零值仍显示零和零进度；插件弹窗复用同一规则。

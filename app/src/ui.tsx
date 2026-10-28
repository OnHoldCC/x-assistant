import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Code2,
  PanelsTopLeft,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  Palette,
  PanelLeft,
  Plus,
  Search,
  Sun,
  Table2,
} from "lucide-react";
import {
  Badge,
  Brand,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Input,
  Label,
  Notice,
  NumberValue,
  SectionTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  Skeleton,
  StatCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSidebar,
} from "@/components/onhold";
import type { StatusTone } from "@/components/onhold";
import { SiteHeader } from "@/app/site-header";
import { ChartAreaInteractive } from "@/features/overview/chart-area-interactive";
import type { Point } from "@/shared/types";
import "@/styles/onhold.css";

const sections = [
  { id: "foundations", label: "基础规范", icon: Palette },
  { id: "components", label: "基础组件", icon: Code2 },
  { id: "skeleton", label: "骨架屏", icon: PanelsTopLeft },
  { id: "patterns", label: "组合组件", icon: LayoutDashboard },
  { id: "data", label: "数据展示", icon: Table2 },
  { id: "layout", label: "布局与交互", icon: PanelLeft },
];
const readSection = () =>
  sections.find((item) => item.id === location.hash.slice(1))?.id ||
  "foundations";
const statusExamples: { tone: StatusTone; label: string }[] = [
  { tone: "neutral", label: "未连接" },
  { tone: "success", label: "已连接" },
  { tone: "info", label: "采集中" },
  { tone: "warning", label: "需要登录" },
  { tone: "danger", label: "采集失败" },
];
const colors = [
  ["背景", "--background"],
  ["正文", "--foreground"],
  ["主操作", "--primary"],
  ["次级背景", "--muted"],
  ["成功", "--success"],
  ["提醒", "--warning"],
  ["进行中", "--info"],
  ["失败", "--destructive"],
];
const demoRows = [
  {
    id: 1,
    name: "示例账号 A",
    count: 1280,
    approximate: false,
    tone: "success" as const,
    state: "已完成",
  },
  {
    id: 2,
    name: "示例账号 B",
    count: 5600,
    approximate: true,
    tone: "info" as const,
    state: "采集中",
  },
  {
    id: 3,
    name: "示例账号 C",
    count: null,
    approximate: false,
    tone: "warning" as const,
    state: "需要登录",
  },
];
const series: Point[] = Array.from({ length: 7 }, (_, index) => ({
  at: Date.UTC(2026, 9, 22 + index),
  label: `10/${22 + index}`,
  values: {
    views: [80, 120, 96, 160, 148, 220, 196][index],
    followers: 3 + index,
    following: null,
    likes: 8 + index,
    replies: 2 + index,
    reposts: index,
    bookmarks: null,
  },
  approximate: {
    views: false,
    followers: false,
    following: false,
    likes: false,
    replies: false,
    reposts: false,
    bookmarks: false,
  },
}));

function CatalogSidebar({ active }: { active: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="#foundations">
                <Brand />
                <Badge variant="outline" className="ml-auto">
                  UI
                </Badge>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton asChild isActive={active === item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={() => setOpenMobile(false)}
                      aria-current={active === item.id ? "page" : undefined}
                    >
                      <item.icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
          <span>OnHold UI 1.0</span>
          <span>React · TS</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function Foundations() {
  return (
    <>
      <Card>
        <SectionTitle
          title="颜色"
          description="黑白灰建立层级，颜色表达状态。"
        />
        <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {colors.map(([label, token]) => (
            <div
              key={token}
              className="min-w-0 overflow-hidden rounded-lg border"
            >
              <div
                className="h-16 border-b"
                style={{ background: `var(${token})` }}
              />
              <div className="space-y-1 p-3">
                <p className="text-sm font-medium">{label}</p>
                <code className="break-all text-xs text-muted-foreground">
                  {token}
                </code>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionTitle title="字体" description="系统字体，数字等宽对齐。" />
          <CardContent className="space-y-5">
            <div>
              <p className="text-3xl font-semibold tabular-nums">12,480</p>
              <p className="mt-1 text-xs text-muted-foreground">
                指标 · 30 / 36 · 600
              </p>
            </div>
            <div>
              <p className="text-xl font-semibold">内容分析</p>
              <p className="mt-1 text-xs text-muted-foreground">
                页面标题 · 20 / 28 · 600
              </p>
            </div>
            <div>
              <p className="text-sm">查看账号状态与最近采集记录。</p>
              <p className="mt-1 text-xs text-muted-foreground">
                正文 · 14 / 21 · 400
              </p>
            </div>
            <code className="block break-all text-xs text-muted-foreground">
              @/components/onhold
            </code>
          </CardContent>
        </Card>
        <Card>
          <SectionTitle
            title="间距与圆角"
            description="4px 基准，优先使用固定档位。"
          />
          <CardContent className="space-y-6">
            <div className="flex flex-wrap items-end gap-4">
              {[4, 8, 12, 16, 24, 32].map((value) => (
                <div key={value} className="space-y-2 text-center">
                  <div
                    className="w-8 rounded-sm bg-primary/15"
                    style={{ height: value }}
                  />
                  <code className="text-xs text-muted-foreground">{value}</code>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[
                ["sm", "6", "rounded-sm"],
                ["md", "8", "rounded-md"],
                ["lg", "10", "rounded-lg"],
                ["xl", "14", "rounded-xl"],
              ].map(([name, value, radiusClass]) => (
                <div
                  key={name}
                  data-radius-example={name}
                  className={`flex h-16 items-center justify-center border bg-muted text-xs ${radiusClass}`}
                >
                  {value}px
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <SectionTitle title="基本约定" />
        <CardContent className="grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="font-medium">一个页面，一个主操作</p>
            <p className="mt-1 text-muted-foreground">
              主按钮用实色，其他操作降级。
            </p>
          </div>
          <div>
            <p className="font-medium">先显示操作，再解释</p>
            <p className="mt-1 text-muted-foreground">标题短，说明按需出现。</p>
          </div>
          <div>
            <p className="font-medium">状态不能只靠颜色</p>
            <p className="mt-1 text-muted-foreground">
              标签、图标与颜色配合使用。
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Components() {
  const [message, setMessage] = useState("");
  const [enabled, setEnabled] = useState(true);
  return (
    <>
      <Card>
        <SectionTitle
          title="按钮"
          description="使用 variant 与 size，统一主次与尺寸。"
        />
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {(
              [
                "default",
                "secondary",
                "outline",
                "ghost",
                "destructive",
                "link",
              ] as const
            ).map((variant, index) => (
              <Button
                key={variant}
                variant={variant}
                onClick={() =>
                  setMessage(
                    `已点击${["主操作", "次操作", "描边按钮", "轻量操作", "危险操作", "文字链接"][index]}（示例）`,
                  )
                }
              >
                {
                  [
                    "主操作",
                    "次操作",
                    "描边按钮",
                    "轻量操作",
                    "危险操作",
                    "文字链接",
                  ][index]
                }
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMessage("小按钮已点击（示例）")}
            >
              小按钮
            </Button>
            <Button
              variant="outline"
              onClick={() => setMessage("默认按钮已点击（示例）")}
            >
              默认按钮
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => setMessage("大按钮已点击（示例）")}
            >
              大按钮
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="新建示例"
                  onClick={() => setMessage("已新建（示例）")}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>新建</TooltipContent>
            </Tooltip>
            <Button disabled>不可用</Button>
            <Button disabled aria-busy="true">
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              处理中
            </Button>
          </div>
          {message && <Notice tone="success">{message}</Notice>}
        </CardContent>
      </Card>
      <Card>
        <SectionTitle
          title="表单"
          description="保留标签，错误显示在对应字段下。"
        />
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="demo-name">账号名称</Label>
            <Input id="demo-name" placeholder="输入账号名称" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-frequency">采集频率</Label>
            <Select defaultValue="5">
              <SelectTrigger id="demo-frequency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">每 5 分钟</SelectItem>
                <SelectItem value="15">每 15 分钟</SelectItem>
                <SelectItem value="30">每 30 分钟</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-error">账号链接</Label>
            <Input
              id="demo-error"
              defaultValue="example"
              aria-invalid="true"
              aria-describedby="demo-error-message"
            />
            <p id="demo-error-message" className="text-xs text-destructive">
              请输入完整的 X 账号链接（示例）。
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-readonly">只读字段</Label>
            <Input id="demo-readonly" readOnly value="OnHold 示例工作空间" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-disabled">不可用字段</Label>
            <Input id="demo-disabled" disabled placeholder="连接后可用" />
          </div>
          <div className="flex items-center gap-3">
            <Checkbox
              id="demo-enabled"
              checked={enabled}
              onCheckedChange={(value) => setEnabled(value === true)}
            />
            <Label htmlFor="demo-enabled">自动采集（示例）</Label>
          </div>
        </CardContent>
      </Card>
      <Card>
        <SectionTitle title="标签页" />
        <CardContent>
          <Tabs defaultValue="overview">
            <TabsList aria-label="组件示例标签页">
              <TabsTrigger value="overview">概览</TabsTrigger>
              <TabsTrigger value="details">详情</TabsTrigger>
            </TabsList>
            <TabsContent
              value="overview"
              className="pt-4 text-sm text-muted-foreground"
            >
              已选择概览。
            </TabsContent>
            <TabsContent
              value="details"
              className="pt-4 text-sm text-muted-foreground"
            >
              已选择详情。
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}

function SkeletonExamples() {
  const [loading, setLoading] = useState(true);
  return (
    <>
      <Card>
        <SectionTitle
          title="骨架屏 Skeleton"
          description="加载期间占位，完成后替换为内容。"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLoading((value) => !value)}
            >
              {loading ? "查看完成态" : "返回骨架屏"}
            </Button>
          }
        />
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <section
            aria-label="卡片骨架示例"
            aria-busy={loading}
            className="space-y-4 rounded-xl border p-5"
          >
            <h3 className="text-sm font-medium">卡片</h3>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid h-32 place-items-center rounded-lg bg-muted">
                  <FileText
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm font-medium">示例内容</p>
                <p className="text-sm text-muted-foreground">
                  卡片内容已加载。
                </p>
              </div>
            )}
          </section>
          <section
            aria-label="列表骨架示例"
            aria-busy={loading}
            className="space-y-5 rounded-xl border p-5"
          >
            <h3 className="text-sm font-medium">列表</h3>
            {demoRows.map((row) => (
              <div key={row.id} className="flex items-center gap-3">
                {loading ? (
                  <>
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm">
                      {row.name.slice(-1)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        数据已加载
                      </p>
                    </div>
                  </>
                )}
              </div>
            ))}
          </section>
        </CardContent>
        <CardFooter>
          <Badge variant="outline">
            {loading ? "加载中 · 示例" : "加载完成 · 示例"}
          </Badge>
        </CardFooter>
      </Card>
      <Card>
        <SectionTitle title="表格骨架" />
        <CardContent>
          <section
            aria-label="表格骨架示例"
            aria-busy={loading}
            className="overflow-hidden rounded-xl border"
          >
            {loading ? (
              <div className="divide-y">
                {[0, 1, 2, 3].map((row) => (
                  <div key={row} className="grid grid-cols-3 gap-6 p-5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2 justify-self-end" />
                  </div>
                ))}
              </div>
            ) : (
              <Table aria-label="骨架完成态示例">
                <TableHeader>
                  <TableRow>
                    <TableHead>账号</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">采集量</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demoRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>
                        <StatusBadge tone={row.tone}>{row.state}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <NumberValue
                          value={row.count}
                          approximate={row.approximate}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </CardContent>
      </Card>
    </>
  );
}

function Patterns() {
  const [showContent, setShowContent] = useState(false);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="已采集帖子"
          value={<NumberValue value={1280} />}
          change={<Badge variant="outline">+24</Badge>}
          footer="近 7 天（示例）"
        />
        <StatCard
          label="浏览量"
          value={<NumberValue value={5600} approximate />}
          footer={<span className="text-muted-foreground">≈ 表示近似值</span>}
        />
        <StatCard
          label="收藏量"
          value={<NumberValue value={null} />}
          footer={
            <span className="text-muted-foreground">
              — 表示未知，0 表示已观测为零
            </span>
          }
        />
        <StatCard
          label="已观测零值"
          value={<NumberValue value={0} />}
          footer={<span className="text-muted-foreground">0 表示已知为零</span>}
        />
      </div>
      <Card>
        <SectionTitle title="状态标签" />
        <CardContent className="flex flex-wrap gap-3">
          {statusExamples.map((item) => (
            <StatusBadge key={item.tone} tone={item.tone}>
              {item.label}
            </StatusBadge>
          ))}
        </CardContent>
      </Card>
      <Card>
        <SectionTitle title="反馈提示" />
        <CardContent className="space-y-3">
          <Notice tone="info">任务已排队（示例）。</Notice>
          <Notice tone="success">设置已保存（示例）。</Notice>
          <Notice tone="warning">登录已失效，请重新登录（示例）。</Notice>
          <Notice tone="danger">连接失败，请检查助手状态（示例）。</Notice>
        </CardContent>
      </Card>
      <Card>
        <SectionTitle
          title="空状态"
          action={
            showContent ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowContent(false)}
              >
                重置示例
              </Button>
            ) : undefined
          }
        />
        {showContent ? (
          <CardContent>
            <Notice tone="success">已添加一条示例内容。</Notice>
          </CardContent>
        ) : (
          <EmptyState
            title="暂无内容"
            description="添加内容后显示在这里。"
            action={
              <Button onClick={() => setShowContent(true)}>
                <Plus aria-hidden="true" />
                添加示例内容
              </Button>
            }
          />
        )}
      </Card>
    </>
  );
}

function DataExamples() {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState("name");
  const [selected, setSelected] = useState<number[]>([]);
  const rows = demoRows
    .filter((row) => row.name.includes(query))
    .sort((a, b) =>
      order === "count" ? (b.count ?? -1) - (a.count ?? -1) : a.id - b.id,
    );
  return (
    <>
      <Card className="min-w-0 overflow-hidden">
        <SectionTitle
          title="表格"
          action={<Badge variant="outline">示例数据</Badge>}
        />
        <CardContent className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="搜索示例账号"
              className="pl-9"
              type="search"
              placeholder="搜索示例账号"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select value={order} onValueChange={setOrder}>
            <SelectTrigger aria-label="示例表格排序">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">名称排序</SelectItem>
              <SelectItem value="count">数量排序</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
        <div className="min-w-0 overflow-x-auto">
          <Table aria-label="OnHold 示例账号">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <span className="sr-only">选择</span>
                </TableHead>
                <TableHead>账号</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">采集量</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={
                    selected.includes(row.id) ? "selected" : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`选择${row.name}`}
                      checked={selected.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelected((items) =>
                          checked === true
                            ? [...items.filter((id) => id !== row.id), row.id]
                            : items.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    {row.name}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={row.tone}>{row.state}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <NumberValue
                      value={row.count}
                      approximate={row.approximate}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`查看${row.name}`}
                        >
                          查看
                          <ArrowRight aria-hidden="true" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="w-full sm:max-w-lg">
                        <SheetHeader>
                          <SheetTitle>{row.name}</SheetTitle>
                          <SheetDescription>
                            详情抽屉 · 示例数据
                          </SheetDescription>
                        </SheetHeader>
                        <div className="space-y-6 px-4">
                          <StatusBadge tone={row.tone}>{row.state}</StatusBadge>
                          <StatCard
                            label="已采集"
                            value={
                              <NumberValue
                                value={row.count}
                                approximate={row.approximate}
                              />
                            }
                            footer="仅用于展示组件状态"
                          />
                        </div>
                        <SheetFooter>
                          <p className="text-xs text-muted-foreground">
                            Esc 关闭并返回原来的按钮。
                          </p>
                        </SheetFooter>
                      </SheetContent>
                    </Sheet>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!rows.length && <EmptyState title="没有匹配的账号" />}
        <CardFooter className="justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {rows.length} 条示例 · 已选 {selected.length} 条
          </span>
          <span>— 未知 · ≈ 近似值</span>
        </CardFooter>
      </Card>
      <div className="space-y-3">
        <div className="flex justify-end">
          <Badge variant="outline">趋势图 · 示例数据</Badge>
        </div>
        <ChartAreaInteractive series={series} />
      </div>
    </>
  );
}

function LayoutExamples() {
  const [step, setStep] = useState(0);
  return (
    <>
      <Card>
        <SectionTitle
          title="多端布局"
          description="同一套组件，根据可用空间适配。"
        />
        <CardContent className="overflow-x-auto">
          <Table aria-label="布局规范">
            <TableHeader>
              <TableRow>
                <TableHead>空间</TableHead>
                <TableHead>导航</TableHead>
                <TableHead>内容</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["手机 < 768px", "抽屉侧栏", "单列，16px 边距，44px 点击区"],
                [
                  "平板 768–1023px",
                  "可收起侧栏",
                  "16px 边距，卡片按容器宽度排列",
                ],
                [
                  "桌面 ≥ 1024px",
                  "288px 侧栏，48px 顶栏",
                  "24px 边距，表格在自身内部滚动",
                ],
              ].map((row) => (
                <TableRow key={row[0]}>
                  {row.map((cell, index) => (
                    <TableCell
                      className={
                        index === 0 ? "whitespace-nowrap font-medium" : ""
                      }
                      key={cell}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="mx-auto w-full max-w-lg">
        <CardHeader>
          <CardDescription>分步引导 · 示例</CardDescription>
          <CardTitle>{["安装助手", "连接账号", "设置完成"][step]}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol
            aria-label="引导示例步骤"
            className="flex flex-wrap gap-4 text-sm"
          >
            {["安装", "连接", "完成"].map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? "step" : undefined}
                className={
                  step === index ? "font-medium" : "text-muted-foreground"
                }
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-muted-foreground">
            {
              [
                "每次只显示当前步骤的操作。",
                "成功后进入下一步，保留返回入口。",
                "显示完成状态，提供明确出口。",
              ][step]
            }
          </p>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <Button
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep((value) => value - 1)}
          >
            上一步
          </Button>
          <Button
            onClick={() => setStep((value) => (step === 2 ? 0 : value + 1))}
          >
            {step === 2 ? "重新演示" : "下一步"}
            <ArrowRight aria-hidden="true" />
          </Button>
        </CardFooter>
      </Card>
      <Card>
        <SectionTitle title="实现约定" />
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>键盘可操作；焦点可见；Esc 关闭抽屉后恢复焦点。</p>
          <p>轻反馈 150ms，面板 200ms；系统减少动态效果时关闭动画。</p>
          <p>
            共享组件来自{" "}
            <code className="break-all font-mono text-xs text-foreground">
              @/components/onhold
            </code>
            ，图表按需从 charts 子入口导入。
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function Showcase() {
  const [section, setSection] = useState(readSection);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const change = () => setSection(readSection());
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const title = sections.find((item) => item.id === section)!.label;
  return (
    <SidebarProvider data-ui-library="onhold-ui" data-ui-base="shadcn/ui">
      <a
        href="#catalog-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("catalog-content")?.focus();
        }}
        className="sr-only fixed top-2 left-2 z-[100] rounded-md bg-background p-3 text-sm focus:not-sr-only"
      >
        跳到内容
      </a>
      <CatalogSidebar active={section} />
      <SidebarInset>
        <SiteHeader title={title}>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            OnHold UI · 设计规范
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label={dark ? "切换为浅色" : "切换为深色"}
            onClick={() => setDark((value) => !value)}
          >
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </Button>
        </SiteHeader>
        <div
          id="catalog-content"
          tabIndex={-1}
          className="@container/main flex min-w-0 flex-1 flex-col gap-6 p-4 lg:p-6"
        >
          {section === "foundations" ? (
            <Foundations />
          ) : section === "components" ? (
            <Components />
          ) : section === "skeleton" ? (
            <SkeletonExamples />
          ) : section === "patterns" ? (
            <Patterns />
          ) : section === "data" ? (
            <DataExamples />
          ) : (
            <LayoutExamples />
          )}
        </div>
        <footer className="px-4 py-4 text-xs text-muted-foreground lg:px-6">
          OnHold UI 1.0 · 基于 shadcn/ui / Radix · 展示数据均为示例
        </footer>
      </SidebarInset>
    </SidebarProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Showcase />);

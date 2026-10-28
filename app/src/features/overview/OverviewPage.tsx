import {
  Button,
  Card,
  EmptyState,
  Notice,
  SectionTitle,
  StatCard,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/onhold";
import { OfficialAnalytics } from "@/features/overview/analytics-overview";
import { ChartAreaInteractive } from "@/features/overview/chart-area-interactive";
import { CreatorPanel } from "@/features/overview/creator-panel";
import { summarizePosts } from "@/shared/metrics";
import { MetricCard, PostPerformanceTable, time } from "@/shared/operations";
import type { Dashboard, Post } from "@/shared/types";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  Eye,
  FileText,
  Heart,
  Info,
  MessageCircle,
  Repeat2,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo } from "react";

export function OverviewPage({
  data,
  overviewTab,
  setOverviewTab,
  ready,
  analyticsReady,
  goConnect,
  load,
  setDetail,
}: {
  data: Dashboard | null;
  overviewTab: string;
  setOverviewTab: (tab: string) => void;
  ready: boolean;
  analyticsReady: boolean;
  goConnect: () => void;
  load: () => Promise<void>;
  setDetail: (post: Post) => void;
}) {
  const selected = data?.account,
    posts = data?.posts || [],
    current = data?.accounts.find((item) => item.handle === selected);
  const leaders = useMemo(
    () =>
      [...posts]
        .filter((post) => post.metrics.views?.value != null)
        .sort((a, b) => b.metrics.views.value! - a.metrics.views.value!)
        .slice(0, 3),
    [posts],
  );
  const summary = useMemo(() => summarizePosts(posts), [posts]);
  return (
    <>
      <div className="overview-toolbar">
        <Tabs value={overviewTab} onValueChange={setOverviewTab}>
          <TabsList variant="line" aria-label="统计来源">
            <TabsTrigger value="observed">观测数据</TabsTrigger>
            <TabsTrigger value="official">账号分析</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="update-time">
          <Clock3 aria-hidden="true" />
          {current ? "更新于 " + time(current.last_seen) : "等待首次采集"}
        </span>
      </div>
      {overviewTab === "official" ? (
        <>
          <OfficialAnalytics key={data?.account} data={data} />
          <CreatorPanel
            key={data?.account}
            summary={data?.creator}
            onSaved={load}
          />
          {ready && !analyticsReady && (
            <Notice tone="warning">
              请重载新版 X 助手后采集官方分析。
              <Button variant="link" onClick={goConnect}>
                更新助手
              </Button>
            </Notice>
          )}
        </>
      ) : (
        <>
          <div className="metric-grid grid grid-cols-2 gap-4 @3xl/main:grid-cols-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs">
            {(
              [
                ["followers", "当前粉丝", Users],
                ["following", "当前关注", UserPlus],
                ["views", "已采集浏览量", Eye],
                ["likes", "已采集点赞", Heart],
                ["replies", "已采集评论", MessageCircle],
                ["reposts", "已采集转发", Repeat2],
                ["bookmarks", "已采集收藏", Bookmark],
              ] as const
            ).map(([name, label, icon]) => (
              <MetricCard
                key={name}
                label={label}
                value={data?.metrics[name]?.value}
                delta={data?.metrics[name]}
                approximate={data?.metrics[name]?.approximate}
                detail="周期净增"
                icon={icon}
              />
            ))}
            <StatCard
              label="可比帖评论率"
              value={
                summary.commentRate === null
                  ? "—"
                  : (summary.approximate ? "≈" : "") +
                    summary.commentRate.toFixed(3) +
                    "%"
              }
              footer={
                <span className="text-muted-foreground">
                  累计观测 · 覆盖 {summary.comparable} / {posts.length} 条帖子
                </span>
              }
            />
          </div>
          {!selected && (
            <Card className="welcome">
              <EmptyState
                title="尚未连接账号"
                description="连接 X 助手后开始采集。"
                action={
                  <Button onClick={goConnect}>
                    连接 X 助手插件
                    <ArrowRight aria-hidden="true" />
                  </Button>
                }
              />
            </Card>
          )}
          {selected && !ready && (
            <Notice tone="warning">
              采集已暂停。请在电脑上打开 X 助手，检查连接与登录。
              <Button variant="link" onClick={goConnect}>
                查看连接
              </Button>
            </Notice>
          )}
          <ChartAreaInteractive
            series={data?.series || []}
            metrics={data?.metrics}
          />
          <Card className="table-panel">
            <SectionTitle
              title="重点帖子"
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    location.hash = "posts";
                  }}
                >
                  全部内容
                  <ArrowRight aria-hidden="true" />
                </Button>
              }
            />
            {leaders.length ? (
              <PostPerformanceTable
                posts={leaders}
                onSelect={setDetail}
                compact
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="还没有可复盘的帖子"
                description="采集后显示帖子数据。"
              />
            )}
          </Card>
          <div className="source-note">
            <Info aria-hidden="true" />
            <span>— 未采集 · ≈ 近似值 · 评论率按同次观测计算</span>
          </div>
        </>
      )}
    </>
  );
}

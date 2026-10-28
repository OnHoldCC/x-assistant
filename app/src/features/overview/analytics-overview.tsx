import {
  Button,
  Card,
  EmptyState,
  NumberValue,
  SectionTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/onhold";
import { ChartContainer, ChartTooltip } from "@/components/onhold/charts";
import { analyticsChartData } from "@/shared/metrics";
import { time } from "@/shared/operations";
import type { AnalyticsPoint, Dashboard } from "@/shared/types";
import {
  Bookmark,
  Eye,
  FileText,
  Heart,
  MessageCircle,
  MousePointer2,
  Percent,
  Repeat2,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

const periods: Record<string, string> = {
  "1d": "1D",
  "7d": "7D",
  "14d": "2W",
  "28d": "4W",
  "30d": "30D",
  "90d": "3M",
  "365d": "1Y",
};
const metrics = [
  ["impressions", "曝光量", Eye],
  ["engagements", "总互动", MousePointer2],
  ["engagement_rate", "互动率", Percent],
  ["profile_visits", "主页访问", Users],
  ["new_follows", "新增关注", UserPlus],
  ["net_follows", "净增关注", Users],
  ["likes", "点赞", Heart],
  ["replies", "评论", MessageCircle],
  ["reposts", "转发", Repeat2],
  ["bookmarks", "收藏", Bookmark],
  ["shares", "分享", Share2],
  ["posts", "发布帖子", FileText],
] as const;
const color = (key: string) =>
  `var(--chart-${(metrics.findIndex(([name]) => name === key) % 5) + 1})`;
export function OfficialAnalytics({ data }: { data: Dashboard | null }) {
  const [period, setPeriod] = useState("7d"),
    [selected, setSelected] = useState<string | null>(null),
    [grain, setGrain] = useState("day");
  const legacy = data?.analytics,
    aliases: Record<string, string> = {
      "2w": "14d",
      "4w": "28d",
      "3m": "90d",
      "1y": "365d",
    },
    raw = legacy?.data.period?.toLowerCase() || "",
    legacyKey = legacy?.data.period_key || aliases[raw] || raw;
  const snapshot =
      data?.analytics_periods?.[period] ||
      (legacyKey === period ? legacy : null),
    counts = { ...(snapshot?.data.metrics || {}) };
  if (counts.new_follows && counts.unfollows)
    counts.net_follows = {
      value: counts.new_follows.value - counts.unfollows.value,
      raw: "",
      approximate: !!(
        counts.new_follows.approximate || counts.unfollows.approximate
      ),
    };
  const available = data?.analytics?.data.available_periods || [
    "7d",
    "14d",
    "28d",
    "90d",
    "365d",
  ];
  const series = analyticsChartData(snapshot?.data.series || [], grain);
  const shown = selected
    ? metrics.filter(([key]) => key === selected)
    : metrics.filter(([key]) =>
        series.some((point) => point.metrics[key] != null),
      );
  const peaks = Object.fromEntries(
    shown.map(([key]) => [
      key,
      Math.max(0, ...series.map((point) => Math.abs(point.metrics[key] ?? 0))),
    ]),
  );
  const chartData = series.map((point) => ({
    ...point,
    ...Object.fromEntries(
      shown.map(([key]) => [
        key,
        point.metrics[key] == null
          ? null
          : selected
            ? point.metrics[key]
            : peaks[key]
              ? (point.metrics[key]! / peaks[key]) * 100
              : 0,
      ]),
    ),
  }));
  const valid = series.filter((point) =>
    shown.some(([key]) => point.metrics[key] != null),
  );
  const description = selected
    ? metrics.find(([key]) => key === selected)?.[1] + "实际值"
    : "各指标峰值为 100，悬停查看实际值";
  return (
    <Card className="analytics-card">
      <SectionTitle
        title="账号表现"
        action={
          <div className="analytics-controls">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger aria-label="官方统计周期" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(periods)
                  .filter(
                    ([key]) =>
                      available.includes(key) ||
                      data?.analytics_periods?.[key] ||
                      key === period,
                  )
                  .map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={grain} onValueChange={setGrain}>
              <SelectTrigger aria-label="趋势时间粒度" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">每日</SelectItem>
                <SelectItem value="week">每周</SelectItem>
                <SelectItem value="month">每月</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
      <div
        className="analytics-grid analytics-selectors"
        aria-label="选择曲线指标"
      >
        {metrics.map(([name, label, Icon], index) => (
          <button
            key={name}
            type="button"
            aria-pressed={selected === name}
            onClick={() => setSelected(selected === name ? null : name)}
            title={name === "engagement_rate" ? "总互动 ÷ 曝光 × 100%" : label}
          >
            <span>
              <Icon aria-hidden="true" />
              {label}
              <i style={{ background: `var(--chart-${(index % 5) + 1})` }} />
            </span>
            <strong>
              {name === "engagement_rate" ? (
                counts[name] ? (
                  counts[name].value.toLocaleString("zh-CN", {
                    maximumFractionDigits: 2,
                  }) + "%"
                ) : (
                  "—"
                )
              ) : (
                <NumberValue
                  value={counts[name]?.value}
                  approximate={counts[name]?.approximate}
                  compact
                />
              )}
            </strong>
          </button>
        ))}
      </div>
      <div className="analytics-chart-heading">
        <span>{description}</span>
        <Button
          size="sm"
          variant={selected ? "ghost" : "secondary"}
          aria-pressed={!selected}
          onClick={() => setSelected(null)}
        >
          全部指标
        </Button>
      </div>
      {valid.length >= 2 ? (
        <ChartContainer
          config={Object.fromEntries(
            shown.map(([key, label], index) => [
              key,
              { label, color: `var(--chart-${(index % 5) + 1})` },
            ]),
          )}
          className="analytics-line-chart"
          role="img"
          aria-label={
            (selected
              ? metrics.find(([key]) => key === selected)?.[1]
              : "多指标") + "官方趋势"
          }
        >
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{ top: 12, right: 18, bottom: 8, left: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(date) => date.slice(5).replace("-", "/")}
              minTickGap={36}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={48}
              tickLine={false}
              axisLine={false}
              allowDecimals={selected === "engagement_rate"}
              domain={selected ? ["auto", "auto"] : ["auto", 100]}
              tickFormatter={(value) =>
                selected === "engagement_rate"
                  ? value + "%"
                  : Math.abs(value) >= 1000
                    ? (value / 1000).toLocaleString("zh-CN", {
                        maximumFractionDigits: 1,
                      }) + "k"
                    : String(value)
              }
            />
            <ChartTooltip
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as
                  | AnalyticsPoint
                  | undefined;
                return active && point ? (
                  <div className="analytics-tooltip">
                    <strong>{point.date}</strong>
                    {shown.map(([key, label], index) => (
                      <div key={key}>
                        <span>
                          <i
                            style={{
                              background: `var(--chart-${(index % 5) + 1})`,
                            }}
                          />
                          {label}
                        </span>
                        <b>
                          {point.metrics[key] == null
                            ? "—"
                            : point.metrics[key]!.toLocaleString("zh-CN", {
                                maximumFractionDigits:
                                  key === "engagement_rate" ? 3 : 0,
                              }) + (key === "engagement_rate" ? "%" : "")}
                        </b>
                      </div>
                    ))}
                  </div>
                ) : null;
              }}
            />
            {shown.map(([key], index) => (
              <Line
                key={key}
                name={key}
                dataKey={key}
                type="monotone"
                stroke={`var(--chart-${(index % 5) + 1})`}
                strokeDasharray={
                  index < 5 ? undefined : index % 2 ? "6 3" : "2 3"
                }
                strokeWidth={selected ? 2.5 : 1.75}
                dot={series.length < 15 ? { r: 2 } : false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
      ) : (
        <EmptyState
          title={
            snapshot?.data.series?.length
              ? "当前指标时间点不足"
              : "尚未采集官方曲线"
          }
          description="采集运营数据后展示 X 官方逐日记录。"
        />
      )}
      <p className="muted">
        {snapshot
          ? periods[period] +
            " · " +
            time(snapshot.observed_at) +
            " · X 官方导出" +
            (snapshot.data.verified_only ? " · 仅认证用户" : "")
          : "等待首次采集"}
      </p>
    </Card>
  );
}

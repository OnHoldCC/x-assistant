import type { AnalyticsPoint, Dashboard } from "@/shared/types";
import { analyticsChartData, analyticsRewardEstimate } from "../../shared/metrics.ts";
export const analyticsMetrics = [
  ["impressions", "曝光量", "mdi:eye-outline"],
  ["engagements", "总互动", "mdi:cursor-default-outline"],
  ["engagement_rate", "互动率", "mdi:percent"],
  ["profile_visits", "主页访问", "mdi:account-multiple-outline"],
  ["new_follows", "新增关注", "mdi:account-plus-outline"],
  ["net_follows", "净增关注", "mdi:account-multiple-outline"],
  ["likes", "点赞", "mdi:heart-outline"],
  ["replies", "评论", "mdi:comment-outline"],
  ["reposts", "转发", "mdi:repeat"],
  ["bookmarks", "收藏", "mdi:bookmark-outline"],
  ["shares", "分享", "mdi:share-variant-outline"],
  ["posts", "发布帖子", "mdi:file-document-outline"],
  ["reward_estimate", "奖励参考", "mdi:currency-usd"],
] as const;
export const chartColors = [
  "#f8cc46",
  "#52d5a6",
  "#83b9ff",
  "#dc85c4",
  "#baa0ed",
];
export const metricColor = (key: string) =>
  chartColors[analyticsMetrics.findIndex(([name]) => name === key) % 5];
export const periods: Record<string, string> = {
  "1d": "1D",
  "7d": "7D",
  "14d": "2W",
  "28d": "4W",
  "30d": "30D",
  "90d": "3M",
  "365d": "1Y",
};
export function analyticsSnapshot(
  data: Dashboard | null,
  period: string,
) {
  const legacy = data?.analytics,
    aliases: Record<string, string> = {
      "2w": "14d",
      "4w": "28d",
      "3m": "90d",
      "1y": "365d",
    },
    raw = legacy?.data.period?.toLowerCase() || "",
    legacyKey = legacy?.data.period_key || aliases[raw] || raw;
  return data?.analytics_periods?.[period] || (legacyKey === period ? legacy : null);
}
export function analyticsModel(
  data: Dashboard | null,
  period: string,
  grain: string,
  selected: string | null,
) {
  const snapshot = analyticsSnapshot(data, period);
  const counts = { ...(snapshot?.data.metrics || {}) };
  if (counts.new_follows && counts.unfollows)
    counts.net_follows = {
      value: counts.new_follows.value - counts.unfollows.value,
      raw: "",
      approximate:
        counts.new_follows.approximate || counts.unfollows.approximate,
    };
  const reward = analyticsRewardEstimate(snapshot, data?.creator);
  const series = analyticsChartData(
    (snapshot?.data.series || []).map((p) => ({
      ...p,
      metrics: {
        ...p.metrics,
        reward_estimate:
          reward.calibrated && p.metrics.impressions != null
            ? (p.metrics.impressions * data!.creator!.calibration!.payout) /
              data!.creator!.calibration!.impressions
            : null,
      },
    })),
    grain,
  );
  if (reward.calibrated && reward.amount != null)
    counts.reward_estimate = {
      value: reward.amount,
      raw: "",
      approximate: true,
    };
  const metrics = analyticsMetrics.filter(
      ([key]) => key !== "reward_estimate" || reward.calibrated,
    ),
    shown = selected ? metrics.filter(([key]) => key === selected) : metrics;
  const peaks = Object.fromEntries(
    shown.map(([key]) => [
      key,
      Math.max(0, ...series.map((p) => Math.abs(p.metrics[key] ?? 0))),
    ]),
  );
  const values = series.map((p) =>
    Object.fromEntries(
      shown.map(([key]) => [
        key,
        p.metrics[key] == null
          ? null
          : selected
            ? p.metrics[key]
            : peaks[key]
              ? ((p.metrics[key] ?? 0) / peaks[key]) * 100
              : 0,
      ]),
    ),
  );
  return { snapshot, counts, reward, series, metrics, shown, peaks, values };
}
export function metricText(
  value: number | null | undefined,
  key: string,
  currency: string,
) {
  if (value == null) return "未采集";
  return key === "reward_estimate"
    ? value.toLocaleString("zh-CN", { style: "currency", currency })
    : value.toLocaleString("zh-CN", {
        maximumFractionDigits: key === "engagement_rate" ? 3 : 0,
      }) + (key === "engagement_rate" ? "%" : "");
}

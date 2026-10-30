import type { MetricName, Metric, Post } from "@/shared/types";
export function interactionMetrics(
  metrics: Partial<Record<MetricName, Metric>>,
) {
  const views = metrics.views?.value,
    replies = metrics.replies?.value,
    likes = metrics.likes?.value,
    reposts = metrics.reposts?.value;
  const validViews = views != null && views > 0;
  const sameObservation = (names: MetricName[]) => {
    const at = metrics.views?.observed_at;
    return (
      at != null && names.every((name) => metrics[name]?.observed_at === at)
    );
  };
  return {
    commentRate:
      validViews && replies != null && sameObservation(["replies"])
        ? (replies / views) * 100
        : null,
    weightedRate:
      validViews &&
      likes != null &&
      replies != null &&
      reposts != null &&
      sameObservation(["likes", "replies", "reposts"])
        ? ((0.66 * likes + 5 * replies + reposts) / views) * 100
        : null,
    approximate: [
      metrics.views,
      metrics.replies,
      metrics.likes,
      metrics.reposts,
    ].some((m) => m?.approximate),
  };
}
export function summarizePosts(posts: Post[]) {
  const pairs = posts.filter((post) => {
    const { views, replies } = post.metrics;
    return (
      views?.value != null &&
      replies?.value != null &&
      views.observed_at != null &&
      views.observed_at === replies.observed_at
    );
  });
  const views = pairs.reduce((sum, post) => sum + post.metrics.views.value!, 0),
    replies = pairs.reduce((sum, post) => sum + post.metrics.replies.value!, 0);
  return {
    commentRate: views > 0 ? (replies / views) * 100 : null,
    comparable: pairs.length,
    approximate: pairs.some(
      (post) =>
        post.metrics.views.approximate || post.metrics.replies.approximate,
    ),
    knownViews: posts.filter((post) => post.metrics.views?.value != null)
      .length,
  };
}

export function analyticsChartData(
  series: import("@/shared/types").AnalyticsPoint[],
  grain: string,
): import("@/shared/types").AnalyticsPoint[] {
  if (grain === "day") return series;
  const grouped = new Map<string, import("@/shared/types").AnalyticsPoint>();
  for (const point of series) {
    const date = new Date(point.date + "T00:00:00Z");
    if (grain === "week")
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key =
      grain === "month"
        ? point.date.slice(0, 7)
        : date.toISOString().slice(0, 10);
    const previous = grouped.get(key);
    if (!previous) {
      grouped.set(key, { date: point.date, metrics: { ...point.metrics } });
      continue;
    }
    for (const name of new Set([
      ...Object.keys(previous.metrics),
      ...Object.keys(point.metrics),
    ])) {
      previous.metrics[name] =
        previous.metrics[name] == null || point.metrics[name] == null
          ? null
          : previous.metrics[name]! + point.metrics[name]!;
    }
  }
  return [...grouped.values()].map((point) => ({
    ...point,
    metrics: {
      ...point.metrics,
      engagement_rate:
        point.metrics.impressions! > 0 && point.metrics.engagements != null
          ? (point.metrics.engagements / point.metrics.impressions!) * 100
          : null,
    },
  }));
}
export function creatorOutlook(
  creator: import("@/shared/types").CreatorData | undefined,
  assumptions: import("@/shared/types").EarningsAssumptions | null | undefined,
) {
  const targets = [creator?.verified_followers, creator?.verified_impressions];
  const valid = targets.every(
    (item) =>
      item &&
      Number.isFinite(item.current.value) &&
      item.current.value >= 0 &&
      item.target > 0,
  );
  const numericMet =
    valid && targets.every((item) => item!.current.value >= item!.target);
  const blocked = creator?.state === "ineligible" || (valid && !numericMet);
  const amount = blocked
    ? 0
    : assumptions &&
        Number.isSafeInteger(assumptions.qualified30) &&
        assumptions.qualified30 >= 0 &&
        Number.isFinite(assumptions.rpmCny) &&
        assumptions.rpmCny >= 0
      ? (assumptions.qualified30 / 1000) * assumptions.rpmCny
      : null;
  return {
    blocked,
    amount,
    progress: valid
      ? Math.min(
          1,
          ...targets.map((item) => item!.current.value / item!.target),
        ) * 100
      : null,
  };
}

export function analyticsRewardEstimate(
  snapshot: import("@/shared/types").AnalyticsSnapshot | null | undefined,
  summary: import("@/shared/types").CreatorSummary | null | undefined,
) {
  const calibration = summary?.calibration;
  const currency = calibration?.currency || "USD";
  const blocked = creatorOutlook(summary?.snapshot?.data, null).blocked;
  if (blocked) return { amount: 0, currency, impressions: null, calibrated: false };
  const series = snapshot?.data.series;
  if (!calibration || !series?.length || calibration.impressions <= 0 || !Number.isFinite(calibration.payout) || calibration.payout < 0 || calibration.verified_only !== (snapshot?.data.verified_only === true))
    return { amount: null, currency, impressions: null, calibrated: false };
  let impressions = 0;
  for (const point of series) {
    const value = point.metrics.impressions;
    if (value == null || !Number.isSafeInteger(value) || value < 0) return { amount: null, currency, impressions: null, calibrated: false };
    impressions += value;
    if (!Number.isSafeInteger(impressions)) return { amount: null, currency, impressions: null, calibrated: false };
  }
  const amount = impressions * calibration.payout / calibration.impressions;
  return { amount: Number.isFinite(amount) ? amount : null, currency, impressions, calibrated: true };
}

export function unsettledRewardEstimate(
  snapshots: Record<string, import("@/shared/types").AnalyticsSnapshot>,
  summary: import("@/shared/types").CreatorSummary | null | undefined,
  today = new Date().toISOString().slice(0, 10),
) {
  const calibration = summary?.calibration;
  const empty = { amount: null, currency: calibration?.currency || "USD", start: null, end: today, through: null };
  if (!calibration) return { ...empty, reason: "待添加上次结算" };
  const startTime = Date.parse(calibration.end_date + "T00:00:00Z") + 86400000;
  if (!Number.isFinite(startTime) || startTime > Date.parse(today + "T00:00:00Z"))
    return { ...empty, reason: "结算周期尚未结束" };
  const start = new Date(startTime).toISOString().slice(0, 10);
  const points = new Map<string, import("@/shared/types").AnalyticsPoint>();
  for (const snapshot of Object.values(snapshots).sort((a, b) => a.observed_at - b.observed_at)) {
    if ((snapshot.data.verified_only === true) !== calibration.verified_only) continue;
    for (const point of snapshot.data.series || [])
      if (point.date >= start && point.date <= today) points.set(point.date, point);
  }
  const series = [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
  const through = series.at(-1)?.date || null;
  // Today's export may lag; never fill a missing earlier day with zero.
  for (let at = startTime; at < Date.parse(today + "T00:00:00Z"); at += 86400000)
    if (!points.has(new Date(at).toISOString().slice(0, 10)))
      return { ...empty, start, through, reason: "本期逐日数据不完整，请采集官方分析" };
  const estimate = analyticsRewardEstimate({ data: { series, verified_only: calibration.verified_only }, observed_at: 0, source: "x" }, summary);
  return { amount: estimate.amount, currency: estimate.currency, start, end: today, through,
    reason: estimate.amount == null ? "等待本期官方曝光数据" : through !== today ? "今日数据尚未更新" : "今日数据持续更新" };
}

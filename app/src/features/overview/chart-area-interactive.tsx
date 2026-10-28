import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  NumberValue,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/onhold";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/onhold/charts";
import type { Metric, MetricName, Point } from "@/shared/types";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
const labels = {
  views: "浏览量",
  followers: "粉丝",
  replies: "评论",
  likes: "点赞",
  reposts: "转发",
  bookmarks: "收藏",
};
export function ChartAreaInteractive({
  series,
  metrics,
}: {
  series: Point[];
  metrics?: Partial<Record<MetricName, Metric>>;
}) {
  const [metric, setMetric] =
    useState<Exclude<MetricName, "following">>("views");
  const values = series.map((point) => ({
    label: point.label,
    value: point.values[metric] ?? null,
    approximate: point.approximate?.[metric] || false,
  }));
  const known = values.filter((point) => point.value !== null);
  const current = metrics?.[metric];
  return (
    <Card className="@container/card">
      <CardHeader className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <CardTitle>观测趋势</CardTitle>
          <CardDescription>所选周期净增</CardDescription>
        </div>
        <CardAction className="max-w-full">
          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as typeof metric)}
          >
            <SelectTrigger className="w-32 max-w-full" aria-label="趋势指标">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(labels).map(([key, label]) => (
                <SelectItem value={key} key={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {known.length >= 2 ? (
          <>
            <ChartContainer
              config={{
                value: { label: labels[metric], color: "var(--primary)" },
              }}
              className="aspect-auto h-[250px] w-full"
              role="img"
              aria-label={labels[metric] + "观测净增趋势"}
            >
              <AreaChart
                accessibilityLayer
                data={values}
                margin={{ top: 12, right: 16, bottom: 8, left: 0 }}
              >
                <defs>
                  <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-value)"
                      stopOpacity={0.16}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-value)"
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <YAxis
                  width={44}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  domain={([min, max]: readonly [number, number]) =>
                    min === 0 && max === 0
                      ? [0, 1]
                      : [Math.min(0, min), Math.max(0, max)]
                  }
                />
                <ReferenceLine y={0} stroke="var(--border)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      formatter={(value, _name, item) => (
                        <div className="flex w-full justify-between gap-6">
                          <span>{labels[metric]}</span>
                          <NumberValue
                            value={typeof value === "number" ? value : null}
                            approximate={item.payload?.approximate}
                          />
                        </div>
                      )}
                    />
                  }
                />
                <Area
                  dataKey="value"
                  type="monotone"
                  fill="url(#fillValue)"
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "var(--card)", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ChartContainer>
          </>
        ) : (
          <div className="trend-empty" role="status">
            <strong>
              {known.length === 1 ? (
                <>
                  {known[0].label} · {labels[metric]}净增{" "}
                  <NumberValue
                    value={known[0].value}
                    approximate={known[0].approximate}
                  />
                </>
              ) : current?.value != null ? (
                "已采到数据，等待对比"
              ) : (
                "尚未采到" + labels[metric] + "数据"
              )}
            </strong>
            <p>
              {known.length === 1
                ? "仅有 1 个观测点，有连续记录后再展示趋势。"
                : current?.value != null
                  ? "再次采集后显示变化，首次采集不计作增长。"
                  : "采集到该指标后显示趋势。"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

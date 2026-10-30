<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useWorkspace } from "./workspace";
import { useEcharts } from "@/hooks/common/echarts";
import type { ECOption } from "@/hooks/common/echarts";
import {
  analyticsModel,
  metricColor,
  metricText,
  periods,
} from "./analytics-chart";
import NumberValue from "./NumberValue.vue";
import { time } from "./format";
const w = useWorkspace(),
  period = computed({ get: () => w.analyticsPeriod, set: (value: string) => { w.analyticsPeriod = value; } }),
  selected = ref<string | null>(null),
  grain = ref("day");
const model = computed(() =>
  analyticsModel(w.data, period.value, grain.value, selected.value),
);
const available = computed(() =>
  Object.entries(periods)
    .filter(
      ([key]) =>
        (
          w.data?.analytics?.data.available_periods || [
            "7d",
            "14d",
            "28d",
            "90d",
            "365d",
          ]
        ).includes(key) ||
        w.data?.analytics_periods?.[key] ||
        key === period.value,
    )
    .map(([value, label]) => ({ value, label })),
);
const hasData = computed(() =>
  model.value.series.some((p) =>
    model.value.shown.some(([key]) => p.metrics[key] != null),
  ),
);
function options(): ECOption {
  const m = model.value;
  return {
    animation: false,
    textStyle: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    },
    grid: {
      left: selected.value === "reward_estimate" ? 80 : 48,
      right: 18,
      top: 12,
      bottom: 32,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: m.series.map((p) => p.date),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        formatter: (value: string) => value.slice(5).replace("-", "/"),
      },
    },
    yAxis: {
      type: "value",
      max: selected.value ? undefined : 100,
      min: selected.value && m.peaks[selected.value] === 0 ? 0 : undefined,
      splitNumber: 4,
      interval: selected.value ? undefined : 25,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { opacity: 0.1 } },
      axisLabel: {
        formatter: (value: number) =>
          selected.value === "reward_estimate"
            ? metricText(value, "reward_estimate", m.reward.currency)
            : selected.value === "engagement_rate"
              ? value + "%"
              : Math.abs(value) >= 1000
                ? (value / 1000).toLocaleString("zh-CN", {
                    maximumFractionDigits: 1,
                  }) + "k"
                : String(value),
      },
    },
    tooltip: {
      trigger: "axis",
      renderMode: "richText",
      confine: true,
      formatter: (params: unknown) => {
        const rows = params as { dataIndex: number }[];
        const point = m.series[rows[0]?.dataIndex];
        if (!point) return "";
        return (
          point.date +
          "\n" +
          m.shown
            .map(
              ([key, label]) =>
                label +
                "  " +
                metricText(point.metrics[key], key, m.reward.currency),
            )
            .join("\n")
        );
      },
    },
    series: m.shown.map(([key, label], index) => ({
      name: label,
      type: "line",
      smooth: true,
      smoothMonotone: "x",
      connectNulls: false,
      data: m.values.map((p) => p[key]),
      showSymbol: m.series.length < 15,
      symbol: "circle",
      symbolSize: 4,
      lineStyle: {
        color: metricColor(key),
        width: selected.value ? 2.5 : 1.75,
        type: index < 5 ? "solid" : index % 2 ? "dashed" : "dotted",
      },
      itemStyle: { color: metricColor(key) },
      emphasis: { scale: 2 },
    })),
  };
}
const { domRef, updateOptions } = useEcharts(options);
watch([model, selected], () => void updateOptions((_, factory) => factory()));
</script>
<template>
  <NCard
    title="表现趋势"
    aria-label="账号表现"
    :header-style="{ flexWrap: 'wrap', gap: '12px' }"
    ><template #header><span class="whitespace-nowrap">表现趋势</span></template
    ><template #header-extra
      ><div class="business-toolbar">
        <span>范围</span
        ><NSelect
          role="combobox"
          :menu-props="{ role: 'listbox' }"
          :node-props="
            (option: { label?: unknown }) => ({
              role: 'option',
              'aria-label': String(option.label),
            })
          "
          v-model:value="period"
          aria-label="官方统计周期"
          style="width: 90px"
          :options="available"
        /><span>汇总</span
        ><NSelect
          role="combobox"
          :menu-props="{ role: 'listbox' }"
          :node-props="
            (option: { label?: unknown }) => ({
              role: 'option',
              'aria-label': String(option.label),
            })
          "
          v-model:value="grain"
          aria-label="趋势时间粒度"
          style="width: 90px"
          :options="[
            { value: 'day', label: '每日' },
            { value: 'week', label: '每周' },
            { value: 'month', label: '每月' },
          ]"
        /></div
    ></template>
    <div class="analytics-legend" role="group" aria-label="选择曲线指标">
      <NButton
        size="small"
        :type="!selected ? 'primary' : 'default'"
        :quaternary="!!selected"
        :aria-pressed="!selected"
        @click="selected = null"
        >全部指标</NButton
      ><NButton
        v-for="[key, label, icon] in model.metrics"
        :key="key"
        size="small"
        quaternary
        :aria-pressed="selected === key"
        @click="selected = selected === key ? null : key"
        ><i
          class="analytics-dot"
          :style="{ background: metricColor(key) }" /><SvgIcon
          :icon="icon"
          class="mr-6px" />{{ label }}
        <strong class="ml-6px"
          ><template
            v-if="
              ['engagement_rate', 'reward_estimate'].includes(key) &&
              model.counts[key]
            "
            >{{
              metricText(model.counts[key].value, key, model.reward.currency)
            }}</template
          ><NumberValue
            v-else
            :value="model.counts[key]?.value"
            :approximate="model.counts[key]?.approximate"
            compact /></strong
      ></NButton>
    </div>
    <p class="business-muted mb-16px">
      {{
        selected
          ? model.shown[0]?.[1] + "实际值"
          : "各指标峰值为 100，悬停查看实际值"
      }}
    </p>
    <div
      v-show="hasData"
      ref="domRef"
      class="analytics-chart"
      role="img"
      :aria-label="
        selected === 'reward_estimate'
          ? '奖励参考估算趋势'
          : (selected ? model.shown[0]?.[1] : '多指标') + '官方趋势'
      "
    />
    <div v-if="!hasData" role="img" aria-label="趋势数据尚未采集">
      <NSkeleton height="320px" />
    </div>
    <p v-if="!model.snapshot" role="status" class="business-muted">所选周期尚无完整数据，请采集运营数据。3M 导出可覆盖最近 7、14、28、30、90 天；1Y 需要完整年度数据。</p>
    <p v-if="model.snapshot" class="business-muted mt-12px">
      {{
        periods[period] +
        " · " +
        time(model.snapshot.observed_at) +
        " · X 官方导出" +
        (model.snapshot.data.verified_only ? " · 仅认证用户" : "")
      }}
    </p>
  </NCard>
</template>

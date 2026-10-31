<script setup lang="ts">
import { computed } from "vue";
import type { DataTableColumns } from "naive-ui";
import type { TaskStats } from "@/shared/types";
import { useWorkspace } from "./workspace";
import Analytics from "./Analytics.vue";
import NumberValue from "./NumberValue.vue";
import { time, jobTitle } from "./format";
import { analyticsSnapshot, periods } from "./analytics-chart";
const w = useWorkspace();
const current = computed(() => w.data?.accounts.find((a) => a.handle === w.selected));
const metrics = {
  followers: "当前粉丝",
  following: "当前关注",
} as const;
const officialMetrics = { impressions: "官方曝光量", likes: "官方点赞", replies: "官方评论" } as const;
const official = computed(() => analyticsSnapshot(w.data, w.analyticsPeriod));
const officialDates = computed(() => {
  const series = official.value?.data.series;
  return series?.length ? series[0].date + " 至 " + series[series.length - 1].date : "";
});
const taskStats = computed(() => w.data?.task_stats || []);
const taskTotals = computed(() => taskStats.value.reduce((sum, row) => ({
  completed: sum.completed + row.completed, failed: sum.failed + row.failed, skipped: sum.skipped + row.skipped,
  tokens: sum.tokens + row.tokens, missing_usage: sum.missing_usage + row.missing_usage,
}), { completed: 0, failed: 0, skipped: 0, tokens: 0, missing_usage: 0 }));
function tokenUsage(row: Pick<TaskStats, "tokens" | "missing_usage">) {
  return row.missing_usage ? row.tokens ? "≥ " + row.tokens.toLocaleString() : "未记录" : row.tokens.toLocaleString();
}
const taskColumns: DataTableColumns<TaskStats> = [
  { title: "任务类型", key: "task", minWidth: 160, render: jobTitle },
  { title: "成功总数", key: "completed", minWidth: 100, align: "right", render: row => row.completed.toLocaleString() },
  { title: "失败总数", key: "failed", minWidth: 100, align: "right", render: row => row.failed.toLocaleString() },
  { title: "跳过总数", key: "skipped", minWidth: 100, align: "right", render: row => row.skipped.toLocaleString() },
  { title: "消耗 Token", key: "tokens", minWidth: 140, align: "right", render: tokenUsage },
];
function setPeriod(value: string) {
  w.analyticsPeriod = value;
  w.days = value.slice(0, -1);
}
</script>
<template>
  <div class="business-stack">
    <div class="business-toolbar">
      <span class="business-muted mr-auto">{{ current ? "资料更新于 " + time(current.last_seen) : "等待首次采集" }}</span>
      <span class="business-muted">统计周期</span>
      <NRadioGroup :value="w.analyticsPeriod" @update:value="setPeriod" aria-label="统计周期" size="small">
        <NRadioButton value="1d">今日</NRadioButton>
        <NRadioButton value="7d">7 天</NRadioButton>
        <NRadioButton value="30d">30 天</NRadioButton>
      </NRadioGroup>
      <NButton type="primary" aria-label="采集运营数据" :loading="w.submitting || !!w.activeCapture" :aria-busy="w.submitting || !!w.activeCapture" :disabled="!w.selected || !w.ready || w.busy || !!w.activeCapture"
        @click="w.collect(w.selected, w.analyticsReady ? 'capture_analytics' : 'capture')">
        采集运营数据
      </NButton>
    </div>
    <section aria-label="账号与帖子观测" class="business-stack">
      <div class="metrics-grid">
        <NCard
          v-for="(label, key) in metrics"
          :key="key"
          :title="label"
          size="small"
          ><div class="text-28px">
            <NumberValue
              :value="w.data?.metrics[key]?.value"
              :approximate="w.data?.metrics[key]?.approximate"
              compact
            />
          </div>
          <NTag
            class="mt-8px"
            size="small"
            :type="
              (w.data?.metrics[key]?.delta ?? 0) > 0
                ? 'error'
                : (w.data?.metrics[key]?.delta ?? 0) < 0
                  ? 'success'
                  : 'default'
            "
            :title="
              w.data?.metrics[key]?.baseline_at
                ? '对比 ' +
                  time(w.data.metrics[key]?.baseline_at) +
                  ' 至 ' +
                  time(w.data.metrics[key]?.observed_at)
                : '尚无可比较的采集记录'
            "
            ><template v-if="w.data?.metrics[key]?.delta != null"
              >{{ w.data.metrics[key]!.delta! > 0 ? "+" : ""
              }}<NumberValue
                :value="w.data.metrics[key]?.delta"
                :approximate="
                  w.data.metrics[key]?.delta_approximate
                " /></template
            ><template v-else>无对比数据</template></NTag
          >
          <p class="business-muted mt-8px">{{ w.days }} 天观测增量</p></NCard
        >
        <NCard v-for="(label, key) in officialMetrics" :key="key" :title="label" size="small">
          <div class="text-28px"><NumberValue :value="official?.data.metrics?.[key]?.value" :approximate="official?.data.metrics?.[key]?.approximate" /></div>
          <p class="business-muted mt-8px">{{ periods[w.analyticsPeriod] }} · {{ official?.data.metrics?.[key] ? 'X 官方统计' : '未采集' }}</p>
          <p v-if="officialDates" class="business-muted mt-8px">{{ officialDates }}</p>
        </NCard>
      </div>
      <NAlert v-if="w.selected && !w.ready" type="warning"
        >采集已暂停。请在电脑上打开 X 助手，检查连接与登录。<NButton
          text
          @click="w.settingsOpen = true"
          >查看连接</NButton
        ></NAlert
      >
      <p class="business-muted">
        粉丝与关注为最近采集值 · 观测增量按采集记录比较 · ≈ 近似值
      </p>
      <p v-if="official" class="business-muted">官方统计更新于 {{ time(official.observed_at) }}{{ official.data.verified_only ? ' · 仅认证用户' : '' }}</p>
    </section>
    <NCard v-if="w.selected" title="任务累计统计" size="small">
      <p class="business-muted mb-12px">当前账号全部历史记录 · 按任务最终状态计数 · 不受上方统计周期影响</p>
      <NDataTable role="region" aria-label="任务成功失败及 Token 统计" :columns="taskColumns" :data="taskStats" :row-key="jobTitle" :scroll-x="600" size="small" />
      <p class="mt-12px">合计：成功 {{ taskTotals.completed.toLocaleString() }} · 失败 {{ taskTotals.failed.toLocaleString() }} · 跳过 {{ taskTotals.skipped.toLocaleString() }} · 消耗 {{ tokenUsage(taskTotals) }} Token</p>
      <p class="business-muted mt-8px">Token 包含失败和重试调用，缓存输入不重复计数；≥ 表示部分历史用量未记录。跳过的任务不计入成功或失败。</p>
    </NCard>
    <Analytics :key="w.selected || 'none'" />
    <NAlert v-if="w.ready && !w.analyticsReady" type="warning">
      官方分析需要浏览器连接，请在已登录的 X 页面重新连接助手。
      <NButton text @click="w.settingsOpen = true">连接助手</NButton>
    </NAlert>
  </div>
</template>

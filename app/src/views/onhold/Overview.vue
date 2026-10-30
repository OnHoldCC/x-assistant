<script setup lang="ts">
import { computed } from "vue";
import { useWorkspace } from "./workspace";
import Analytics from "./Analytics.vue";
import NumberValue from "./NumberValue.vue";
import { time } from "./format";
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
    <Analytics :key="w.selected || 'none'" />
    <NAlert v-if="w.ready && !w.analyticsReady" type="warning">
      官方分析需要浏览器连接，请在已登录的 X 页面重新连接助手。
      <NButton text @click="w.settingsOpen = true">连接助手</NButton>
    </NAlert>
  </div>
</template>

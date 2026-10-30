<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AnalyticsSnapshot, CreatorSummary } from "@/shared/types";
import { creatorOutlook, unsettledRewardEstimate } from "@/shared/metrics";
import { api } from "@/shared/api";
import NumberValue from "./NumberValue.vue";
import AnalyticsReward from "./AnalyticsReward.vue";
import { time } from "./format";
const props = defineProps<{
    summary?: CreatorSummary | null;
    analytics?: Record<string, AnalyticsSnapshot>;
    iconOnly?: boolean;
  }>(),
  emit = defineEmits<{ saved: [] }>();
const open = ref(false),
  qualified = ref<number | null>(null),
  rpm = ref<number | null>(null),
  captureMessage = ref(""),
  error = ref(""),
  busy = ref(false);
const creator = computed(() => props.summary?.snapshot?.data),
  outlook = computed(() =>
    creatorOutlook(creator.value, props.summary?.assumptions),
  ),
  complete = computed(
    () =>
      creator.value?.state === "enrolled" ||
      creator.value?.state === "eligible" ||
      (outlook.value.progress === 100 && !outlook.value.blocked),
  ),
  progress = computed(() => (complete.value ? 100 : outlook.value.progress)),
  reward = computed(() =>
    unsettledRewardEstimate(props.analytics || {}, props.summary),
  ),
  verified = computed(
    () =>
      Object.values(props.analytics || {})
        .filter((s) => s.data.metrics?.verified_followers?.value != null)
        .sort((a, b) => b.observed_at - a.observed_at)[0],
  );
const empty = computed(
  () =>
    !creator.value ||
    (creator.value.state === "unknown" &&
      !creator.value.verified_followers &&
      !creator.value.verified_impressions),
);
const label = computed(() =>
  !creator.value ||
  (creator.value.state === "unknown" &&
    !creator.value.verified_followers &&
    !creator.value.verified_impressions)
    ? "尚未采集"
    : creator.value.state === "enrolled"
      ? "已开通"
      : creator.value.state === "eligible"
        ? "可申请"
        : outlook.value.blocked
          ? "未达标"
          : "待确认",
);
const targets = [
  ["verified_followers", "认证粉丝"],
  ["verified_impressions", "认证主页曝光"],
] as const;
watch(
  [() => props.summary?.account, () => props.summary?.assumptions?.observed_at],
  () => {
    qualified.value = props.summary?.assumptions?.qualified30 ?? null;
    rpm.value = props.summary?.assumptions?.rpmCny ?? null;
    error.value = "";
  },
  { immediate: true },
);
async function capture() {
  if (busy.value || !props.summary?.account) return;
  busy.value = true;
  error.value = "";
  captureMessage.value = "";
  try {
    await api("enqueue", {
      account: props.summary.account,
      action: "capture_creator",
    });
    captureMessage.value = "资格采集已加入任务记录";
    emit("saved");
  } catch (c) {
    error.value = String(c);
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (!props.summary?.account || qualified.value == null || rpm.value == null)
    return;
  busy.value = true;
  error.value = "";
  try {
    await api("save_earnings", {
      account: props.summary.account,
      qualified30: qualified.value,
      rpmCny: rpm.value,
    });
    emit("saved");
  } catch (c) {
    error.value = String(c);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <NTooltip role="tooltip" :delay="150"
    ><template #trigger
      ><NButton
        quaternary
        size="small"
        aria-label="查看创作者进度"
        @click="open = true"
        ><span v-if="!iconOnly" class="business-muted mr-6px">本期预估</span
        ><strong class="mr-8px">{{
          reward.amount == null
            ? summary?.calibration
              ? "待更新"
              : "待校准"
            : reward.amount.toLocaleString("zh-CN", {
                style: "currency",
                currency: reward.currency,
              })
        }}</strong
        ><NProgress
          type="circle"
          :percentage="progress ?? 0"
          :show-indicator="false"
          :color="complete ? '#e6b84b' : undefined"
          style="width: 28px"
          role="progressbar"
          aria-label="创作者资格总进度"
          :aria-valuenow="progress ?? undefined"
          :aria-valuetext="
            progress == null ? '尚未采集' : progress.toFixed(1) + '%'
          " /></NButton
    ></template>
    <div class="business-stack" style="width: 280px">
      <div v-for="[key, name] in targets" :key="key">
        <p>
          {{ name }}
          <strong
            ><template v-if="creator?.[key]"
              ><NumberValue
                :value="creator[key]!.current.value"
                :approximate="creator[key]!.current.approximate" />
              / <NumberValue :value="creator[key]!.target" /></template
            ><template
              v-else-if="
                key === 'verified_followers' &&
                verified?.data.metrics?.verified_followers
              "
              ><NumberValue
                :value="verified.data.metrics.verified_followers.value"
                :approximate="
                  verified.data.metrics.verified_followers.approximate
                " /></template
            ><template v-else>未采集</template></strong
          >
        </p>
        <NProgress
          v-if="creator?.[key]"
          type="line"
          :percentage="
            Math.min(
              100,
              (creator[key]!.current.value / creator[key]!.target) * 100,
            )
          "
          :show-indicator="false"
        /><small v-else-if="key === 'verified_followers' && verified"
          >Analytics · {{ time(verified.observed_at) }} · 资格门槛未采集</small
        >
      </div>
    </div></NTooltip
  >
  <NDrawer
    v-model:show="open"
    aria-label="创作者中心"
    :width="620"
    style="max-width: 100vw"
    ><NDrawerContent title="创作者中心" closable
      ><div class="business-stack">
        <p>
          {{ summary?.account ? "@" + summary.account + " · " : "" }}资格与收益
        </p>
        <NCard title="创作者进度" size="small"
          ><template #header-extra
            ><NTag>{{ label }}</NTag></template
          >
          <div class="business-stack">
            <div
              v-for="[key, name] in targets.filter(([k]) => creator?.[k])"
              :key="key"
            >
              <p>
                {{
                  key === "verified_impressions" &&
                  creator?.verified_impressions
                    ? "近 " +
                      creator.verified_impressions.days +
                      " 天认证主页曝光"
                    : name
                }}
                <strong
                  ><NumberValue
                    :value="creator?.[key]?.current.value"
                    :approximate="creator?.[key]?.current.approximate"
                    compact />
                  / <NumberValue :value="creator?.[key]?.target" compact
                /></strong>
              </p>
              <NProgress
                type="line"
                :percentage="
                  Math.min(
                    100,
                    (creator![key]!.current.value / creator![key]!.target) *
                      100,
                  )
                "
                :aria-label="name + '进度'"
              /><small
                >还差
                <NumberValue
                  :value="
                    Math.max(
                      0,
                      creator![key]!.target - creator![key]!.current.value,
                    )
                  "
                  :approximate="creator![key]!.current.approximate"
                  compact
                />{{
                  key === "verified_impressions" &&
                  creator?.verified_impressions?.exclude_replies
                    ? " · 不含回复"
                    : ""
                }}</small
              >
            </div>
            <p v-if="!empty" class="business-muted">
              {{
                summary?.snapshot
                  ? time(summary.snapshot.observed_at) + " · X 创作者中心"
                  : "采集运营数据后更新"
              }}
              ·
              <a
                href="https://help.x.com/en/using-x/original-content-rewards"
                target="_blank"
                rel="noreferrer"
                >资格口径</a
              >
            </p>
            <NButton :disabled="busy || !summary?.account" @click="capture">{{
              busy ? "提交中…" : "采集资格数据"
            }}</NButton>
          </div></NCard
        ><AnalyticsReward
          v-if="!empty || Object.keys(analytics || {}).length > 0"
          :summary="summary"
          :snapshots="analytics"
          @saved="emit('saved')"
        /><NCollapse v-if="!empty"
          ><NCollapseItem title="合格曝光手动估算"
            ><NForm class="business-form" @submit.prevent="save"
              ><NFormItem label="近30天合格曝光"
                ><NInputNumber
                  v-model:value="qualified"
                  :min="0"
                  :max="1000000000000000"
                  :precision="0"
                  :input-props="{
                    'aria-label': '近30天合格曝光',
                  }" /></NFormItem
              ><NFormItem label="历史每千次合格曝光收益（元）"
                ><NInputNumber
                  v-model:value="rpm"
                  :min="0"
                  :max="1000000"
                  :input-props="{
                    'aria-label': '历史每千次合格曝光收益（元）',
                  }" /></NFormItem
              ><NButton
                attr-type="submit"
                :disabled="
                  busy || !summary?.account || qualified == null || rpm == null
                "
                >{{ busy ? "保存中…" : "保存依据" }}</NButton
              >
              <p class="business-muted">
                不使用总曝光或90天资格曝光替代近30天合格曝光。
              </p></NForm
            ></NCollapseItem
          ></NCollapse
        ><NAlert v-if="captureMessage">{{ captureMessage }}</NAlert
        ><NAlert v-if="error" type="error">{{ error }}</NAlert>
      </div></NDrawerContent
    ></NDrawer
  >
</template>

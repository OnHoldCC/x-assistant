<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AnalyticsSnapshot, CreatorSummary } from "@/shared/types";
import { unsettledRewardEstimate } from "@/shared/metrics";
import { api } from "@/shared/api";
const props = defineProps<{
    summary?: CreatorSummary | null;
    snapshots?: Record<string, AnalyticsSnapshot>;
  }>(),
  emit = defineEmits<{ saved: [] }>();
const payout = ref<number | null>(null),
  currency = ref("USD"),
  start = ref(""),
  end = ref(""),
  confirmed = ref(false),
  busy = ref(false),
  error = ref("");
const history = computed(
    () =>
      Object.values(props.snapshots || {})
        .filter((s) => s.data.series?.length)
        .sort((a, b) => b.data.series!.length - a.data.series!.length)[0],
  ),
  estimate = computed(() =>
    unsettledRewardEstimate(props.snapshots || {}, props.summary),
  ),
  calibration = computed(() => props.summary?.calibration);
watch([start, end], () => (confirmed.value = false));
async function save() {
  if (
    busy.value ||
    !props.summary?.account ||
    !history.value ||
    payout.value == null ||
    !confirmed.value
  )
    return;
  busy.value = true;
  error.value = "";
  try {
    await api("save_earnings_calibration", {
      account: props.summary.account,
      observed_at: history.value.observed_at,
      payout: payout.value,
      currency: currency.value,
      start_date: start.value,
      end_date: end.value,
      confirmed: confirmed.value,
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
  <NCard title="本期预估收益" size="small"
    ><div class="business-stack">
      <strong class="text-24px">{{
        estimate.amount == null
          ? estimate.reason
          : estimate.amount.toLocaleString("zh-CN", {
              style: "currency",
              currency: estimate.currency,
            })
      }}</strong>
      <p v-if="estimate.start" class="business-muted">
        {{ estimate.start }} — {{ estimate.end }} ·
        {{
          estimate.through ? "数据截至 " + estimate.through : estimate.reason
        }}
      </p>
      <p class="business-muted">
        按上次结算周期结束后的曝光累计，历史结算比例估算 · 非官方结算
      </p>
      <NCollapse
        ><NCollapseItem :title="calibration ? '重新校准' : '校准历史收益'"
          ><p v-if="calibration" class="business-muted">
            上次结算
            {{
              calibration.payout.toLocaleString("zh-CN", {
                style: "currency",
                currency: calibration.currency,
              })
            }}
            · {{ calibration.start_date }} — {{ calibration.end_date }} ·
            {{ calibration.impressions.toLocaleString("zh-CN") }} 次曝光
          </p>
          <p v-if="!history">先采集官方逐日数据。</p>
          <NForm v-else class="business-form mt-16px" @submit.prevent="save"
            ><NFormItem label="结算金额"
              ><NInputNumber
                v-model:value="payout"
                :min="0"
                :max="1000000000"
                :input-props="{ 'aria-label': '结算金额' }" /></NFormItem
            ><NFormItem label="币种"
              ><NSelect
                role="combobox"
                :menu-props="{ role: 'listbox' }"
                :node-props="
                  (option: { label?: unknown }) => ({
                    role: 'option',
                    'aria-label': String(option.label),
                  })
                "
                v-model:value="currency"
                aria-label="结算币种"
                :options="[
                  { value: 'USD', label: 'USD' },
                  { value: 'CNY', label: 'CNY' },
                ]" /></NFormItem
            ><NFormItem label="统计开始"
              ><NInput
                v-model:value="start"
                placeholder=""
                :input-props="{
                  'aria-label': '统计开始',
                  type: 'date',
                  required: true,
                  min: history.data.series![0].date,
                  max: history.data.series!.at(-1)!.date,
                }" /></NFormItem
            ><NFormItem label="统计结束"
              ><NInput
                v-model:value="end"
                placeholder=""
                :input-props="{
                  'aria-label': '统计结束',
                  type: 'date',
                  required: true,
                  min: start || history.data.series![0].date,
                  max: history.data.series!.at(-1)!.date,
                }" /></NFormItem
            ><NCheckbox v-model:checked="confirmed"
              >该金额对应上述统计时间段</NCheckbox
            >
            <p class="business-muted">
              本期曝光 × 历史结算 ÷ 同期曝光。未公开的官方参数不做假设。
            </p>
            <NAlert v-if="error" type="error">{{ error }}</NAlert
            ><NButton
              attr-type="submit"
              type="primary"
              :disabled="busy || !confirmed || payout == null"
              >{{ busy ? "保存中…" : "保存校准" }}</NButton
            ></NForm
          ></NCollapseItem
        ></NCollapse
      >
    </div></NCard
  >
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Job } from "@/shared/types";
import { duration, jobMetrics } from "@/shared/job-metrics";
const props = defineProps<{ job: Job; details?: boolean }>();
const m = computed(() => jobMetrics(props.job)),
  tokenText = computed(() =>
    m.value.total_tokens === null
      ? m.value.known_tokens
        ? `已记录 ${m.value.known_tokens.toLocaleString()} tokens · ${m.value.missing} 次用量未知`
        : "Token 未记录"
      : `${m.value.total_tokens.toLocaleString()} tokens`,
  );
</script>
<template>
  <template v-if="job.action === 'rewrite_publish'"
    ><small v-if="!details && job.input?.model_not_called && m.attempts === 0">未调用模型 · 0 tokens</small><small v-else-if="!details"
      >生成 {{ duration(m.generation_ms) }} · {{ tokenText }}</small
    >
    <div v-else>
      <NDescriptions :column="1" bordered size="small"
        ><NDescriptionsItem label="总耗时（含排队与重试等待）">{{
          duration(m.total_ms)
        }}</NDescriptionsItem
        ><NDescriptionsItem label="生成耗时">{{
          duration(m.generation_ms)
        }}</NDescriptionsItem
        ><NDescriptionsItem label="发送耗时">{{
          duration(m.send_ms)
        }}</NDescriptionsItem
        ><NDescriptionsItem label="模型调用次数">{{
          m.attempts || (job.input?.model_not_called ? 0 : "未记录")
        }}</NDescriptionsItem
        ><NDescriptionsItem label="Token 用量">{{
          tokenText
        }}</NDescriptionsItem
        ><NDescriptionsItem label="输入 / 输出"
          >{{ m.input_tokens ?? "未知" }} /
          {{ m.output_tokens ?? "未知" }}</NDescriptionsItem
        ><NDescriptionsItem label="其中缓存输入"
          >{{
            m.cached_input_tokens ?? "未知"
          }}（包含在输入中）</NDescriptionsItem
        ></NDescriptions
      ><NCollapse v-if="m.attempts > 0" class="mt-12px"
        ><NCollapseItem title="逐次模型调用记录"
          ><p
            v-for="(run, index) in job.input?.telemetry?.generations"
            :key="index"
          >
            第 {{ index + 1 }} 次 · {{ duration(run.duration_ms) }} ·
            {{
              run.usage
                ? `${run.usage.total_tokens} tokens（输入 ${run.usage.input_tokens} / 输出 ${run.usage.output_tokens}）`
                : "用量未知"
            }}
          </p></NCollapseItem
        ></NCollapse
      >
    </div></template
  >
</template>

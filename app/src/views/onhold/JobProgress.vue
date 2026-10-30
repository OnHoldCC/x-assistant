<script setup lang="ts">
import { computed } from "vue";
import type { Job } from "@/shared/types";
import { jobProgress } from "@/shared/job-progress";
const props = defineProps<{ job?: Job | null }>();
const p = computed(() => (props.job ? jobProgress(props.job) : null));
</script>
<template>
  <div v-if="job && p" class="mt-8px">
    <NProgress
      type="line"
      :percentage="
        p.value == null ? 30 : Math.min(100, (p.value / p.max) * 100)
      "
      :processing="p.value == null"
      :status="
        job.state === 'failed' || (job.result?.reply_progress?.failed ?? 0) > 0
          ? 'error'
          : job.state === 'completed' && job.input?.stage !== 'skipped' && (!job.result?.reply_progress || job.result.reply_progress.total > 0)
            ? 'success'
            : 'default'
      "
      :show-indicator="false"
      :aria-label="'任务执行进度 ' + job.id"
      :aria-valuemin="0"
      :aria-valuemax="p.max"
      :aria-valuenow="p.value ?? undefined"
      :aria-valuetext="p.text"
    /><small>{{ p.text }}</small>
  </div>
</template>

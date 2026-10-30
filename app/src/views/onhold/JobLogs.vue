<script setup lang="ts">
import { ref, watch } from "vue";
import { api } from "@/shared/api";
import type { Job } from "@/shared/types";
import { time } from "./format";
type LogPage = {
  items: { id: number; at: number; stage: string; message: string }[];
  total: number;
  offset: number;
};
const props = defineProps<{ job: Job }>();
const stageLabels: Record<string, string> = {
  created: "任务创建", queued: "等待执行", rewriting: "模型生成",
  model: "模型用量", ready: "正文校验", sending: "发送到 X",
  running: "执行中", completed: "执行完成", failed: "执行失败",
  cleanup: "页面清理", progress: "执行进度", sources:"新闻取材",
};
const page = ref(1),
  data = ref<LogPage | null>(null),
  error = ref("");
let revision = 0;
watch(
  [() => props.job, page],
  async (_, __, cleanup) => {
    const id = ++revision;
    cleanup(() => revision++);
    try {
      const value = await api<LogPage>("job_logs", {
        account: props.job.account,
        id: props.job.id,
        offset: (page.value - 1) * 20,
      });
      if (id === revision) {
        data.value = value;
        page.value = Math.floor(value.offset / 20) + 1;
        error.value = "";
      }
    } catch (c) {
      if (id === revision) error.value = String(c);
    }
  },
  { immediate: true },
);
</script>
<template>
  <section aria-label="执行明细日志" class="business-stack">
    <h3 class="font-medium">执行明细日志</h3>
    <p class="business-muted break-all">任务 ID：{{ job.id }}</p>
    <NAlert v-if="error" type="error">{{ error }}</NAlert
    ><NTimeline v-if="data?.items.length"
      ><NTimelineItem
        v-for="log in data.items"
        :key="log.id"
        :time="time(log.at)"
        :title="stageLabels[log.stage] || log.stage"
        :type="log.stage === 'failed' ? 'error' : log.stage === 'completed' ? 'success' : 'default'"
      ><p class="business-pre">{{ log.message }}</p></NTimelineItem
    ></NTimeline>
    <p v-else-if="data">
      暂无明细日志。升级前的任务仍可查看已有结果与模型调用记录。
    </p>
    <p v-else role="status">正在读取日志…</p>
    <NPagination
      role="navigation"
      v-model:page="page"
      :page-size="20"
      :item-count="data?.total || 0"
      class="flex-wrap"
      aria-label="执行明细日志分页"
      ><template #prev="{ page: current }"
        ><NButton text :disabled="current <= 1" aria-label="上一页"
          >上一页</NButton
        ></template
      ><template #next="{ page: current, pageCount }"
        ><NButton text :disabled="current >= pageCount" aria-label="下一页"
          >下一页</NButton
        ></template
      ><template #prefix
        >共 {{ data?.total || 0 }} 条 · 每页 20 条</template
      ></NPagination
    >
  </section>
</template>

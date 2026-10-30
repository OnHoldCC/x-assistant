<script setup lang="ts">
import { h, ref, watch, onMounted, onScopeDispose } from "vue";
import { NButton, NTag } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { api } from "@/shared/api";
import type { Job } from "@/shared/types";
import { useWorkspace } from "./workspace";
import { states, jobTitle, jobLabel, jobMessage, time, safeResultUrl } from "./format";
import JobLogs from "./JobLogs.vue";
import JobMetrics from "./JobMetrics.vue";
import JobProgress from "./JobProgress.vue";

const props = defineProps<{ paused: boolean }>();
const w = useWorkspace(), state = ref("all"), source = ref("automation"),
  search = ref(""), page = ref(1), error = ref(""),
  data = ref<{ items: Job[]; total: number }>({ items: [], total: 0 }),
  expanded = ref<(string | number)[]>([]);
const stateOptions = [{ label: "全部状态", value: "all" }, ...Object.entries(states).map(([value, label]) => ({ value, label }))];
const sourceOptions = [{ label: "自动化任务", value: "automation" }, { label: "其他任务", value: "other" }, { label: "全部任务", value: "all" }];
let revision = 0, pending = false, alive = true, initial = true,
  timer: ReturnType<typeof setInterval>;
async function load() {
  if (pending || props.paused || !w.selected || document.hidden) return;
  pending = true;
  const id = revision;
  try {
    const value = await api<{ items: Job[]; total: number; offset: number }>("job_records", {
      account: w.selected, state: state.value, source: source.value,
      search: search.value, offset: (page.value - 1) * 20,
    });
    if (!alive || id !== revision) return;
    data.value = value;
    error.value = "";
    page.value = Math.floor(value.offset / 20) + 1;
    if (initial && value.items.length) {
      expanded.value = [value.items[0].id];
      initial = false;
    }
  } catch (cause) {
    if (alive && id === revision) error.value = String(cause);
  } finally {
    pending = false;
  }
}
watch([() => w.selected, state, source, search], () => {
  page.value = 1;
  data.value = { items: [], total: 0 };
  error.value = "";
});
watch([() => w.selected, state, source, search, page], () => {
  revision++;
  expanded.value = [];
  initial = true;
  void load();
}, { immediate: true });
watch(() => props.paused, () => { revision++; void load(); });
onMounted(() => { timer = setInterval(load, 2000); });
onScopeDispose(() => { alive = false; revision++; clearInterval(timer); });
function toggle(j: Job) {
  expanded.value = expanded.value.includes(j.id) ? expanded.value.filter(id => id !== j.id) : [...expanded.value, j.id];
}
const columns: DataTableColumns<Job> = [
  { type: "expand", renderExpand: j => h("div", { class: "business-stack" }, [
    h(JobLogs, { job: j }),
    j.action === "rewrite_publish" ? h(JobMetrics, { job: j, details: true }) : null,
    safeResultUrl(j.result?.url) ? h("a", { href: j.result!.url, target: "_blank", rel: "noopener noreferrer" }, "查看发布回执") : null,
  ]) },
  { title: "创建时间", key: "created_at", width: 180, render: j => time(j.created_at) },
  { title: "任务", key: "action", width: 170, render: jobTitle },
  { title: "状态", key: "state", width: 140, render: j => h("div", { class: "business-stack" }, [
    h(NTag, { size: "small", type: j.state === "failed" ? "error" : j.state === "completed" ? "success" : "default" }, () => jobLabel(j)),
    h(JobProgress, { job: j }),
  ]) },
  { title: "执行结果", key: "result", minWidth: 300, render: j => h("div", { class: "business-stack" }, [h("p", { class: "business-pre" }, jobMessage(j)), h(JobMetrics, { job: j })]) },
  { title: "操作", key: "details", width: 125, fixed: "right", render: j => h(NButton, { size: "small", "aria-expanded": expanded.value.includes(j.id), onClick: () => toggle(j) }, () => expanded.value.includes(j.id) ? "收起明细" : "执行明细") },
];
</script>
<template>
  <div class="business-stack">
    <p class="business-muted">{{ paused ? "已暂停日志刷新" : "每 2 秒更新" }} · 展开任务查看实际执行步骤、模型用量与失败原因</p>
    <div class="business-toolbar">
      <NSelect v-model:value="source" role="combobox" aria-label="执行任务来源" :options="sourceOptions" :menu-props="{ role: 'listbox' }" :node-props="option => ({ role: 'option', 'aria-label': String(option.label) })" class="w-160px" />
      <NSelect v-model:value="state" role="combobox" aria-label="执行任务状态" :options="stateOptions" :menu-props="{ role: 'listbox' }" :node-props="option => ({ role: 'option', 'aria-label': String(option.label) })" class="w-150px" />
      <NInput v-model:value="search" clearable :input-props="{ type: 'search', 'aria-label': '筛选执行明细' }" placeholder="搜索任务、正文或错误" class="flex-1 min-w-180px" />
    </div>
    <NAlert v-if="error" type="error">{{ error }}</NAlert>
    <NDataTable v-model:expanded-row-keys="expanded" size="large" role="region" aria-label="任务执行明细" :columns="columns" :data="data.items" :row-key="(j: Job) => j.id" :scroll-x="960" sticky-expanded-rows />
    <NPagination v-model:page="page" :page-size="20" :item-count="data.total" class="flex-wrap" aria-label="执行任务分页"><template #prefix>共 {{ data.total }} 个任务</template></NPagination>
  </div>
</template>

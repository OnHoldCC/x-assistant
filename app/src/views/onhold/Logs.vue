<script setup lang="ts">
import { computed, ref, onMounted, onScopeDispose, h } from "vue";
import { NTag } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { api } from "@/shared/api";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { time } from "./format";
import ExecutionLogs from "./ExecutionLogs.vue";
type Log = {
  id: number;
  at: number;
  level: string;
  kind: string;
  account: string | null;
  message: string;
};
const logs = ref<Log[]>([]),
  tab = ref("execution"),
  search = ref(""),
  paused = ref(false),
  error = ref("");
let cursor = 0,
  alive = true,
  polling = false,
  timer: ReturnType<typeof setInterval>,
  unlisten: (() => void) | undefined;
function append(rows: Log[]) {
  if (!alive || paused.value) return;
  logs.value = [
    ...new Map([...logs.value, ...rows].map((r) => [r.id, r])).values(),
  ]
    .sort((a, b) => a.id - b.id)
    .slice(-1000);
  for (const r of rows) cursor = Math.max(cursor, r.id);
}
async function load() {
  if (polling || paused.value) return;
  polling = true;
  try {
    append(await api<Log[]>("logs", { after: cursor }));
    if (alive) error.value = "";
  } catch (c) {
    if (alive) error.value = String(c);
  } finally {
    polling = false;
  }
}
onMounted(() => {
  void load();
  timer = setInterval(load, 2000);
  if (isTauri())
    void listen<Log>("system-log", (e) => append([e.payload]))
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(() => {});
});
onScopeDispose(() => {
  alive = false;
  clearInterval(timer);
  unlisten?.();
});
const visible = computed(() =>
  logs.value
    .filter((l) =>
      (l.message + " " + l.kind + " " + (l.account || ""))
        .toLowerCase()
        .includes(search.value.toLowerCase()),
    )
    .reverse(),
);
const columns: DataTableColumns<Log> = [
  { title: "时间", key: "at", width: 180, render: (l) => time(l.at) },
  {
    title: "级别",
    key: "level",
    width: 100,
    render: (l) =>
      h(
        NTag,
        { type: l.level === "error" ? "error" : "default", size: "small" },
        () => l.level,
      ),
  },
  {
    title: "账号",
    key: "account",
    width: 140,
    render: (l) => (l.account ? "@" + l.account : "系统"),
  },
  { title: "事件", key: "kind", width: 180 },
  { title: "内容", key: "message", minWidth: 350 },
];
</script>
<template>
  <div class="business-stack">
    <NCard title="系统日志"
      ><template #header-extra
        ><NButton size="small" @click="paused = !paused">{{
          paused ? "继续日志刷新" : "暂停日志刷新"
        }}</NButton></template
      >
      <div class="business-stack">
        <NTabs v-model:value="tab" type="line" aria-label="日志内容">
          <NTab name="execution" role="tab" tabindex="0" @keydown.enter="tab = 'execution'" @keydown.space.prevent="tab = 'execution'">执行明细</NTab>
          <NTab name="events" role="tab" tabindex="0" @keydown.enter="tab = 'events'" @keydown.space.prevent="tab = 'events'">系统事件</NTab>
        </NTabs>
        <ExecutionLogs v-if="tab === 'execution'" :paused="paused" />
        <template v-else>
        <p class="business-muted">
          {{ paused ? "已暂停界面更新" : "实时更新 · 最近1000条" }}
        </p>
        <NInput
          v-model:value="search"
          :input-props="{ type: 'search', 'aria-label': '筛选日志' }"
          placeholder="筛选事件、账号或内容"
        /><NAlert v-if="error" type="error">{{ error }}</NAlert>
        <div role="log" aria-live="polite" aria-relevant="additions">
          <NDataTable
            size="large"
            role="region"
            :columns="columns"
            :data="visible"
            :scroll-x="950"
            :row-key="(r: Log) => r.id"
            :max-height="600"
            virtual-scroll
          />
        </div>
        </template>
        <NSpace
          ><RouterLink to="/tasks">任务记录</RouterLink
          ><RouterLink to="/author">版本更新内容</RouterLink></NSpace
        >
      </div></NCard
    >
  </div>
</template>

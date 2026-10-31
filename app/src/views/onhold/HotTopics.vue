<script setup lang="ts">
import { computed, h, ref, watch } from "vue";
import { NButton, NTag } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { api } from "@/shared/api";
import { useWorkspace } from "./workspace";
import { time } from "./format";
type Topic = {
  id: string; batch_id: string; retrieved_at: number; state: string;
  item: { title: string; platform: string; url: string; published_at: number | null };
  reason: string | null; published_url: string | null; posted_to_x: boolean | null;
};
type Queue = {
  account: string; items: Topic[]; total: number; offset: number;
  batch: { at: number; total: number; counts: Record<string, number> } | null;
};
const w = useWorkspace(), data = ref<Queue | null>(null), page = ref(1), channel = ref("all"), status = ref("all"), error = ref("");
const names: Record<string, string> = { pending: "未发 X · 待处理", processing: "处理中", published: "已发 X", skipped: "未发 X · 已跳过", failed: "未发 X · 失败", uncertain: "发送结果待核对" };
const sources: Record<string, string> = { weibo: "微博", rednote: "小红书", bbc: "BBC 娱乐", guardian: "Guardian 文化", variety: "Variety 娱乐", deadline: "Deadline 娱乐" };
const channels = [{ value: "all", label: "全部渠道" }, ...Object.entries(sources).map(([value,label]) => ({ value,label }))];
const states = [{ value: "all", label: "全部执行状态" }, { value: "pending", label: "待处理" }, { value: "processing", label: "处理中" }, { value: "published", label: "已发 X" }, { value: "skipped", label: "已跳过" }, { value: "failed", label: "失败" }, { value: "uncertain", label: "待核对" }];
const progress = computed(() => {
  const b = data.value?.batch;
  return b?.total ? Math.round(100 * (b.total - (b.counts.pending || 0) - (b.counts.processing || 0)) / b.total) : 0;
});
const columns: DataTableColumns<Topic> = [
  { title: "热点", key: "title", minWidth: 280, render: r => h("a", { href: r.item.url, target: "_blank", rel: "noopener noreferrer", class: "text-primary" }, r.item.title) },
  { title: "来源", key: "platform", width: 150, render: r => h(NTag, { size: "small", bordered: false }, () => sources[r.item.platform] || r.item.platform) },
  { title: "发布时间 ↓", key: "published_at", width: 180, render: r => r.item.published_at ? time(r.item.published_at) : "热榜未提供" },
  { title: "采集时间", key: "retrieved_at", width: 180, render: r => time(r.retrieved_at) },
  { title: "X 发布状态", key: "state", width: 170, render: r => h(NTag, { size: "small", bordered: false, type: r.state === "published" ? "success" : r.state === "failed" ? "error" : "default" }, () => r.state !== "processing" && r.posted_to_x === null ? "发送结果待核对" : names[r.state] || r.state) },
  { title: "结果", key: "reason", minWidth: 230, render: r => r.published_url ? h(NButton, { text: true, tag: "a", href: r.published_url, target: "_blank", rel: "noopener noreferrer" }, () => "查看已发帖子") : r.reason || "—" },
];
watch(() => w.selected, () => { page.value = 1; data.value = null; error.value = ""; });
watch([channel,status], () => { page.value = 1; });
watch([() => w.selected, page, channel, status], (_, __, cleanup) => {
  let alive = true, timer: ReturnType<typeof setTimeout>;
  const account = w.selected;
  async function poll() {
    if (account) try {
      const value = await api<Queue>("news_queue", { account, offset: (page.value - 1) * 20, channel: channel.value, state: status.value });
      if (alive) { data.value = value; error.value = ""; page.value = Math.floor(value.offset / 20) + 1; }
    } catch (c) { if (alive) error.value = String(c); }
    if (alive) timer = setTimeout(poll, 5000);
  }
  void poll();
  cleanup(() => { alive = false; clearTimeout(timer); });
}, { immediate: true });
</script>
<template>
  <NCard title="热点列表">
    <p class="mb-16px text-muted">按新闻时间从新到旧排列，热榜未提供发布时间时使用采集时间。每次只处理一条，当前批次处理完再取下一批；无法核实或过期的内容会跳过。</p>
    <NAlert v-if="error" type="error" class="mb-16px">{{ error }}</NAlert>
    <div v-if="data?.batch" class="mb-16px">
      <div class="mb-8px">本批整体进度 · {{ data.batch.total }} 条 · 待处理 {{ data.batch.counts.pending || 0 }} · 处理中 {{ data.batch.counts.processing || 0 }} · 已发布 {{ data.batch.counts.published || 0 }} · 跳过 {{ data.batch.counts.skipped || 0 }} · 失败 {{ data.batch.counts.failed || 0 }} · 待核对 {{ data.batch.counts.uncertain || 0 }}</div>
      <NProgress type="line" :percentage="progress" :show-indicator="false" aria-label="本批热点处理进度" />
    </div>
    <div class="business-toolbar mb-16px">
      <NSelect v-model:value="channel" :options="channels" role="combobox" aria-label="热点渠道" :menu-props="{role:'listbox'}" :node-props="(option: {label?:unknown})=>({role:'option','aria-label':String(option.label)})" />
      <NSelect v-model:value="status" :options="states" role="combobox" aria-label="热点执行状态" :menu-props="{role:'listbox'}" :node-props="(option: {label?:unknown})=>({role:'option','aria-label':String(option.label)})" />
    </div>
    <NDataTable role="region" :columns="columns" :data="data?.items || []" :row-key="(r: Topic) => r.id" :scroll-x="1220" aria-label="热点列表">
      <template #empty>{{ !w.selected ? "请选择账号" : !data && !error ? "读取中…" : channel !== 'all' || status !== 'all' ? "没有符合筛选条件的热点" : "暂无热点，启用自动发文后会采集第一批" }}</template>
    </NDataTable>
    <NPagination role="navigation" v-model:page="page" :page-size="20" :item-count="data?.total || 0" class="mt-16px flex-wrap" aria-label="热点列表分页">
      <template #prefix>共 {{ data?.total || 0 }} 条 · 每页 20 条</template>
    </NPagination>
  </NCard>
</template>

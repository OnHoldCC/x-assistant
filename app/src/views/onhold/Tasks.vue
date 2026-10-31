<script setup lang="ts">
import { computed, ref, watch, h } from "vue";
import { NButton, NTag, NSpace } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { api } from "@/shared/api";
import type { Job } from "@/shared/types";
import { useWorkspace } from "./workspace";
import {
  states,
  jobLabels,
  jobTitle,
  jobLabel,
  jobMessage,
  time,
  localDate,
  safeResultUrl,
} from "./format";
import JobProgress from "./JobProgress.vue";
import JobMetrics from "./JobMetrics.vue";
import JobLogs from "./JobLogs.vue";
const discoveryLabels: Record<string, string> = {
  for_you: "For You",
  trending: "热点",
  news: "新闻搜索",
  notifications: "通知",
  post_detail: "帖子详情",
};
const w = useWorkspace(),
  jobFilter = ref("all"),
  taskTypeFilter = ref("all"),
  sourceFilter = ref("all"),
  working = ref(""),
  error = ref(""),
  recordError = ref(""),
  search = ref(""),
  page = ref(1),
  records = ref<{ items: Job[]; total: number }>({ items: [], total: 0 }),
  viewing = ref<Job | null>(null),
  editing = ref(false),
  deleting = ref<Job | null>(null),
  creating = ref(false),
  newAction = ref("capture"),
  sourceUrl = ref(""),
  sourceText = ref(""),
  editText = ref(""),
  editAction = ref("capture"),
  runAt = ref(""),
  copied = ref("");
let request = 0,
  pending = false;
watch([() => w.selected], () => {
  viewing.value = null;
  deleting.value = null;
  creating.value = false;
  page.value = 1;
  records.value = { items: [], total: 0 };
});
watch(
  [() => w.jobs, () => w.selected, jobFilter, taskTypeFilter, sourceFilter, search, page],
  async (_, __, cleanup) => {
    const id = ++request;
    cleanup(() => request++);
    if (!w.selected) {
      records.value = { items: [], total: 0 };
      return;
    }
    try {
      const value = await api<{ items: Job[]; total: number; offset: number }>(
        "job_records",
        {
          account: w.selected,
          state: jobFilter.value,
          task_type: taskTypeFilter.value,
          source: sourceFilter.value,
          search: search.value,
          offset: (page.value - 1) * 20,
        },
      );
      if (id === request) {
        records.value = value;
        recordError.value = "";
        page.value = Math.floor(value.offset / 20) + 1;
      }
    } catch (c) {
      if (id === request) recordError.value = String(c);
    }
  },
  { immediate: true },
);
const viewed = computed(
  () =>
    viewing.value &&
    (records.value.items.find((j) => j.id === viewing.value!.id) ||
      w.jobs.find(
        (j) => j.id === viewing.value!.id && j.account === w.selected,
      ) ||
      viewing.value),
);
const editable = (j: Job) =>
  j.state === "queued" &&
  (["capture", "capture_analytics"].includes(j.action) ||
    (j.action === "rewrite_publish" &&
      !["reply", "news"].includes(j.input?.mode || "") &&
      j.input?.stage === "ready"));
function open(j: Job, edit = false) {
  error.value = "";
  copied.value = "";
  editing.value = edit;
  viewing.value = j;
  editText.value = j.input?.text || "";
  editAction.value = j.action;
  runAt.value = localDate(j.input?.publish_at);
}
async function update(operation: string, j: Job, input: object = {}) {
  if (pending) return false;
  pending = true;
  working.value = j.id;
  error.value = "";
  try {
    await api(operation, { account: j.account, id: j.id, ...input });
    await w.load();
    return true;
  } catch (c) {
    error.value = c instanceof Error ? c.message : String(c);
    return false;
  } finally {
    pending = false;
    working.value = "";
  }
}
async function save() {
  if (
    viewed.value &&
    (await update(
      "update_job",
      viewed.value,
      viewed.value.action === "rewrite_publish"
        ? { text: editText.value }
        : { action: editAction.value },
    ))
  )
    viewing.value = null;
}
async function schedule() {
  const at = new Date(runAt.value).getTime();
  if (!Number.isFinite(at) || at <= Date.now()) {
    error.value = "请选择未来的发布时间";
    return;
  }
  if (viewed.value)
    await update("schedule_publication", viewed.value, { run_at: at });
}
async function copy() {
  if (!viewed.value?.input?.text) return;
  error.value = "";
  copied.value = "";
  try {
    await navigator.clipboard.writeText(viewed.value.input.text);
    copied.value = viewed.value.id;
  } catch {
    error.value = "复制失败，请展开正文后手动复制";
  }
}
async function create() {
  if (pending || !w.selected) return;
  pending = true;
  working.value = "new";
  error.value = "";
  try {
    if (["capture", "capture_analytics"].includes(newAction.value))
      await api("enqueue", { account: w.selected, action: newAction.value });
    else {
      const match = sourceUrl.value
        .trim()
        .match(
          /^https:\/\/x\.com\/([a-zA-Z0-9_]{1,15})\/status\/(\d{1,30})(?:\?.*)?$/,
        );
      if (!match) throw Error("请填写有效的 X 原帖链接");
      const author = match[1].toLowerCase(),
        id = match[2];
      await api("enqueue_rewrite", {
        account: w.selected,
        source: {
          author,
          id,
          url: `https://x.com/${author}/status/${id}`,
          text: sourceText.value,
          mode: newAction.value,
        },
      });
    }
    await w.load();
    creating.value = false;
  } catch (c) {
    error.value = c instanceof Error ? c.message : String(c);
  } finally {
    pending = false;
    working.value = "";
  }
}
const typeOptions = [
  { value: "capture", label: "采集账号与帖子" },
  { value: "capture_analytics", label: "采集官方分析" },
];
const recordTypeOptions = [
  { value: "all", label: "全部任务类型" },
  ...Object.entries(jobLabels).map(([value, label]) => ({ value, label })),
  { value: "capture_notification_follows", label: "识别新关注通知" },
  { value: "news", label: "新闻发文" },
  { value: "reply_for_you", label: "自动评论（For You）" },
  { value: "reply_notifications", label: "自动回复（通知）" },
  { value: "replicate", label: "发同款" },
  { value: "similar", label: "生成同类文章" },
];
const stateType = (j: Job) =>
  j.input?.stage === "skipped"
    ? "default"
    : j.state === "failed"
    ? "error"
    : j.state === "completed"
      ? "success"
      : ["running", "rewriting"].includes(j.state)
        ? "info"
        : "default";
const button = (text: string, onClick: () => unknown, disabled = false) =>
  h(
    NButton,
    { size: "small", quaternary: true, disabled, onClick },
    () => text,
  );
const columns: DataTableColumns<Job> = [
  { title: "账号", key: "account", width: 130, render: (j) => "@" + j.account },
  { title: "任务", key: "action", minWidth: 140, render: jobTitle },
  {
    title: "状态",
    key: "state",
    width: 230,
    render: (j) =>
      h("div", {}, [
        h(NTag, { type: stateType(j), size: "small" }, () => jobLabel(j)),
        h(JobProgress, { job: j }),
      ]),
  },
  {
    title: "计划时间",
    key: "scheduled",
    width: 180,
    render: (j) =>
      j.action === "rewrite_publish"
        ? j.input?.publish_at
          ? time(j.input.publish_at)
          : "未安排"
        : "即时任务",
  },
  {
    title: "创建时间",
    key: "created_at",
    width: 180,
    render: (j) => time(j.created_at),
  },
  {
    title: "结果",
    key: "result",
    minWidth: 260,
    render: (j) =>
      h("div", {}, [
        h("p", {}, jobMessage(j)),
        h(JobMetrics, { job: j }),
        j.state === "failed" && j.input?.stage === "sending"
          ? h(
              "p",
              { class: "business-muted" },
              "已尝试发送，请到 X 核对；不会自动重发。",
            )
          : null,
        safeResultUrl(j.result?.url)
          ? h(
              "a",
              { href: j.result!.url!, target: "_blank", rel: "noreferrer" },
              "查看已发布帖子",
            )
          : null,
      ]),
  },
  {
    title: "操作",
    key: "actions",
    width: 220,
    fixed: "right",
    render: (j) =>
      h(NSpace, { size: 2 }, () => [
        button("查看", () => open(j)),
        button("编辑", () => open(j, true), !editable(j) || !!working.value),
        j.state === "failed" &&
        ["capture", "capture_analytics"].includes(j.action)
          ? button(
              "重新采集",
              () => w.collect(j.account, j.action),
              !w.ready ||
                w.busy ||
                (j.action === "capture_analytics" && !w.analyticsReady),
            )
          : null,
        j.state === "failed" && j.action === "capture_relationships"
          ? button(
              "继续同步",
              () => update("sync_relationships", j, { kind: j.input?.kind }),
              !w.ready || !!working.value,
            )
          : null,
        j.state === "failed" &&
        j.action === "rewrite_publish" &&
        j.input?.stage !== "sending"
          ? button(
              "重试任务",
              () => update("retry_rewrite", j),
              !!working.value,
            )
          : null,
        button(
          "删除",
          () => {
            error.value = "";
            deleting.value = j;
          },
          ["rewriting", "running"].includes(j.state) || !!working.value,
        ),
      ]),
  },
];
</script>
<template>
  <div class="business-stack">
    <NAlert v-if="recordError" type="error">{{ recordError }}</NAlert
    ><NAlert v-if="error && !viewed && !deleting && !creating" type="error">{{
      error
    }}</NAlert
    ><NCard title="任务记录"
      ><template #header-extra
        ><NButton
          type="primary"
          :disabled="!w.selected || !w.ready || w.busy || !!working"
          @click="
            error = '';
            creating = true;
          "
          >新增任务</NButton
        ></template
      >
      <div class="business-toolbar mb-16px">
        <NInput
          v-model:value="search"
          :input-props="{ type: 'search', 'aria-label': '搜索任务' }"
          placeholder="搜索任务或正文"
          @update:value="page = 1"
        /><NSelect
          role="combobox"
          :menu-props="{ role: 'listbox' }"
          :node-props="(option: { label?: unknown }) => ({ role: 'option', 'aria-label': String(option.label) })"
          v-model:value="taskTypeFilter"
          aria-label="筛选任务类型"
          filterable
          :options="recordTypeOptions"
          @update:value="page = 1"
        /><NSelect
          role="combobox"
          :menu-props="{ role: 'listbox' }"
          :node-props="
            (option: { label?: unknown }) => ({
              role: 'option',
              'aria-label': String(option.label),
            })
          "
          v-model:value="jobFilter"
          aria-label="任务状态"
          :options="[
            { value: 'all', label: '全部状态' },
            ...Object.entries(states).map(([value, label]) => ({
              value,
              label: value === 'rewriting' ? '模型生成中' : label,
            })),
            { value: 'skipped', label: '本轮跳过' },
          ]"
          @update:value="page = 1"
        /><NSelect
          role="combobox"
          :menu-props="{ role: 'listbox' }"
          :node-props="
            (option: { label?: unknown }) => ({
              role: 'option',
              'aria-label': String(option.label),
            })
          "
          v-model:value="sourceFilter"
          aria-label="任务来源"
          :options="[
            { value: 'all', label: '全部来源' },
            { value: 'automation', label: '自动化执行' },
            { value: 'other', label: '其他任务' },
          ]"
          @update:value="page = 1"
        />
      </div>
      <NDataTable
        size="large"
        class="jobs-table"
        role="region"
        :columns="columns"
        :data="records.items"
        :scroll-x="1340"
        :row-key="(row: Job) => row.id"
        aria-label="任务记录列表"
        ><template #empty>{{
          search || jobFilter !== "all" || taskTypeFilter !== "all" || sourceFilter !== "all"
            ? "没有匹配的任务"
            : "暂无任务"
        }}</template></NDataTable
      ><NPagination
        role="navigation"
        v-model:page="page"
        :page-size="20"
        :item-count="records.total"
        class="mt-16px flex-wrap"
        aria-label="任务记录分页"
        ><template #prev="{ page: current }"
          ><NButton text :disabled="current <= 1" aria-label="上一页"
            >上一页</NButton
          ></template
        ><template #next="{ page: current, pageCount }"
          ><NButton text :disabled="current >= pageCount" aria-label="下一页"
            >下一页</NButton
          ></template
        ><template #prefix>共 {{ records.total }} 条 · 每页 20 条</template
        ><template #suffix
          >第 {{ page }} /
          {{ Math.max(1, Math.ceil(records.total / 20)) }} 页</template
        ></NPagination
      ></NCard
    >
    <NDrawer
      :show="!!viewed"
      :aria-label="editing ? '编辑任务' : '任务详情'"
      :width="680"
      style="max-width: 100vw"
      :mask-closable="!working"
      @update:show="
        (v: boolean) => {
          if (!v && !working) viewing = null;
        }
      "
      ><NDrawerContent :title="editing ? '编辑任务' : '任务详情'" closable
        ><div v-if="viewed" class="business-stack">
          <p>{{ jobTitle(viewed) }} · @{{ viewed.account }}</p>
          <NAlert v-if="error" type="error">{{ error }}</NAlert
          ><NTag :type="stateType(viewed)">{{ jobLabel(viewed) }}</NTag
          ><JobProgress :job="viewed" />
          <p>{{ jobMessage(viewed) }}</p>
          <JobMetrics :job="viewed" details />
          <template v-if="viewed.action === 'rewrite_publish'"
            ><p v-if="viewed.input?.query">
              新闻搜索主题：{{ viewed.input.query }}
            </p>
            <NCollapse
              ><NCollapseItem
                v-if="viewed.input?.rejected_generation"
                title="未通过校验的生成结果（未发送）"
              >
                <pre class="business-pre">{{
                  JSON.stringify(viewed.input.rejected_generation, null, 2)
                }}</pre></NCollapseItem
              ><NCollapseItem v-if="viewed.input?.source" title="原文"
                ><p class="business-pre">
                  {{ viewed.input.source.text }}
                </p></NCollapseItem
              ><NCollapseItem
                v-if="viewed.input?.analysis"
                title="Codex 原帖分析"
                ><NDescriptions :column="1"
                  ><NDescriptionsItem label="主题">{{
                    viewed.input.analysis.topic
                  }}</NDescriptionsItem
                  ><NDescriptionsItem label="结构">{{
                    viewed.input.analysis.structure
                  }}</NDescriptionsItem
                  ><NDescriptionsItem label="语气">{{
                    viewed.input.analysis.tone
                  }}</NDescriptionsItem></NDescriptions
                >
                <ul>
                  <li
                    v-for="(point, i) in viewed.input.analysis.key_points"
                    :key="i"
                  >
                    {{ point }}
                  </li>
                </ul></NCollapseItem
              ><NCollapseItem
                v-if="viewed.input?.text"
                :title="
                  viewed.input.mode === 'news'
                    ? '新闻短帖'
                    : viewed.input.mode === 'reply'
                      ? '回复正文'
                      : ['similar', 'replicate'].includes(
                            viewed.input.mode || '',
                          )
                        ? '同类文章正文'
                        : '改写正文'
                "
                ><p class="business-pre">
                  {{ viewed.input.text }}
                </p></NCollapseItem
              ></NCollapse
            >
            <a
              v-if="viewed.input?.source"
              :href="viewed.input.source.url"
              target="_blank"
              rel="noreferrer"
              >{{
                viewed.input.mode === "news"
                  ? "新闻来源 · " + viewed.input.source.title
                  : "查看原帖 · @" + viewed.input.source.author
              }}</a
            >
            <p v-if="viewed.input?.source?.published_at">
              新闻发布时间：{{ time(viewed.input.source.published_at) }}
            </p>
            <p v-if="viewed.input?.discovered_from">
              发现来源：{{
                discoveryLabels[viewed.input.discovered_from] ||
                viewed.input.discovered_from
              }}
            </p>
            <NButton v-if="viewed.input?.text" @click="copy">复制正文</NButton
            ><small v-if="copied === viewed.id" role="status">正文已复制</small
            ><NForm
              v-if="
                viewed.input?.mode !== 'reply' &&
                ['queued', 'rewriting'].includes(viewed.state)
              "
              class="business-form"
              @submit.prevent="schedule"
              ><NInput
                v-model:value="runAt"
                placeholder=""
                :input-props="{
                  type: 'datetime-local',
                  required: true,
                  'aria-label': '发布时间 ' + viewed.id,
                }"
              /><NButton attr-type="submit" :disabled="!!working">{{
                viewed.input?.publish_at ? "调整时间" : "安排发布"
              }}</NButton></NForm
            ><small
              v-if="
                viewed.state === 'failed' && viewed.input?.stage === 'sending'
              "
              >已尝试发送，请到 X 核对；不会自动重发。</small
            ><a
              v-if="safeResultUrl(viewed.result?.url)"
              :href="viewed.result!.url!"
              target="_blank"
              rel="noreferrer"
              >查看已发布帖子</a
            ></template
          >
          <JobLogs :key="viewed.id" :job="viewed" /><NForm
            v-if="editing && editable(viewed)"
            class="business-form"
            @submit.prevent="save"
            ><NFormItem v-if="viewed.action === 'rewrite_publish'" label="正文"
              ><NInput
                v-model:value="editText"
                type="textarea"
                :rows="8"
                :maxlength="24000"
                :input-props="{
                  required: true,
                  'aria-label': '任务正文',
                }" /></NFormItem
            ><NFormItem v-else label="任务类型"
              ><NSelect
                role="combobox"
                :menu-props="{ role: 'listbox' }"
                :node-props="
                  (option: { label?: unknown }) => ({
                    role: 'option',
                    'aria-label': String(option.label),
                  })
                "
                v-model:value="editAction"
                aria-label="编辑任务类型"
                :options="typeOptions" /></NFormItem
            ><NButton attr-type="submit" type="primary" :disabled="!!working"
              >保存修改</NButton
            ></NForm
          >
        </div></NDrawerContent
      ></NDrawer
    >
    <NDrawer
      :show="creating"
      aria-label="新增任务"
      :width="600"
      style="max-width: 100vw"
      :mask-closable="!working"
      @update:show="
        (v: boolean) => {
          if (!working) creating = v;
        }
      "
      ><NDrawerContent title="新增任务" closable
        ><div class="business-stack">
          <p>
            发同款会在 Codex
            分析生成并校验后自动发布；改写和同类文章保持草稿，需另行排期。
          </p>
          <NAlert v-if="error" type="error">{{ error }}</NAlert
          ><NForm class="business-form" @submit.prevent="create"
            ><NFormItem label="任务类型"
              ><NSelect
                role="combobox"
                :menu-props="{ role: 'listbox' }"
                :node-props="
                  (option: { label?: unknown }) => ({
                    role: 'option',
                    'aria-label': String(option.label),
                  })
                "
                v-model:value="newAction"
                aria-label="新任务类型"
                :options="[
                  ...typeOptions,
                  { value: 'replicate', label: '发同款（生成后自动发布）' },
                  { value: 'rewrite', label: '改写原帖' },
                  { value: 'similar', label: '生成同类文章' },
                ]" /></NFormItem
            ><template
              v-if="['rewrite', 'similar', 'replicate'].includes(newAction)"
              ><NFormItem label="原帖链接"
                ><NInput
                  v-model:value="sourceUrl"
                  :input-props="{
                    type: 'url',
                    required: true,
                    'aria-label': '原帖链接',
                  }"
                  placeholder="https://x.com/作者/status/帖子ID" /></NFormItem
              ><NFormItem label="完整原文"
                ><NInput
                  v-model:value="sourceText"
                  type="textarea"
                  :rows="8"
                  :maxlength="24000"
                  :input-props="{
                    required: true,
                    'aria-label': '完整原文',
                  }" /></NFormItem></template
            ><NAlert v-if="newAction === 'replicate'"
              >将原帖交给 Codex 分析，返回固定 JSON 并通过校验后，自动发送到 @{{
                w.selected
              }}。</NAlert
            ><NButton
              attr-type="submit"
              type="primary"
              :disabled="
                !!working ||
                !w.selected ||
                !w.ready ||
                (newAction === 'capture_analytics' && !w.analyticsReady)
              "
              >{{
                newAction === "replicate" ? "创建并自动发布" : "创建任务"
              }}</NButton
            ></NForm
          >
        </div></NDrawerContent
      ></NDrawer
    >
    <NModal
      :show="!!deleting"
      aria-label="删除任务"
      preset="dialog"
      title="删除任务"
      content="移除此任务并取消尚未执行的工作。已发生的操作不会撤销，执行记录仍保留。"
      positive-text="确认删除"
      negative-text="取消"
      :loading="!!working"
      :mask-closable="!working"
      @negative-click="deleting = null"
      @close="deleting = null"
      @positive-click="
        async () => {
          if (deleting && (await update('delete_job', deleting)))
            deleting = null;
          return false;
        }
      "
      ><p>{{ deleting ? jobTitle(deleting) : "" }}</p>
      <NAlert v-if="error" type="error">{{ error }}</NAlert></NModal
    >
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, h } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NButton, NTag, NSpace } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { api } from "@/shared/api";
import type { Job, NewsSource, NewsFeed } from "@/shared/types";
import { useWorkspace } from "./workspace";
import { time, localDate } from "./format";
import JobProgress from "./JobProgress.vue";
type Plan = {
  id: string;
  enabled: boolean;
  state: string;
  next_run: number;
  last_run: number | null;
  last_job?: Job | null;
  config: {
    action: string;
    interval_minutes: number;
    interval_seconds?: number;
    limit: number;
    after_days: number;
    stop_at?: number | null;
    query?: string | null;
    language?: "auto" | "en";
    news_source?: NewsSource;
    include_source_link?: boolean;
    scope: string;
    targets: string[];
  };
};
type State = {
  account: string;
  block: { reason: string; at: number } | null;
  tasks: Plan[];
};
const w = useWorkspace(),
  state = ref<State | null>(null),
  action = ref("follow_back"),
  scope = ref("notifications"),
  interval = ref("1440"),
  limit = ref<number | null>(5),
  days = ref<number | null>(7),
  stopAt = ref(""),
  query = ref(""),
  language = ref("auto"),
  newsSource = ref("web"),
  includeSourceLink = ref(false),
  sourcePreview = ref<NewsFeed | null>(null),
  previewing = ref(false),
  targets = ref(""),
  error = ref(""),
  busy = ref(false),
  search = ref(""),
  filter = ref("all"),
  page = ref(1),
  editing = ref<Plan | null>(null),
  editorOpen = ref(false),
  readOnly = ref(false),
  deleting = ref<Plan | null>(null);
let revision = 0,
  mutation = false;
async function load() {
  const id = ++revision,
    target = w.selected;
  if (!target) {
    state.value = null;
    return;
  }
  try {
    const value = await api<State>("automation", { account: target });
    if (id === revision && value.account === w.selected) state.value = value;
  } catch (c) {
    if (id === revision) error.value = String(c);
  }
}
watch(
  () => w.selected,
  (_, __, cleanup) => {
    state.value = null;
    error.value = "";
    editorOpen.value = false;
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await load();
      if (alive) timer = setTimeout(poll, 2000);
    }
    void poll();
    cleanup(() => {
      alive = false;
      revision++;
      clearTimeout(timer);
    });
  },
  { immediate: true },
);
async function perform(operation: string, input: object = {}) {
  if (mutation) return false;
  mutation = true;
  busy.value = true;
  error.value = "";
  try {
    await api(operation, { ...input, account: w.selected });
    await load();
    return true;
  } catch (c) {
    error.value = c instanceof Error ? c.message : String(c);
    return false;
  } finally {
    mutation = false;
    busy.value = false;
  }
}
function open(plan: Plan | null, view = false) {
  editing.value = plan;
  readOnly.value = view;
  error.value = "";
  action.value = plan?.config.action || "follow_back";
  scope.value = plan?.config.scope || "notifications";
  interval.value = plan?.config.interval_seconds===25 ? "25s" : String(plan?.config.interval_minutes || 1440);
  limit.value = plan?.config.limit || 5;
  days.value = plan?.config.after_days || 7;
  targets.value = plan?.config.targets.join(", ") || "";
  stopAt.value = localDate(plan?.config.stop_at);
  query.value = plan?.config.query || "";
  language.value = plan?.config.language || "auto";
  newsSource.value = plan?.config.news_source || "web";
  includeSourceLink.value = plan ? plan.config.include_source_link ?? true : false;
  sourcePreview.value = null;
  editorOpen.value = true;
}
function fromRelations(value: "follow_back" | "unfollow", handles: string[]) {
  open(null);
  action.value = value;
  scope.value = "manual";
  targets.value = handles.join(", ");
}
const route=useRoute(), router=useRouter();
watch([()=>route.query,()=>w.selected],()=>{
  if(route.path!=="/automation" || !w.selected || route.query.account!==w.selected) return;
  const {action:requested,targets:requestedTargets,account:_,...rest}=route.query;
  if(requested!=="follow_back" && requested!=="unfollow") return;
  const handles=typeof requestedTargets==="string" ? requestedTargets.split(",") : [];
  if(handles.length && handles.length<=50 && handles.every(value=>/^[a-zA-Z0-9_]{1,15}$/.test(value))) fromRelations(requested,handles);
  else error.value="关系名单目标无效，请重新选择账号";
  void router.replace({path:route.path,query:rest});
},{immediate:true});
function changeAction(value: string) {
  action.value = value;
  if(!["reply_notifications","auto_reply"].includes(value) && interval.value==="25s")interval.value="1";
  if (value === "auto_post") limit.value = 1;
  scope.value =
    value === "auto_post"
      ? "news"
      : value === "reply_notifications"
        ? "notifications"
        : value === "auto_reply"
          ? "for_you"
          : value === "follow_back" ? "notifications" : "automation_owned";
}
const automatic = computed(() =>
  ["auto_reply", "reply_notifications", "auto_post"].includes(action.value),
);
const name = (p: Plan) =>
  p.config.action === "auto_post"
    ? "自动发文"
    : p.config.action === "reply_notifications"
      ? "自动回复（通知）"
      : p.config.action === "auto_reply"
        ? "自动评论（For You）"
        : p.config.action === "follow_back"
          ? "一键回关"
          : "一键取消关注";
const newsSources = [
  {value:"web",label:"全网新闻"},
  {value:"weibo",label:"微博热点"},
  {value:"rednote",label:"小红书热点"},
  {value:"hot_topics",label:"微博 + 小红书热点"},
  {value:"international",label:"国外新闻（RSS）"},
  {value:"mixed",label:"微博、小红书与国外新闻"},
];
const sourceNames:Record<string,string>={weibo:"微博",rednote:"小红书",bbc:"BBC 娱乐",guardian:"Guardian 文化",variety:"Variety 娱乐",deadline:"Deadline 娱乐"};
watch(newsSource,()=>sourcePreview.value=null);
async function previewSources(){
  const source=newsSource.value;previewing.value=true;error.value="";
  try{const value=await api<NewsFeed>("news_sources",{source});if(newsSource.value===source)sourcePreview.value=value;}
  catch(c){error.value=c instanceof Error?c.message:String(c);}
  finally{previewing.value=false;}
}
const previewItems=computed(()=>sourcePreview.value?.items.filter((item,index,items)=>items.findIndex(other=>other.platform===item.platform)===index)||[]);
const status = (p: Plan) => {
  const phase =
    p.last_job && ["queued", "running"].includes(p.last_job.state)
      ? p.last_job.state
      : p.state;
  return state.value?.block
    ? "限制暂停"
    : !p.enabled
      ? "已暂停"
      : !w.clients.some(c=>c.account===w.selected&&c.online&&c.transport!=="backend"&&c.login_state==="logged_in")
        ? "等待插件连接"
      : p.last_job?.input?.stage === "skipped" && p.last_job.state === "completed"
        ? "本轮跳过"
      : (
          {
            queued: "等待执行",
            running: "执行中",
            waiting: "已启用",
            error: "执行失败",
            limited: "限制暂停",
          } as Record<string, string>
        )[phase] || phase;
};
const plans = computed(() =>
  (state.value?.tasks || []).filter(
    (p) =>
      (filter.value === "all" ||
        (filter.value === "enabled" ? p.enabled : !p.enabled)) &&
      [name(p), p.id, ...p.config.targets]
        .join(" ")
        .toLowerCase()
        .includes(search.value.trim().toLowerCase()),
  ),
);
watch([plans, page], () => {
  page.value = Math.min(
    page.value,
    Math.max(1, Math.ceil(plans.value.length / 20)),
  );
});
const active = (p: Plan) =>
  ["queued", "running"].includes(p.state) ||
  (!!p.last_job && ["queued", "running"].includes(p.last_job.state));
const button = (text: string, onClick: () => unknown, disabled = false) =>
  h(
    NButton,
    { size: "small", quaternary: true, disabled, onClick },
    () => text,
  );
const columns: DataTableColumns<Plan> = [
  { title: "任务", key: "name", width: 170, render: p => h("div", {}, [h("p", name(p)), p.config.language === "en" ? h(NTag, { size: "small", type: "info" }, () => "英文") : null]) },
  {
    title: "目标范围",
    key: "scope",
    width: 260,
    ellipsis: { tooltip: true },
    render: (p) =>
      p.config.action === "auto_post"
        ? `${newsSources.find(source=>source.value===p.config.news_source)?.label || '新闻搜索'} · ${p.config.query || '请设置主题'}`
        : p.config.action === "reply_notifications"
          ? "小铃铛 · 对我的帖子的回复"
          : p.config.action === "auto_reply"
            ? "For You 新帖子 · 每帖一个任务"
            : p.config.scope === "manual"
              ? `指定 ${p.config.targets.length} 个账号`
              : p.config.action === "follow_back"
                ? p.config.scope === "notifications" ? "小铃铛 · 新关注通知" : "已同步的待回关账号"
                : `本系统关注满 ${p.config.after_days} 天未回关`,
  },
  {
    title: "执行间隔",
    key: "interval",
    width: 110,
    render: (p) =>
      p.config.interval_seconds===25
        ? "25 秒"
        : p.config.interval_minutes >= 60
        ? `${p.config.interval_minutes / 60} 小时`
        : `${p.config.interval_minutes} 分钟`,
  },
  {
    title: "每次最多",
    key: "limit",
    width: 100,
    render: (p) =>
      p.config.limit +
      (["auto_reply", "reply_notifications", "auto_post"].includes(
        p.config.action,
      )
        ? " 条帖子"
        : " 人"),
  },
  {
    title: "状态",
    key: "state",
    width: 230,
    render: (p) =>
      h("div", {}, [
        h(
          NTag,
          { type: p.state === "limited" ? "error" : "default", size: "small" },
          () => status(p),
        ),
        h(JobProgress, { job: p.last_job }),
      ]),
  },
  {
    title: "上次执行",
    key: "last",
    width: 180,
    render: (p) =>
      h("div", {}, [
        time(p.last_run),
        p.config.stop_at
          ? h("small", {}, "停止于 " + time(p.config.stop_at))
          : null,
      ]),
  },
  {
    title: "下次执行",
    key: "next",
    width: 180,
    render: (p) =>
      p.enabled && !state.value?.block ? time(p.next_run) : "已暂停",
  },
  {
    title: "操作",
    key: "actions",
    width: 190,
    fixed: "right",
    render: (p) =>
      h(NSpace, { size: 2 }, () => [
        button("查看", () => open(p, true)),
        button("编辑", () => open(p), busy.value || active(p)),
        button(
          p.enabled ? "暂停" : "启用",
          () =>
            perform("control_automation", { id: p.id, enabled: !p.enabled }),
          busy.value || !!state.value?.block,
        ),
        p.enabled
          ? button(
              "立即执行",
              () => perform("run_automation", { id: p.id }),
              busy.value || !!state.value?.block,
            )
          : null,
        button(
          "删除",
          () => {
            error.value = "";
            deleting.value = p;
          },
          busy.value || active(p),
        ),
      ]),
  },
];
async function save() {
  if (
    limit.value == null ||
    limit.value < 1 ||
    limit.value > 20 ||
    days.value == null ||
    days.value < 1 ||
    days.value > 365
  ) {
    error.value = "请填写有效的数量和天数";
    return;
  }
  const stop = stopAt.value ? new Date(stopAt.value).getTime() : null;
  if (stop !== null && (!Number.isFinite(stop) || stop <= Date.now())) {
    error.value = "请选择未来的自动停止时间";
    return;
  }
  if (
    await perform("save_automation", {
      ...(editing.value ? { id: editing.value.id } : {}),
      action: action.value,
      scope:
        action.value === "auto_post"
          ? "news"
          : action.value === "reply_notifications"
            ? "notifications"
            : action.value === "auto_reply"
              ? "for_you"
              : scope.value,
      interval_minutes: interval.value==="25s" ? 1 : Number(interval.value),
      ...(["reply_notifications","auto_reply"].includes(action.value) && interval.value==="25s" ? {interval_seconds:25} : {}),
      limit: limit.value,
      after_days: days.value,
      stop_at: stop,
      query: action.value === "auto_post" ? query.value : null,
      language: automatic.value ? language.value : "auto",
      ...(action.value === "auto_post" ? {news_source: newsSource.value,include_source_link:includeSourceLink.value} : {}),
      targets: (automatic.value ? "" : targets.value)
        .split(/[,，\s]+/)
        .map((v) => v.replace(/^@/, "").trim().toLowerCase())
        .filter(Boolean),
    })
  )
    editorOpen.value = false;
}
</script>
<template>
  <div class="business-stack">
    <NAlert v-if="error && !editorOpen && !deleting" type="error">{{
      error
    }}</NAlert
    ><NAlert v-if="state?.block" type="error"
      >{{ state.block.reason }} · {{ time(state.block.at) }}
      <NButton text :disabled="busy" @click="perform('resume_automation')"
        >确认限制解除并恢复</NButton
      ></NAlert
    ><NCard title="自动化任务配置"
      ><template #header-extra
        ><NButton
          type="primary"
          :disabled="!w.selected || busy"
          @click="open(null)"
          >新增自动化任务</NButton
        ></template
      >
      <div class="business-toolbar mb-16px">
        <NInput
          v-model:value="search"
          :input-props="{ type: 'search', 'aria-label': '搜索自动化任务' }"
          placeholder="搜索任务或目标账号"
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
          v-model:value="filter"
          aria-label="自动化任务状态"
          :options="[
            { value: 'all', label: '全部状态' },
            { value: 'enabled', label: '已启用' },
            { value: 'paused', label: '已暂停' },
          ]"
          @update:value="page = 1"
        />
      </div>
      <NDataTable
        size="large"
        role="region"
        :columns="columns"
        :data="plans.slice((page - 1) * 20, page * 20)"
        :scroll-x="1420"
        :row-key="(row: Plan) => row.id"
        aria-label="自动化任务列表"
        ><template #empty>{{
          w.selected && !state && !error
            ? "读取中…"
            : search || filter !== "all"
              ? "没有匹配的自动化任务"
              : "暂无自动化任务"
        }}</template></NDataTable
      ><NPagination
        role="navigation"
        v-model:page="page"
        :page-size="20"
        :item-count="plans.length"
        class="mt-16px flex-wrap"
        aria-label="自动化任务配置分页"
        ><template #prev="{ page: current }"
          ><NButton text :disabled="current <= 1" aria-label="上一页"
            >上一页</NButton
          ></template
        ><template #next="{ page: current, pageCount }"
          ><NButton text :disabled="current >= pageCount" aria-label="下一页"
            >下一页</NButton
          ></template
        ><template #prefix>共 {{ plans.length }} 条 · 每页 20 条</template
        ><template #suffix
          >第 {{ page }} /
          {{ Math.max(1, Math.ceil(plans.length / 20)) }} 页</template
        ></NPagination
      ></NCard
    >
    <NDrawer
      :show="editorOpen"
      :aria-label="
        readOnly
          ? '自动化任务详情'
          : editing
            ? '编辑自动化任务'
            : '新增自动化任务'
      "
      :width="620"
      style="max-width: 100vw"
      :mask-closable="!busy"
      @update:show="
        (v: boolean) => {
          if (!busy) editorOpen = v;
        }
      "
      ><NDrawerContent
        :title="
          readOnly
            ? '自动化任务详情'
            : editing
              ? '编辑自动化任务'
              : '新增自动化任务'
        "
        closable
        ><div class="business-stack">
          <p>
            {{
              readOnly
                ? "查看当前任务的执行配置。"
                : "保存后保持暂停，核对范围后再启用。"
            }}
          </p>
          <NAlert v-if="error" type="error">{{ error }}</NAlert
          ><JobProgress
            v-if="editing"
            :job="state?.tasks.find((p) => p.id === editing!.id)?.last_job"
          /><NForm
            class="business-form"
            :disabled="busy || readOnly"
            @submit.prevent="save"
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
                :value="action"
                aria-label="任务类型"
                :options="[
                  { value: 'follow_back', label: '一键回关' },
                  { value: 'unfollow', label: '一键取消关注' },
                  { value: 'auto_post', label: '自动发文（新闻）' },
                  { value: 'auto_reply', label: '自动评论（For You）' },
                  { value: 'reply_notifications', label: '自动回复（通知）' },
                ]"
                @update:value="changeAction" /></NFormItem
            ><NAlert v-if="automatic"
              ><template v-if="action === 'auto_post'"
                >Codex
                联网搜索最近48小时的相关新闻，核对来源与发布时间，再整理成 X
                帖子。不使用评分模型；跳过已有记录的新闻，检索失败或没有可核实的新新闻时不发布。</template
              ><template v-else-if="action === 'reply_notifications'"
                >打开小铃铛通知，只识别别人对当前账号帖子的回复，交给 Codex
                生成文字并回复对方。根据本机记录跳过已经处理的原帖，保留耗时、token
                与回执。</template
              ><template v-else
                >读取 For You 的新帖子，不按评分筛选，每帖建立独立任务，交给
                Codex
                生成回复后发送。跳过广告和已处理帖子，按间隔逐条处理完当前页再刷新；需已登录
                Codex CLI 并连接新版插件。</template
              ></NAlert
            ><NFormItem v-else label="目标范围"
              ><NSelect
                role="combobox"
                :menu-props="{ role: 'listbox' }"
                :node-props="
                  (option: { label?: unknown }) => ({
                    role: 'option',
                    'aria-label': String(option.label),
                  })
                "
                v-model:value="scope"
                aria-label="目标范围"
                :options="[
                  ...(action === 'follow_back' ? [{value:'notifications',label:'通知中的新关注者'}] : []),
                  {
                    value: 'automation_owned',
                    label:
                      action === 'follow_back'
                        ? '已同步的待回关账号'
                        : '本系统关注且到期未回关的人',
                  },
                  { value: 'manual', label: '手动指定名单' },
                ]" /></NFormItem
            ><p v-if="action === 'follow_back' && scope === 'notifications'" class="business-muted">识别小铃铛中的新关注通知，打开主页确认仍关注你、且尚未回关后执行。需要 1.5.14 或更新的助手；点赞通知不会触发回复。</p><NFormItem v-if="automatic" label="内容语言">
              <NSelect v-model:value="language" role="combobox" aria-label="内容语言" :menu-props="{ role: 'listbox' }" :node-props="option => ({ role: 'option', 'aria-label': String(option.label) })" :options="[{ value: 'auto', label: '跟随原帖（新闻默认中文）' }, { value: 'en', label: '英文（不限制原帖语言）' }]" />
            </NFormItem><NFormItem v-if="!automatic && scope === 'manual'" label="目标账号"
              ><NInput
                v-model:value="targets"
                :input-props="{ required: true, 'aria-label': '目标账号' }"
                placeholder="账号之间用逗号分隔，不含 @" /></NFormItem
            ><NFormItem label="执行间隔"
              ><NSelect
                role="combobox"
                :menu-props="{ role: 'listbox' }"
                :node-props="
                  (option: { label?: unknown }) => ({
                    role: 'option',
                    'aria-label': String(option.label),
                  })
                "
                v-model:value="interval"
                aria-label="执行间隔"
                :options="
                  [
                    ...(['reply_notifications','auto_reply'].includes(action) ? [['25s', '每25秒']] : []),
                    ['1', '每1分钟'],
                    ['3', '每3分钟'],
                    ['5', '每5分钟'],
                    ['10', '每10分钟'],
                    ['15', '每15分钟'],
                    ['60', '每小时'],
                    ['720', '每12小时'],
                    ['1440', '每天'],
                    ['10080', '每周'],
                  ].map(([value, label]) => ({ value, label }))
                " /></NFormItem
            ><NFormItem label="每次最多"
              ><NInputNumber
                v-model:value="limit"
                :min="1"
                :max="20"
                :precision="0"
                :input-props="{ 'aria-label': '每次最多' }" /></NFormItem
            ><NFormItem
              v-if="action === 'unfollow' && scope === 'automation_owned'"
              label="关注满多少天"
              ><NInputNumber
                v-model:value="days"
                :min="1"
                :max="365"
                :precision="0"
                :input-props="{ 'aria-label': '关注满多少天' }" /></NFormItem
            ><NFormItem v-if="action === 'auto_post'" label="新闻来源">
              <NSelect v-model:value="newsSource" role="combobox" aria-label="新闻来源"
                :menu-props="{role:'listbox'}" :node-props="(option: {label?: unknown}) => ({role:'option','aria-label':String(option.label)})"
                :options="newsSources" />
            </NFormItem>
            <div v-if="action === 'auto_post' && newsSource !== 'web'" class="mb-16px business-stack">
              <NButton :loading="previewing" :disabled="previewing" @click="previewSources">预览取材</NButton>
              <template v-if="sourcePreview">
                <p>采集于 {{time(sourcePreview.retrieved_at)}}{{sourcePreview.cached?' · 缓存结果':''}}</p>
                <p>{{Object.entries(sourcePreview.counts).map(([key,count])=>`${sourceNames[key]||key} ${count} 条`).join(' · ')}}</p>
                <ul><li v-for="item in previewItems" :key="item.platform"><a :href="item.url" target="_blank" rel="noreferrer">{{sourceNames[item.platform]||item.platform}}：{{item.title}}</a></li></ul>
                <p v-for="failure in sourcePreview.errors" :key="failure.platform">{{sourceNames[failure.platform]||failure.platform}}：{{failure.error}}</p>
              </template>
              <p class="business-muted">热榜用于选题；生成前仍需核实事实和原文时间。来源保留在任务记录。</p>
            </div>
            <NFormItem v-if="action === 'auto_post'" label="发布正文"><NCheckbox v-model:checked="includeSourceLink" :disabled="readOnly">附上来源链接</NCheckbox></NFormItem>
            <NFormItem v-if="action === 'auto_post'" label="新闻搜索主题"
              ><NInput
                v-model:value="query"
                :maxlength="500"
                :input-props="{ required: true, 'aria-label': '新闻搜索主题' }"
                :placeholder="newsSource === 'weibo' ? '微博娱乐八卦热点' : '例如：各行业热点新闻'" /></NFormItem
            ><NFormItem label="自动停止时间（可选）"
              ><NInput
                v-model:value="stopAt"
                placeholder=""
                :input-props="{
                  type: 'datetime-local',
                  'aria-label': '自动停止时间',
                }"
            /></NFormItem>
            <p class="business-muted">
              按本机时区，到时暂停计划并阻止新的发送。
            </p>
            <NButton
              v-if="!readOnly"
              attr-type="submit"
              type="primary"
              :disabled="busy || !w.selected"
              >{{ editing ? "保存并保持暂停" : "创建并保持暂停" }}</NButton
            ></NForm
          >
        </div></NDrawerContent
      ></NDrawer
    >
    <NModal
      :show="!!deleting"
      aria-label="删除自动化任务"
      preset="dialog"
      title="删除自动化任务"
      content="删除此计划后停止后续调度，已有执行记录仍会保留。"
      positive-text="确认删除"
      negative-text="取消"
      :loading="busy"
      :mask-closable="!busy"
      @close="deleting = null"
      @negative-click="deleting = null"
      @positive-click="
        async () => {
          if (
            deleting &&
            (await perform('delete_automation', { id: deleting.id }))
          )
            deleting = null;
          return false;
        }
      "
      ><p>{{ deleting ? name(deleting) : "" }}</p>
      <NAlert v-if="error" type="error">{{ error }}</NAlert></NModal
    >
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, h } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NButton, NTag, NSpace } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import { api } from "@/shared/api";
import type { Job } from "@/shared/types";
import { useWorkspace } from "./workspace";
import { time, localDate, loginLabels } from "./format";
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
    language?: "auto" | "en";
    scope: string;
    targets: string[];
    source_urls?: string[];
    publish_mode?: "review" | "automatic";
    news_source?: string;
    query?: string;
    allow_news_search?: boolean;
    include_source_link?: boolean;
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
  intervalHours = ref<number | null>(24),
  intervalMinutes = ref<number | null>(0),
  intervalSeconds = ref<number | null>(0),
  limit = ref<number | null>(5),
  days = ref<number | null>(7),
  stopAt = ref(""),
  language = ref("auto"),
  targets = ref(""),
  publishMode = ref("review"),
  sourceUrls = ref("https://www.tiktok.com/"),
  newsSource = ref("gossip"),
  newsQuery = ref("微博和贴吧近期有反转、矛盾或讨论价值的社会趣闻、娱乐事件和网络热议。排除政治、广告、血腥、隐私及未经证实的私人指控；剧情或摆拍须明确标注。根据可核实的原帖或报道写简洁英文配文，可附一个具体问题邀请讨论，并保留来源链接。"),
  allowNewsSearch = ref(true),
  includeSourceLink = ref(true),
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
  interval.value = String(plan?.config.interval_minutes || 1440);
  const seconds = plan?.config.interval_seconds ?? Number(interval.value) * 60;
  intervalHours.value = Math.floor(seconds / 3600);
  intervalMinutes.value = Math.floor(seconds % 3600 / 60);
  intervalSeconds.value = seconds % 60;
  limit.value = plan?.config.limit || 5;
  days.value = plan?.config.after_days || 7;
  targets.value = plan?.config.targets.join(", ") || "";
  sourceUrls.value = plan?.config.source_urls?.join("\n") || "https://www.tiktok.com/";
  publishMode.value = plan?.config.publish_mode || "review";
  newsSource.value = plan?.config.news_source || "gossip";
  if (plan?.config.query) newsQuery.value = plan.config.query;
  allowNewsSearch.value = plan?.config.allow_news_search ?? true;
  includeSourceLink.value = plan?.config.include_source_link ?? true;
  stopAt.value = localDate(plan?.config.stop_at);
  language.value = plan?.config.language || "auto";
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
  if(value==='auto_image'){intervalHours.value=1;intervalMinutes.value=0;intervalSeconds.value=0;limit.value=1;language.value='en';}
  if(value==='auto_meme'){intervalHours.value=0;intervalMinutes.value=2;intervalSeconds.value=0;limit.value=1;language.value='en';}
  if(value==='auto_video'){interval.value='1';limit.value=5;language.value='en';}
  if(value==='auto_post'){interval.value='10';limit.value=1;language.value='en';}
  scope.value =
    value === "auto_video" ? "tiktok" : value === "reply_notifications"
        ? "notifications"
        : ["auto_reply","auto_image"].includes(value)
          ? "for_you"
          : value === "follow_back" ? "notifications" : "automation_owned";
}
const automatic = computed(() =>
  ["auto_reply", "reply_notifications", "auto_video", "auto_image", "auto_post", "auto_meme"].includes(action.value),
);
const customInterval = computed(() =>
  ["auto_reply", "reply_notifications", "auto_image", "auto_meme"].includes(action.value),
);
const name = (p: Plan) =>
  p.config.action === "auto_meme" ? "孙笑川吧梗图（自动发布）" :
  p.config.action === "auto_post" ? "吃瓜热点（微博 / 贴吧）" :
  p.config.action === "auto_image" ? "搞笑图文（自动发布）" :
  p.config.action === "auto_video" ? "视频处理与发布（TikTok）" : p.config.action === "reply_notifications"
      ? "自动回复（通知）"
      : p.config.action === "auto_reply"
        ? "自动评论（For You）"
        : p.config.action === "follow_back"
          ? (p.config.scope === "notifications" ? "自动回关（通知）" : "自动回关")
          : "一键取消关注";
const status = (p: Plan) => {
  const client = w.clients.find(c=>c.account===w.selected&&c.online&&c.transport!=="backend");
  const phase =
    p.last_job && ["queued", "running"].includes(p.last_job.state)
      ? p.last_job.state
      : p.state;
  return state.value?.block
    ? "限制暂停"
    : !p.enabled
      ? "已暂停"
      : !client
        ? "等待插件连接"
      : client.login_state!=="logged_in"
        ? "X " + loginLabels[client.login_state]
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
      p.config.action === "auto_meme" ? "孙笑川吧正文图片 · AI风控 / 去水印 / 复核" : p.config.action === "auto_post" ? (({gossip:'微博＋贴吧',weibo:'微博',tieba:'贴吧',rednote:'小红书',hot_topics:'社交热榜',international:'国际媒体',mixed:'混合来源',web:'公开检索'} as Record<string,string>)[p.config.news_source || 'gossip'] || p.config.news_source) : p.config.action === "auto_image" ? "AI 漫画互动 · 人物找不同 / 搞笑 / 错觉" : p.config.action === "auto_video" ? (p.config.source_urls || []).join(" · ") : p.config.action === "reply_notifications"
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
    width: 170,
    render: (p) =>
      p.config.interval_seconds != null
        ? [
            [Math.floor(p.config.interval_seconds / 3600), "小时"],
            [Math.floor(p.config.interval_seconds % 3600 / 60), "分钟"],
            [p.config.interval_seconds % 60, "秒"],
          ].filter(([value]) => value).map(([value, unit]) => `${value} ${unit}`).join(" ")
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
      (p.config.action === "auto_meme" ? " 张梗图" : p.config.action === "auto_post" ? " 条热点" : p.config.action === "auto_image" ? " 张原创图片" : p.config.action === "auto_video" ? " 条视频" : ["auto_reply", "reply_notifications"].includes(
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
  const seconds = (intervalHours.value ?? 0) * 3600 + (intervalMinutes.value ?? 0) * 60 + (intervalSeconds.value ?? 0);
  if (customInterval.value && (
    ![intervalHours.value, intervalMinutes.value, intervalSeconds.value].every(value => value === null || Number.isInteger(value) && value >= 0) ||
    (intervalMinutes.value ?? 0) > 59 || (intervalSeconds.value ?? 0) > 59 || seconds < 1 || seconds > 604800
  )) {
    error.value = "执行间隔应为1秒至7天，分和秒应为0–59的整数";
    return;
  }
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
        action.value === "reply_notifications"
            ? "notifications"
            : ["auto_reply","auto_image"].includes(action.value)
              ? "for_you"
              : scope.value,
      interval_minutes: customInterval.value ? Math.max(1, Math.ceil(seconds / 60)) : Number(interval.value),
      ...(customInterval.value ? {interval_seconds: seconds} : {}),
      limit: limit.value,
      after_days: days.value,
      stop_at: stop,
      language: ['auto_video','auto_image','auto_meme'].includes(action.value) ? 'en' : automatic.value ? language.value : "auto",
      ...(action.value==='auto_video' ? {source_urls:sourceUrls.value.split(/\s+/).filter(Boolean),publish_mode:publishMode.value} : {}),
      ...(action.value==='auto_post' ? {news_source:newsSource.value,query:newsQuery.value,allow_news_search:allowNewsSearch.value,include_source_link:includeSourceLink.value} : {}),
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
                  { value: 'follow_back', label: '自动回关' },
                  { value: 'unfollow', label: '一键取消关注' },
                  { value: 'auto_reply', label: '自动评论（For You）' },
                  { value: 'reply_notifications', label: '自动回复（通知）' },
                  { value: 'auto_video', label: '视频处理与发布（TikTok）' },
                  { value: 'auto_image', label: '搞笑图文（自动发布）' },
                  { value: 'auto_post', label: '吃瓜热点（微博 / 贴吧）' },
                  { value: 'auto_meme', label: '孙笑川吧梗图（自动发布）' },
                ]"
                @update:value="changeAction" /></NFormItem
            ><NAlert v-if="action === 'auto_meme'">选择搞笑梗图或成年人非露骨暧昧笑点，跳过原创作品展示和无关自拍。读取孙笑川吧帖子的文字摘要和正文图片，公开话题接口继续翻页取材，排除头像、图标和占位图，下载校验后先交给 AI 风控。政治人物、事件、符号、暗喻和存疑内容跳过。水印或署名本身不作为内容拒绝理由；通过后交给AI清理水印、署名叠层或界面，保留梗图正文与画面，将实际读到的中文摘要及图中文字译成英文配文，保留图片内原有文字；再次复核原图、成图和译文后发布。摘要不视作全文，不补写未读到的内容。每轮最多1张，按单张图片及其不同尺寸链接去重，同帖不同图片可分别发布。保留原图、成图与审核记录。需要本机已登录的 Codex CLI 和 FFmpeg，使用现有额度；同时启用TikTok计划时按轮次交替取材；无合格素材跳过。实际发送间隔受审核、清理和其他任务影响。本地运行需保持电脑唤醒及浏览器连接。</NAlert><NAlert v-else-if="action === 'auto_post'">从微博和贴吧公开热点发现选题，核实原帖及背景后生成配文并发布到 X。只发有来源的内容，不生成图片，不自动搬运原图或视频；私密爆料、无依据指控和无法核实的内容会跳过。来源不可用时显示失败原因，开启联网核实后可改查公开原帖。</NAlert><NAlert v-else-if="automatic"
              ><template v-if="action === 'auto_image'">轮换漫画人物找不同、搞笑场景和视觉错觉。找不同以4–6名虚构漫画人物、适量日常道具和完整生活场景为主，至少确认10处细节变化，人物和物件清楚可辨。停用满屏重复小图标和万元素阵列；难度来自衣服配饰、道具、动作与环境细节。复核会分区域放大确认答案，不合格或存疑时跳过；英文配文只出题，不透露位置。默认使用本机已登录的 Codex CLI 生图，无需额外 API Key；也可在「账号与模型 → AI 生图」选择图片 API。需要已登录的 Codex、1.5.31或更新的助手和 FFmpeg。CLI 生图消耗现有 Codex 额度，结果不明不自动重试；建议2分钟间隔，实际速度受生成、复核及其它任务影响。</template><template v-else-if="action === 'auto_video'">优先搞笑梗片段、混剪、反应合辑或成年人非露骨的暧昧笑点，避开真人原创口播、自拍日常、个人作品展示及明确原创声明。署名本身不证明原创；版权或授权归属不能由画面确认。直接读取配置的 TikTok 页面，每批最多下载5条未处理的视频，先统一审核敏感内容，只为通过的视频生成文案，下载前按页面文字和标签过滤中国人物及中国相关话题，不通过或存疑的视频不生成文案；合格视频按原间隔串行发布。同时启用孙笑川吧图片计划时按轮次交替，每批建议1条；没有合格素材就跳过。未成年人或年龄存疑的性暗示、露骨挑逗、偷拍或非自愿亲密内容排除。排除广告、中国相关、国家政治、血腥/严重暴力、色情和仇恨煽动内容，存疑时标为待检查。下载不可用的视频短时跳过1小时，继续选择其它候选；人物国籍不按外貌推断。保留原片和处理后文件，检查小面积水印、末尾品牌卡并生成带1–2个英文标签的配文。无法安全处理时停在待检查。可选审核后发布或合格后自动上传到X，只有明确回执才算成功，结果不明不自动重发。需要1.5.30或更新的助手和后端 FFmpeg。</template><template v-else-if="action === 'reply_notifications'"
                >打开小铃铛通知，只识别别人对当前账号帖子的回复，交给 Codex
                生成文字并回复对方。根据本机记录跳过已经处理的原帖，保留耗时、token
                与回执。新关注者回关请另建「自动回关」任务，目标范围选择「通知中的新关注者」。</template
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
            ><NFormItem v-if="action === 'auto_post'" label="热点来源"><NSelect v-model:value="newsSource" aria-label="热点来源" :options="[{value:'gossip',label:'微博＋贴吧'},{value:'weibo',label:'微博'},{value:'tieba',label:'贴吧'},{value:'rednote',label:'小红书'},{value:'hot_topics',label:'社交热榜'},{value:'international',label:'国际媒体'},{value:'mixed',label:'混合来源'},{value:'web',label:'公开检索'}]" /></NFormItem>
            <NFormItem v-if="action === 'auto_post'" label="选题要求"><NInput v-model:value="newsQuery" type="textarea" :autosize="{minRows:3,maxRows:8}" :maxlength="500" :input-props="{'aria-label':'选题要求',required:true}" /></NFormItem>
            <NSpace v-if="action === 'auto_post'"><NCheckbox v-model:checked="allowNewsSearch">联网核实公开原帖</NCheckbox><NCheckbox v-model:checked="includeSourceLink">正文附来源链接</NCheckbox></NSpace>
            <NFormItem v-if="action === 'auto_video'" label="TikTok 来源页面">
              <NInput v-model:value="sourceUrls" type="textarea" :autosize="{minRows:3,maxRows:8}" :input-props="{'aria-label':'TikTok 来源页面',required:true}" placeholder="填写推荐页、搜索页或作者主页；也可每行填写一条具体视频 URL" />
            </NFormItem><NFormItem v-if="action === 'auto_video'" label="视频发布方式"><NSelect v-model:value="publishMode" :options="[{value:'review',label:'审核后发布（默认）'},{value:'automatic',label:'处理和复核合格后自动发布到 X'}]" /></NFormItem><p v-if="action === 'auto_video'" class="business-muted">列表、搜索或作者主页只填一个页面；批量取材可填写最多20条具体视频 URL。根据已有记录去重，失败不会自动重新生成配文。</p><p v-if="action === 'follow_back' && scope === 'notifications'" class="business-muted">按执行间隔读取小铃铛中的新关注通知，打开对方主页确认仍关注你、且尚未回关后执行，跳过已关注或已处理账号。无需 Codex，不消耗 Token。需要 1.5.14 或更新的助手；点赞、转发和回复通知不会触发回关。</p><NFormItem v-if="automatic && !['auto_video','auto_image','auto_meme'].includes(action)" label="内容语言">
              <NSelect v-model:value="language" role="combobox" aria-label="内容语言" :menu-props="{ role: 'listbox' }" :node-props="option => ({ role: 'option', 'aria-label': String(option.label) })" :options="[{ value: 'auto', label: '跟随原帖' }, { value: 'en', label: '英文（不限制原帖语言）' }]" />
            </NFormItem><NFormItem v-if="!automatic && scope === 'manual'" label="目标账号"
              ><NInput
                v-model:value="targets"
                :input-props="{ required: true, 'aria-label': '目标账号' }"
                placeholder="账号之间用逗号分隔，不含 @" /></NFormItem
            ><NFormItem v-if="customInterval" label="执行间隔" :validation-status="error.startsWith('执行间隔') ? 'error' : undefined" :feedback="error.startsWith('执行间隔') ? error : undefined">
              <div class="w-full grid grid-cols-3 gap-12px" role="group" aria-label="执行间隔">
                <label>时<NInputNumber v-model:value="intervalHours" :min="0" :max="168" :precision="0" :input-props="{ 'aria-label': '执行间隔小时' }" /></label>
                <label>分<NInputNumber v-model:value="intervalMinutes" :min="0" :max="59" :precision="0" :input-props="{ 'aria-label': '执行间隔分钟' }" /></label>
                <label>秒<NInputNumber v-model:value="intervalSeconds" :min="0" :max="59" :precision="0" :input-props="{ 'aria-label': '执行间隔秒' }" /></label>
              </div>
            </NFormItem><p v-if="customInterval" class="business-muted">自定义执行间隔，合计1秒至7天；留空按0计算。</p><NFormItem v-else label="执行间隔"
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
            ><NFormItem :label="action === 'auto_image' ? '每轮生成图片' : '每次最多'"
              ><NInputNumber
                v-model:value="limit"
                :min="1"
                :max="['auto_post','auto_meme'].includes(action) ? 1 : ['auto_video','auto_image'].includes(action) ? 5 : 20"
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

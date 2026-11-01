<script setup lang="ts">
import { computed, ref, onMounted, onScopeDispose, watch } from "vue";
import { NConfigProvider, darkTheme, zhCN, dateZhCN } from "naive-ui";
import type {
  AnalyticsSnapshot,
  CreatorSummary,
  Client,
  Metric,
  Job,
} from "@/shared/types";
import { loginLabels, time, safeResultUrl } from "./format";
import NumberValue from "./NumberValue.vue";
import CreatorStatus from "./CreatorStatus.vue";
import JobMetrics from "./JobMetrics.vue";
import JobProgress from "./JobProgress.vue";
declare const chrome: {
  tabs: { create: (input: { url: string }) => Promise<unknown> };
  runtime: {
    sendMessage: (
      message: object,
    ) => Promise<{ ok: boolean; data: unknown; error?: string }>;
  };
};
type BridgeStatus = {
  endpoint?: string;
  configured?: boolean;
  cdpAccount?: string;
  cdpWs?: string;
  cdpLoginState?: Client["login_state"];
  cdpError?: string;
  busy?: boolean;
};
type Overview = {
  account: string;
  source?: string;
  stale?: boolean;
  error?: string;
  creator?: CreatorSummary;
  analytics_periods?: Record<string, AnalyticsSnapshot>;
  postCount: number;
  lastCapture: number | null;
  metrics: Record<
    "followers" | "following" | "views" | "likes" | "replies" | "reposts",
    Metric | null
  >;
  job: Pick<Job, "state" | "error" | "updated_at"> | null;
};
const status = ref<BridgeStatus>({}),
  overview = ref<Overview | null>(null),
  busy = ref(false),
  loaded = ref(false),
  error = ref(""),
  refreshError = ref(""),
  message = ref("");
const videoBusy = ref(false), videoMessage = ref(""), videoError = ref("");
type VideoResult = {download_id?:string;filename?:string;caption_status:string;caption_text?:string;caption_reason?:string;caption_error?:string;caption_file?:string;caption_job?:Job;processing?:{filename?:string;verified?:boolean};publication?:Job;published?:boolean};
const videoResult=ref<VideoResult|null>(null);
const captionPending=computed(()=>!!videoResult.value&&["queued","generating"].includes(videoResult.value.caption_status)||!!videoResult.value?.publication&&["queued","running"].includes(videoResult.value.publication.state));
let videoPolling=false;
async function videoRequest(type:string,data?:object){
  const response=await chrome.runtime.sendMessage({type,data});
  if(!response.ok)throw Error(response.error||"视频配文操作失败");
  const value=response.data as VideoResult|null;videoResult.value=value;return value;
}
async function pollVideo(){
  if(videoPolling||!captionPending.value||!videoResult.value)return;
  videoPolling=true;
  try{await videoRequest("TIKTOK_STATUS",{download_id:videoResult.value.download_id});videoError.value="";}
  catch(error){videoError.value=error instanceof Error?error.message:String(error);}
  finally{videoPolling=false;}
}
async function retryCaption(){
  if(videoBusy.value||!videoResult.value)return;
  videoBusy.value=true;videoError.value="";
  try{await videoRequest("TIKTOK_RETRY",{download_id:videoResult.value.download_id});}
  catch(error){videoError.value=error instanceof Error?error.message:String(error);}
  finally{videoBusy.value=false;}
}
async function videoAction(type:string){
  if(videoBusy.value||!videoResult.value?.download_id)return;
  videoBusy.value=true;videoError.value="";
  try{await videoRequest(type,{download_id:videoResult.value.download_id});}
  catch(error){videoError.value=error instanceof Error?error.message:String(error);}
  finally{videoBusy.value=false;}
}
async function copyCaption(){
  try{await navigator.clipboard.writeText(videoResult.value?.caption_text||"");videoMessage.value="英文文案已复制";}
  catch{videoError.value="复制失败，请手动选中文案复制";}
}
async function downloadVideo() {
  if (videoBusy.value) return;
  videoBusy.value = true;
  videoMessage.value = "";
  videoError.value = "";
  videoResult.value = null;
  try {
    const result=await videoRequest("TIKTOK_DOWNLOAD");
    videoMessage.value = result?.caption_status==='rejected' ? '视频已自动过滤，未下载、未调用模型' : result?.caption_status==='unavailable' ? '视频暂不可下载，未调用模型' : '视频已保存，英文配文已排队';
  } catch (error) {
    videoError.value = error instanceof Error ? error.message : String(error);
  } finally {
    videoBusy.value = false;
  }
}
let polling = false,
  alive = true,
  timer: ReturnType<typeof setInterval>;
async function call<T>(action: string, data?: object): Promise<T> {
  const r = await chrome.runtime.sendMessage({ type: "CDP_" + action, data });
  if (!r.ok) throw Error(r.error || "操作失败");
  return r.data as T;
}
async function refresh() {
  if (polling) return;
  polling = true;
  try {
    const d = await call<BridgeStatus>("STATUS");
    if (!alive) return;
    status.value = d;
    loaded.value = true;
    if (d.cdpAccount && d.configured) {
      try {
        const s = await call<Overview>("OVERVIEW");
        if (alive) {
          overview.value = s;
          refreshError.value = "";
        }
      } catch (c) {
        if (alive) {
          overview.value =
            overview.value?.account === d.cdpAccount
              ? { ...overview.value, stale: true }
              : null;
          refreshError.value = c instanceof Error ? c.message : String(c);
        }
      }
    } else {
      overview.value = null;
      refreshError.value = "";
    }
  } catch (c) {
    if (alive) refreshError.value = String(c);
  } finally {
    polling = false;
  }
}
async function perform(action: string) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    await call(action, action === "CONNECT" ? { pickX: true } : undefined);
    message.value =
      action === "CONNECT"
        ? "已连接，首次采集已写入。"
        : action === "COLLECT"
          ? "运营数据采集已排队。"
          : "已断开，历史数据保留。";
    await refresh();
  } catch (c) {
    error.value = c instanceof Error ? c.message : String(c);
  } finally {
    busy.value = false;
  }
}
const connected = computed(() => status.value.cdpWs === "connected"),
  ready = computed(
    () => connected.value && status.value.cdpLoginState === "logged_in",
  ),
  working = computed(
    () =>
      busy.value ||
      !!status.value.busy ||
      (!!overview.value?.job &&
        ["queued", "rewriting", "running"].includes(overview.value.job.state)),
  ),
  summary = computed(() =>
    overview.value?.account === status.value.cdpAccount ? overview.value : null,
  ),
  stateLabel = computed(() =>
    overview.value?.stale
      ? "后台离线"
      : !connected.value
        ? "未连接"
        : ready.value
          ? "采集就绪"
          : loginLabels[status.value.cdpLoginState || "unknown"],
  );
watch(
  [
    () => status.value.cdpAccount,
    () => status.value.cdpWs,
    () => status.value.cdpLoginState,
  ],
  () => (message.value = ""),
);
const openWorkspace = (path = "") =>
  chrome.tabs.create({
    url: (status.value.endpoint || "http://127.0.0.1:18431") + "/" + path,
  });
onMounted(() => {
  void refresh();
  void videoRequest("TIKTOK_LAST").then(async()=>{
    if(videoResult.value?.download_id)await videoRequest("TIKTOK_STATUS",{download_id:videoResult.value.download_id});
  }).catch(()=>{});
  timer = setInterval(()=>{void refresh();void pollVideo();}, 5000);
});
onScopeDispose(() => {
  alive = false;
  clearInterval(timer);
});
const theme = {
  common: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    fontFamilyMono: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
  },
};
</script>
<template>
  <NConfigProvider
    :theme="darkTheme"
    :theme-overrides="theme"
    :locale="zhCN"
    :date-locale="dateZhCN"
    ><NGlobalStyle />
    <main
      class="bridge-shell business-stack p-16px"
      :aria-busy="working"
      data-ui-base="naive-ui"
    >
      <header class="business-toolbar">
        <strong class="onhold-brand text-28px mr-auto">OnHold</strong
        ><NTag size="small">永久免费</NTag
        ><NButton
          quaternary
          circle
          aria-label="打开工作台"
          @click="openWorkspace()"
          >↗</NButton
        ><NPopover trigger="click" placement="bottom-end"
          ><template #trigger
            ><NButton quaternary circle aria-label="插件设置"
              >⚙</NButton
            ></template
          ><NSpace vertical
            ><NButton text @click="openWorkspace('#/settings')">后台设置</NButton
            ><NButton
              v-if="connected"
              text
              :disabled="working"
              @click="perform('DISCONNECT')"
              >断开连接</NButton
            ></NSpace
          ></NPopover
        >
      </header>
      <NCard size="small"
        ><div class="business-stack">
          <NSpace align="center"
            ><NAvatar round>{{
              status.cdpAccount ? status.cdpAccount[0].toUpperCase() : "X"
            }}</NAvatar>
            <h1 class="text-18px">
              {{ status.cdpAccount ? "@" + status.cdpAccount : "连接运营后台" }}
            </h1>
            <NTag
              size="small"
              :type="ready ? 'success' : connected ? 'warning' : 'default'"
              >{{ stateLabel }}</NTag
            ></NSpace
          >
          <p class="business-muted">
            {{
              ready
                ? "每 5 分钟自动采集"
                : connected
                  ? "请回到 X 检查登录，再重新绑定"
                  : status.configured
                    ? "打开 X 后重新连接"
                    : "打开后台后自动完成配置"
            }}
          </p>
        </div></NCard
      ><NSkeleton v-if="!loaded && !refreshError" height="80px" />
      <section v-if="summary" class="business-stack" aria-label="已采集数据">
        <NGrid :cols="3" :x-gap="12" :y-gap="12"
          ><NGi
            v-for="[name, label] in [
              ['followers', '粉丝'],
              ['following', '关注'],
              ['views', '浏览量'],
              ['likes', '点赞'],
              ['replies', '评论'],
              ['reposts', '转发'],
            ] as const"
            :key="name"
            ><NStatistic :label="label"
              ><NumberValue
                :value="summary.metrics[name]?.value"
                :approximate="summary.metrics[name]?.approximate"
                compact /></NStatistic></NGi
        ></NGrid>
        <p class="business-muted">
          {{ summary.source || "已采集帖子" }} · {{ time(summary.lastCapture)
          }}{{ summary.stale ? " · 离线快照" : "" }}
        </p>
        <p v-if="summary.job && summary.job.state !== 'completed'">
          最近任务 ·
          {{
            {
              rewriting: "改写中",
              queued: "等待执行",
              running: "执行中",
              completed: "已完成",
              failed: "失败",
            }[summary.job.state]
          }}
        </p>
        <NAlert v-if="summary.job?.error" type="error">{{
          summary.job.error
        }}</NAlert>
      </section>
      <section v-if="summary" class="business-toolbar" aria-label="创作者资格">
        <span class="mr-auto">创作者进度</span
        ><CreatorStatus
          :key="summary.account"
          :summary="summary.creator"
          :analytics="summary.analytics_periods"
          icon-only
        />
      </section>
      <NButton
        v-if="ready"
        type="primary"
        block
        :disabled="working"
        @click="perform('COLLECT')"
        >{{ working ? "正在采集…" : "立即采集" }}</NButton
      ><NButton
        v-else
        type="primary"
        block
        :disabled="working || !loaded"
        @click="
          status.configured
            ? perform('CONNECT')
            : openWorkspace('#/connect')
        "
        >{{
          working
            ? "正在连接…"
            : connected
              ? "重新绑定 X 账号"
              : status.configured ? "连接 X 助手插件" : "打开后台并自动连接"
        }}</NButton
      ><NAlert v-if="error || refreshError || status.cdpError" type="error">{{
        error || refreshError || status.cdpError
      }}</NAlert
      ><NAlert v-if="message" type="success">{{ message }}</NAlert
      >
      <NCard size="small" title="TikTok 视频">
        <div class="business-stack">
          <p class="business-muted">打开具体视频页，后端下载、检查水印和片尾、生成带1–2个相关英文#标签的配文，并保留原片。</p>
          <NButton block :loading="videoBusy" :disabled="videoBusy || captionPending" @click="downloadVideo">下载视频并生成英文配文</NButton>
          <p class="business-muted">下载前按页面信息过滤中国人物或中国相关话题、广告、政治和血腥内容；配文前复核画面，存疑时不生成文案。人物国籍不按长相推断。无法安全处理的水印停在待检查；审核后可上传到X。</p>
          <NAlert v-if="videoError" type="error" role="alert">{{ videoError }}</NAlert>
          <p v-if="videoMessage" role="status">{{ videoMessage }}</p>
          <template v-if="videoResult">
            <p v-if="videoResult.filename" class="break-all" role="status">后端已保存：{{ videoResult.filename }}</p>
            <p v-if="['queued','generating'].includes(videoResult.caption_status)" role="status">{{videoResult.caption_status==='queued'?'视频配文已排队，等待模型':'Codex 正在检查画面并生成英文配文'}}</p>
            <template v-if="videoResult.caption_status==='ready'">
              <NInput type="textarea" readonly :value="videoResult.caption_text" :input-props="{'aria-label':'配套英文文案'}" :autosize="{minRows:3,maxRows:8}" />
              <NButton @click="copyCaption">复制英文文案</NButton>
              <p class="break-all">文案文件：{{videoResult.caption_file}}</p>
              <p v-if="videoResult.processing?.filename" class="break-all">处理后视频：{{videoResult.processing.filename}}</p>
              <NButton v-if="!videoResult.processing?.verified && !videoResult.publication" :disabled="videoBusy" @click="videoAction('TIKTOK_PREPARE')">检查水印并处理视频</NButton>
              <NButton v-if="videoResult.processing?.verified && !videoResult.publication" type="primary" :disabled="videoBusy" @click="videoAction('TIKTOK_PUBLISH')">已检查视频和文案，发布到 X</NButton>
              <template v-if="videoResult.publication">
                <JobProgress :job="videoResult.publication" />
                <NAlert v-if="videoResult.publication.error" type="error">{{videoResult.publication.error}}</NAlert>
                <a v-if="safeResultUrl(videoResult.publication.result?.url)" :href="videoResult.publication.result?.url || ''" target="_blank" rel="noreferrer">查看已发布视频</a>
              </template>
            </template>
            <NAlert v-else-if="['rejected','needs_review'].includes(videoResult.caption_status)" type="warning">{{videoResult.caption_status==='rejected'?'内容已排除':'需要人工检查'}}：{{videoResult.caption_reason}}</NAlert>
            <NAlert v-else-if="videoResult.caption_status==='unavailable'" type="warning">下载未完成：{{videoResult.caption_reason}}</NAlert>
            <template v-else-if="videoResult.caption_status==='failed'">
              <NAlert type="error">{{videoResult.caption_error}}，原视频已保留。</NAlert>
              <NButton :disabled="videoBusy" @click="retryCaption">重试配文（不重新下载）</NButton>
            </template>
            <JobMetrics v-if="videoResult.caption_job" :job="videoResult.caption_job" />
          </template>
        </div>
      </NCard>
    </main></NConfigProvider
  >
</template>

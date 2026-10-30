<script setup lang="ts">
import { computed, ref, watch, h } from "vue";
import { NCheckbox } from "naive-ui";
import { useRouter } from "vue-router";
import type { DataTableColumns } from "naive-ui";
import { api } from "@/shared/api";
import { useWorkspace } from "./workspace";
import { time } from "./format";
type Relation = {
  uid: string;
  handle: string;
  name: string;
  following: boolean | null;
  followed_by: boolean | null;
  updated_at: number;
};
type List = {
  account: string;
  items: Relation[];
  total: number;
  next_offset: number | null;
  runs: { kind: string; complete: boolean; updated_at: number }[];
  sync?: { state: string; error: string | null } | null;
};
const router=useRouter();
const w = useWorkspace(),
  data = ref<List | null>(null),
  filter = ref("following"),
  search = ref(""),
  offset = ref(0),
  selected = ref<string[]>([]),
  error = ref(""),
  message = ref(""),
  busy = ref(false);
let revision = 0;
const syncing = computed(
  () =>
    busy.value || ["queued", "running"].includes(data.value?.sync?.state || ""),
);
watch([() => w.selected, filter, search], () => {
  selected.value = [];
  offset.value = 0;
  data.value = null;
  message.value = "";
  error.value = "";
});
watch(
  [() => w.selected, filter, search, offset],
  (_, __, cleanup) => {
    let alive = true,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const id = ++revision;
      if (w.selected)
        try {
          const result = await api<List>("relationships", {
            account: w.selected,
            filter: filter.value,
            search: search.value,
            offset: offset.value,
          });
          if (alive && id === revision) {
            data.value = result;
            error.value = "";
          }
        } catch (c) {
          if (alive && id === revision) error.value = String(c);
        }
      if (alive) timer = setTimeout(poll, 5000);
    }
    timer = setTimeout(poll, 250);
    cleanup(() => {
      alive = false;
      revision++;
      clearTimeout(timer);
    });
  },
  { immediate: true },
);
async function sync(kind: string) {
  if (!w.selected || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await api("sync_relationships", { account: w.selected, kind });
    message.value = "名单同步已排队，每次最多读取 3 页；未完成时可继续同步。";
  } catch (c) {
    error.value = String(c);
  } finally {
    busy.value = false;
  }
}
async function createPlan(action: "follow_back" | "unfollow") {
  if(!w.selected || !selected.value.length) return;
  try {await router.push({path:"/automation",query:{action,targets:selected.value.join(","),account:w.selected}});}
  catch(c) {error.value=String(c);}
}
function toggle(handle: string, checked: boolean) {
  if (checked && selected.value.length >= 50) {
    error.value = "一次最多选择 50 个账号";
    return;
  }
  selected.value = checked
    ? [...new Set([...selected.value, handle])]
    : selected.value.filter((v) => v !== handle);
}
const columns: DataTableColumns<Relation> = [
  {
    title: "选择",
    key: "select",
    width: 60,
    render: (r) =>
      h(NCheckbox, {
        checked: selected.value.includes(r.handle),
        "aria-label": "选择 @" + r.handle,
        onUpdateChecked: (v: boolean) => toggle(r.handle, v),
      }),
  },
  {
    title: "账号",
    key: "handle",
    minWidth: 210,
    render: (r) =>
      h(
        "a",
        {
          href: "https://x.com/" + r.handle,
          target: "_blank",
          rel: "noreferrer",
        },
        r.name + " · @" + r.handle,
      ),
  },
  {
    title: "我已关注",
    key: "following",
    width: 120,
    render: (r) =>
      r.following === null ? "待确认" : r.following ? "已关注" : "未关注",
  },
  {
    title: "关注了我",
    key: "followed_by",
    width: 120,
    render: (r) =>
      r.followed_by === null ? "待确认" : r.followed_by ? "已关注" : "未关注",
  },
  {
    title: "同步时间",
    key: "updated_at",
    width: 180,
    render: (r) => time(r.updated_at),
  },
];
</script>
<template>
  <NCard title="关系名单"
    ><template #header-extra
      ><NSpace
        ><NButton
          v-for="[kind, label] in [
            ['following', '关注'],
            ['followers', '粉丝'],
          ]"
          :key="kind"
          size="small"
          :disabled="!w.selected || syncing"
          @click="sync(kind)"
          >{{
            data?.runs.some((r) => r.kind === kind && !r.complete)
              ? "继续同步"
              : "同步"
          }}{{ label }}</NButton
        ></NSpace
      ></template
    >
    <div class="business-stack">
      <div class="business-toolbar">
        <NTabs
          role="tablist"
          v-model:value="filter"
          type="segment"
          aria-label="关系名单类型"
          style="width: 380px; max-width: 100%"
          ><NTab
            role="tab"
            tabindex="0"
            @keydown.enter="($event.currentTarget as HTMLElement).click()"
            @keydown.space.prevent="
              ($event.currentTarget as HTMLElement).click()
            "
            :aria-selected="filter === key"
            v-for="[key, label] in [
              ['following', '已关注'],
              ['followers', '粉丝'],
              ['follow_back', '待回关'],
              ['not_following_back', '未回关'],
            ]"
            :key="key"
            :name="key"
            >{{ label }}</NTab
          ></NTabs
        ><NInput
          v-model:value="search"
          :input-props="{ type: 'search', 'aria-label': '搜索关系名单' }"
          placeholder="搜索账号或名称"
        />
      </div>
      <NAlert v-if="error || data?.sync?.state === 'failed'" type="error">{{
        error || data?.sync?.error || "名单同步失败，已保留进度，请继续同步。"
      }}</NAlert>
      <p v-if="message || syncing" role="status">
        {{
          syncing
            ? "名单同步中…"
            : data?.sync?.state === "completed"
              ? "本批同步已结束，剩余页面可继续同步。"
              : message
        }}
      </p>
      <p class="business-muted">
        待回关：对方关注你，你未关注对方。未回关：你关注对方，对方未关注你。未确认的关系不会算作“未关注”。
      </p>
      <p class="business-muted">
        {{
          data?.runs.length
            ? data.runs
                .map(
                  (r) =>
                    (r.kind === "following" ? "关注" : "粉丝") +
                    "：" +
                    (r.complete ? "同步完整" : "部分已同步") +
                    " · " +
                    time(r.updated_at),
                )
                .join("；")
            : "尚未同步关系名单。同步由已连接的浏览器执行。"
        }}
      </p>
      <NSpace
        ><NTag>已选 {{ selected.length }} 人</NTag
        ><NButton
          size="small"
          :disabled="!selected.length"
          @click="createPlan('follow_back')"
          >创建回关任务</NButton
        ><NButton
          size="small"
          :disabled="!selected.length"
          @click="createPlan('unfollow')"
          >创建取关任务</NButton
        ></NSpace
      ><NDataTable
        size="large"
        role="region"
        :columns="columns"
        :data="data?.items || []"
        :scroll-x="690"
        :row-key="(row: Relation) => row.uid"
        aria-label="账号关系名单"
        ><template #empty>{{
          !w.selected
            ? "请先选择账号"
            : !data && !error
              ? "读取中…"
              : "当前筛选下没有已同步的账号"
        }}</template></NDataTable
      ><NSpace align="center"
        ><span class="business-muted">{{
          data ? "已同步结果 " + data.total + " 人" : "正在读取名单"
        }}</span
        ><NButton
          size="small"
          :disabled="offset === 0"
          @click="
            selected = [];
            offset = Math.max(0, offset - 50);
          "
          >上一页</NButton
        ><NButton
          size="small"
          :disabled="data?.next_offset == null"
          @click="
            selected = [];
            offset = data!.next_offset!;
          "
          >下一页</NButton
        ></NSpace
      >
    </div></NCard
  >
</template>

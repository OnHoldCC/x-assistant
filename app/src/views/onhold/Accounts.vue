<script setup lang="ts">
import { computed, ref, h } from "vue";
import { NButton, NTag, NSpace } from "naive-ui";
import type { DataTableColumns } from "naive-ui";
import type { Account } from "@/shared/types";
import { useWorkspace } from "./workspace";
import { loginLabels, time } from "./format";
const w = useWorkspace(),
  search = ref("");
const rows = computed(
  () =>
    w.data?.accounts.filter((a) =>
      a.handle.toLowerCase().includes(search.value.toLowerCase()),
    ) || [],
);
const client = (handle: string) =>
  w.clients.find((c) => c.account === handle && c.online) ||
  w.clients.find((c) => c.account === handle);
const columns: DataTableColumns<Account> = [
  {
    title: "账号",
    key: "handle",
    minWidth: 170,
    render: (a) =>
      h(
        NButton,
        { text: true, onClick: () => w.choose(a.handle) },
        () => "@" + a.handle,
      ),
  },
  {
    title: "采集方式",
    key: "transport",
    minWidth: 140,
    render: (a) =>
      h(
        NTag,
        {
          size: "small",
          type: client(a.handle)?.online ? "success" : "default",
        },
        () =>
          client(a.handle)?.transport === "backend"
            ? "后台定时采集"
            : client(a.handle)?.online
              ? "浏览器已连接"
              : "未连接",
      ),
  },
  {
    title: "登录状态",
    key: "login",
    minWidth: 150,
    render: (a) =>
      client(a.handle)
        ? loginLabels[client(a.handle)!.login_state]
        : "等待连接",
  },
  {
    title: "最近采集",
    key: "last_seen",
    minWidth: 180,
    render: (a) => time(a.last_seen),
  },
  {
    title: "操作",
    key: "actions",
    minWidth: 220,
    render: (a) =>
      h(NSpace, {}, () => [
        h(
          NButton,
          {
            size: "small",
            disabled:
              w.busy ||
              !client(a.handle)?.online ||
              client(a.handle)?.login_state !== "logged_in",
            onClick: () => w.collect(a.handle),
          },
          () => "立即采集",
        ),
        client(a.handle)?.transport === "backend"
          ? h(
              NButton,
              {
                size: "small",
                quaternary: true,
                disabled: w.busy,
                onClick: () => w.disconnect(a.handle),
              },
              () => "断开采集",
            )
          : null,
      ]),
  },
];
</script>
<template>
  <div class="business-stack">
    <NCard title="已连接账号"
      ><template #header-extra
        ><NButton @click="w.settingsOpen = true">连接账号</NButton></template
      >
      <p class="business-muted mb-16px">
        {{ w.data?.accounts.length ?? 0 }} 个账号 · 数据按账号独立保存
      </p>
      <NInput
        v-model:value="search"
        :input-props="{ type: 'search', 'aria-label': '搜索账号' }"
        placeholder="搜索账号…"
        clearable
        class="mb-16px"
      /><NDataTable
        size="large"
        role="region"
        :columns="columns"
        :data="rows"
        :scroll-x="860"
        :row-key="(row: Account) => row.handle"
        aria-label="账号列表"
      /><NEmpty
        v-if="!w.data?.accounts.length"
        class="mt-16px"
        description="暂无账号"
        ><template #extra
          ><p>连接 X 助手以添加账号。</p>
          <NButton type="primary" @click="w.settingsOpen = true"
            >连接 X 助手插件</NButton
          ></template
        ></NEmpty
      ></NCard
    >
  </div>
</template>

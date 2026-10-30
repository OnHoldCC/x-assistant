<script setup lang="ts">
import { computed } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useWorkspace } from "./workspace";
import { loginLabels, time } from "./format";
import ModelSettings from "./ModelSettings.vue";
import LocalModels from "./LocalModels.vue";
import BrowserSettings from "./BrowserSettings.vue";
const w = useWorkspace(),
  client = computed(
    () =>
      w.clients.find((c) => c.account === w.selected && c.online) ||
      w.clients.find((c) => c.account === w.selected),
  );
async function install() {
  try {
    await invoke("open_extension_installation");
  } catch (c) {
    w.error = String(c);
  }
}
</script>
<template>
  <NDrawer
    v-model:show="w.settingsOpen"
    aria-label="账号与模型"
    :width="580"
    style="max-width: 100vw"
    ><NDrawerContent title="账号与模型" closable
      ><div class="business-stack">
        <p>连接状态与模型偏好</p>
        <NCard title="账号连接" size="small"
          ><div class="business-stack">
            <NSpace align="center"
              ><NAvatar round>{{
                w.selected?.[0]?.toUpperCase() || "X"
              }}</NAvatar
              ><strong>{{
                w.selected ? "@" + w.selected : "尚未绑定账号"
              }}</strong
              ><span>{{
                client ? loginLabels[client.login_state] : "连接助手后开始记录"
              }}</span></NSpace
            ><NDescriptions :column="1"
              ><NDescriptionsItem
                :label="
                  client?.transport === 'backend' ? '采集方式' : '浏览器连接'
                "
                ><NTag :type="client?.online ? 'success' : 'default'">{{
                  client?.transport === "backend"
                    ? "后台定时采集"
                    : client?.online
                      ? "长连接在线"
                      : "未连接"
                }}</NTag></NDescriptionsItem
              ><NDescriptionsItem label="自动采集">{{
                client?.online && client.login_state === "logged_in"
                  ? "每 5 分钟"
                  : "等待连接"
              }}</NDescriptionsItem
              ><NDescriptionsItem
                :label="
                  client?.transport === 'backend' ? '最近请求' : '最近心跳'
                "
                >{{ time(client?.last_seen) }}</NDescriptionsItem
              ></NDescriptions
            ><NAlert v-if="client?.error" type="error">{{
              client.error
            }}</NAlert
            ><NButton
              @click="
                w.settingsOpen = false;
                w.setupOpen = true;
              "
              >{{
                client?.online && client.login_state === "logged_in"
                  ? "管理连接"
                  : "连接 X 助手插件"
              }}</NButton
            >
          </div></NCard
        ><BrowserSettings v-if="!w.nativeMobile && !w.remote && !isTauri()" />
        <ModelSettings v-if="!w.nativeMobile && !w.remote" /><LocalModels
          v-if="!w.nativeMobile && !w.remote && !isTauri()"
        /><NCollapse v-if="!w.nativeMobile && !w.remote && isTauri()"
          ><NCollapseItem
            title="安装助手与诊断"
            ><NButton @click="install">安装或重载助手</NButton>
            <p>{{ w.pairing?.endpoint }}</p></NCollapseItem
          ></NCollapse></div></NDrawerContent
  ></NDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { connectExtension } from "@/shared/extension-connect";
import {
  extensionNeedsUpgrade,
  extensionVersion,
} from "@/shared/extension-version";
import { useWorkspace } from "./workspace";
const emit = defineEmits<{ complete: []; skip: [] }>(),
  w = useWorkspace(),
  step = ref(0),
  waiting = ref(false),
  message = ref("");
let finishing = false;
const connected = computed(() =>
  w.clients.find(
    (c) =>
      c.online &&
      c.transport === "websocket" &&
      c.login_state === "logged_in" &&
      !extensionNeedsUpgrade(c.extension_version),
  ),
);
watch(connected, (client) => {
  if (!client || finishing) return;
  finishing = true;
  waiting.value = false;
  emit("complete");
  const collecting = w.jobs.some(job => job.account === client.account && ["capture", "capture_analytics", "capture_creator"].includes(job.action) && ["queued", "running"].includes(job.state));
  if (!collecting) void w.collect(client.account, client.analytics_supported ? "capture_analytics" : "capture");
}, { immediate: true });
async function connect() {
  if (waiting.value) return;
  message.value = "";
  waiting.value = true;
  try {
    if (isTauri()) await invoke("open_browser_connection");
    else {
      await connectExtension();
      await w.load();
    }
  } catch (c) {
    message.value = String(c);
    waiting.value = false;
  }
}
async function install() {
  message.value = "";
  try {
    if (w.pairing?.extension)
      void navigator.clipboard.writeText(w.pairing.extension).catch(() => {});
    if (isTauri()) await invoke("open_extension_installation");
    else
      message.value =
        "在 Chrome 中打开 chrome://extensions，加载 extension 文件夹。";
  } catch (c) {
    message.value = String(c);
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(w.pairing?.extension || "");
    message.value = "目录已复制";
  } catch {
    message.value = "请选中目录手动复制";
  }
}
</script>
<template>
  <NCard
    :title="
      ['安装 X 助手', '连接你的 X 账号'][step]
    "
    ><div class="business-stack">
      <NSteps :current="step + 1" size="small" aria-label="连接步骤"
        ><NStep
          v-for="label in ['安装', '连接']"
          :key="label"
          :title="label" /></NSteps
      ><NAlert v-if="w.pairing?.error" type="error">{{
        w.pairing.error
      }}</NAlert
      ><template v-if="step === 0"
        ><NTag>{{ extensionVersion }}</NTag>
        <p>
          {{
            isTauri()
              ? "选择 browser-extension 文件夹。"
              : "选择安装目录中的 extension 文件夹。"
          }}
        </p>
        <NButton :disabled="!w.pairing" @click="install">{{
          isTauri() ? "打开扩展管理页" : "查看插件安装步骤"
        }}</NButton
        ><NSpace v-if="w.pairing?.extension"
          ><NInput
            :value="w.pairing.extension"
            readonly
            :input-props="{ 'aria-label': '插件目录' }"
          /><NButton aria-label="复制插件目录" @click="copy"
            >复制</NButton
          ></NSpace
        >
        <p>
          开启开发者模式，点击「加载已解压的扩展程序」，选中 browser-extension
          文件夹。
        </p></template
      ><template v-if="step === 1"
        ><p>在浏览器中登录 X，然后连接。</p>
        <NButton
          v-if="
            w.clients.some(
              (c) =>
                c.transport === 'websocket' &&
                c.online &&
                extensionNeedsUpgrade(c.extension_version),
            )
          "
          @click="step = 0"
          >更新助手至 {{ extensionVersion }}</NButton
        ><NButton aria-label="连接 X 助手插件" :loading="waiting" :disabled="waiting || !w.pairing || !!w.pairing.error" @click="connect"
          >连接 X 助手插件</NButton
        >
        <p v-if="waiting" role="status">等待浏览器连接…</p>
        <NAlert
          v-for="c in w.clients.filter((c) => c.error)"
          :key="c.id"
          type="error"
          >{{ c.error }}</NAlert
        ></template
      >
      <p v-if="message" role="status">{{ message }}</p>
    </div>
    <template #footer
      ><NSpace justify="space-between"
        ><template v-if="step === 0"
          ><NButton quaternary @click="emit('skip')">稍后设置</NButton
          ><NButton type="primary" @click="step = 1"
            >已安装，下一步</NButton
          ></template
        ><NButton
          v-else-if="step === 1"
          quaternary
          @click="
            step = 0;
            waiting = false;
          "
          >上一步</NButton
        ></NSpace
      ></template
    ></NCard
  >
</template>

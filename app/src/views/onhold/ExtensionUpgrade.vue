<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  extensionNeedsUpgrade,
  extensionVersion,
} from "@/shared/extension-version";
import { useWorkspace } from "./workspace";
import { connectExtension } from "@/shared/extension-connect";
const w = useWorkspace(),
  client = computed(
    () =>
      w.clients
        .filter((c) => c.transport === "websocket" && c.account === w.selected)
        .sort(
          (a, b) =>
            Number(b.online) - Number(a.online) || b.last_seen - a.last_seen,
        )[0],
  ),
  outdated = computed(
    () =>
      !!client.value && extensionNeedsUpgrade(client.value.extension_version),
  ),
  verified = computed(
    () =>
      !!client.value?.online &&
      !extensionNeedsUpgrade(client.value.extension_version),
  ),
  open = ref(false),
  step = ref(0),
  error = ref(""),
  waiting = ref(false);
const prompted = new Set<string>();
watch(
  [outdated, () => client.value?.id],
  () => {
    const key = client.value?.id + ":" + extensionVersion;
    if (outdated.value && !prompted.has(key)) {
      prompted.add(key);
      step.value = 0;
      open.value = true;
    }
  },
  { immediate: true },
);
watch([open, verified], (_, __, cleanup) => {
  if (!open.value) return;
  if (verified.value) {
    step.value = 2;
    waiting.value = false;
    return;
  }
  const timer = setInterval(() => void w.load(), 2000);
  cleanup(() => clearInterval(timer));
});
async function proceed() {
  if (waiting.value) return;
  error.value = "";
  try {
    if (step.value === 0) {
      if (isTauri()) await invoke("open_extension_installation");
      else await navigator.clipboard.writeText("chrome://extensions/");
      step.value = 1;
    } else {
      waiting.value = true;
      if (isTauri()) await invoke("open_browser_connection");
      else await connectExtension({ upgrade: true });
      await w.load();
    }
  } catch (c) {
    error.value = String(c);
    waiting.value = false;
  }
}
</script>
<template>
  <NButton
    v-if="outdated"
    size="small"
    @click="
      step = 0;
      open = true;
    "
    >更新助手</NButton
  ><NDrawer
    v-model:show="open"
    aria-label="更新 X 助手"
    :width="520"
    style="max-width: 100vw"
    ><NDrawerContent
      :title="['更新 X 助手', '重载现有助手', '助手已更新'][step]"
      closable
      ><div class="business-stack">
        <p>
          {{
            step === 2
              ? "原有配对与设置已保留"
              : (client?.extension_version || "旧版助手") +
                " → " +
                extensionVersion
          }}
        </p>
        <NSteps :current="step + 1" size="small" aria-label="插件升级步骤"
          ><NStep title="打开" /><NStep title="重载" /><NStep title="完成"
        /></NSteps>
        <p v-if="step === 0">
          {{
            isTauri()
              ? "打开扩展管理页，重载 X 助手。"
              : "请先确认本次部署已完成，新版插件会同步到安装根目录的 extension 文件夹。复制下方地址，在 Chrome 地址栏打开 chrome://extensions/，点击 X 助手的重新加载。"
          }}
        </p>
        <template v-if="step === 1"
          ><p>在 X 助手卡片点击“重新加载”，再检查连接。</p>
          <NCollapse
            ><NCollapseItem title="没有更新成功？"
              ><p>加载下方新版目录，再重新连接。</p>
              <NInput
                :input-props="{ 'aria-label': '新版插件目录' }"
                :value="w.pairing?.extension || '安装根目录/extension'"
                readonly /></NCollapseItem
          ></NCollapse>
          <p v-if="waiting" role="status">
            等待浏览器确认 {{ extensionVersion }}…
          </p></template
        >
        <p v-if="step === 2" role="status">
          {{ client?.extension_version }} · 已连接
        </p>
        <NAlert v-if="error" type="error">{{ error }}</NAlert
        ><NSpace
          ><NButton quaternary @click="open = false">{{
            step === 2 ? "关闭" : "稍后"
          }}</NButton
          ><NButton v-if="step < 2" type="primary" :loading="waiting" :disabled="waiting" @click="proceed">{{
            step === 0
              ? isTauri()
                ? "打开扩展页"
                : "复制扩展管理地址"
              : "检查更新并连接"
          }}</NButton></NSpace
        >
      </div></NDrawerContent
    ></NDrawer
  >
</template>

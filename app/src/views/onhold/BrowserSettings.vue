<script setup lang="ts">
import { ref, watch } from "vue";
import { browserPreferences } from "@/shared/extension-connect";
import { useWorkspace } from "./workspace";
const w = useWorkspace(),
  hideAds = ref(false),
  loaded = ref(false),
  busy = ref(false),
  error = ref(""),
  message = ref("");
async function load() {
  busy.value = true;
  loaded.value = false;
  error.value = "";
  message.value = "";
  try {
    hideAds.value = (await browserPreferences()).hideAds;
    loaded.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
async function save(value: boolean) {
  if (busy.value || !loaded.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    hideAds.value = (await browserPreferences(value)).hideAds;
    message.value = "已保存，当前浏览器的 X 页面立即生效。";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
watch(() => w.settingsOpen, open => { if (open) void load(); }, { immediate: true });
</script>
<template>
  <NCard title="浏览器设置" size="small">
    <div class="business-stack">
      <div class="business-toolbar">
        <span class="mr-auto">机器翻译</span><NTag size="small">已停用</NTag>
      </div>
      <p class="business-muted">阅读和发帖均不调用翻译模型。英文内容由任务模型直接生成。</p>
      <div class="business-toolbar">
        <span class="mr-auto">隐藏 X 广告帖</span>
        <NSwitch :value="hideAds" :loading="busy" :disabled="!loaded || busy"
          aria-label="隐藏 X 广告帖" @update:value="save" />
      </div>
      <p class="business-muted">仅对当前安装助手的浏览器生效；关闭后恢复广告帖展示。</p>
      <NAlert v-if="error" type="warning">{{ error }}</NAlert>
      <NButton v-if="error" :loading="busy" @click="load">重新检测助手</NButton>
      <p v-if="message" role="status">{{ message }}</p>
    </div>
  </NCard>
</template>

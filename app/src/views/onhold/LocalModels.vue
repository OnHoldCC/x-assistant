<script setup lang="ts">
import { ref, onMounted } from "vue";
import { modelApi } from "@/shared/api";
const status = ref<{
    translation: { enabled: boolean; ready: boolean };
  } | null>(null),
  message = ref(""),
  error = ref("");
async function refresh() {
  try {
    status.value = await modelApi("local_models");
    error.value = "";
  } catch (c) {
    error.value = String(c);
  }
}
async function copy() {
  const request = "请使用 OnHold Skill 安装并验证翻译模型。";
  try {
    await navigator.clipboard.writeText(request);
    message.value =
      "已复制，请发给 OnHold 安装 Skill；它会展示下载进度并验证模型。";
  } catch {
    message.value = request;
  }
}
onMounted(refresh);
</script>
<template>
  <NCard title="可选本地模型" size="small"
    ><template #header-extra
      ><NButton size="small" @click="refresh">刷新状态</NButton></template
    >
    <div class="business-stack">
      <p>按需安装，后台不会自动下载权重。</p>
      <NSpace align="center"
        ><strong>Hy-MT2 翻译</strong><NTag>1.91 GB</NTag
        ><NTag>{{
          status
            ? status.translation.ready
              ? "已就绪"
              : status.translation.enabled
                ? "已选择，尚未就绪"
                : "未启用"
            : "检查中…"
        }}</NTag></NSpace
      >
      <p>阅读与发帖输入框的一键翻译</p>
      <NButton size="small" @click="copy">复制安装指令</NButton
      ><NAlert v-if="message">{{ message }}</NAlert
      ><NAlert v-if="error" type="error">{{ error }}</NAlert>
    </div></NCard
  >
</template>

<script setup lang="ts">
import { ref } from "vue";
import { connectRemote } from "@/shared/api";
defineProps<{ mobile?: boolean }>();
const emit = defineEmits<{ change: [] }>();
const saved = localStorage.getItem("onhold-remote");
let initial = "";
try {
  initial = JSON.parse(saved || "{}").endpoint || "";
} catch {}
const endpoint = ref(initial),
  token = ref(""),
  busy = ref(false),
  error = ref("");
async function connect() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await connectRemote(endpoint.value.trim(), token.value.trim());
    token.value = "";
    emit("change");
  } catch (c) {
    error.value = c instanceof Error ? c.message : String(c);
  } finally {
    busy.value = false;
  }
}
function local() {
  localStorage.removeItem("onhold-remote");
  token.value = "";
  emit("change");
}
</script>
<template>
  <NCard title="连接工作空间"
    ><p>
      {{
        mobile
          ? "连接已有的 HTTPS 后台，查看数据与管理采集任务。"
          : "连接已部署的 HTTPS 后台。"
      }}
    </p>
    <NForm class="business-form" @submit.prevent="connect"
      ><NFormItem label="HTTPS 后台地址"
        ><NInput
          v-model:value="endpoint"
          :input-props="{
            'aria-label': 'HTTPS 后台地址',
            id: 'remote-endpoint',
            type: 'url',
            required: true,
          }"
          placeholder="https://your-backend.example" /></NFormItem
      ><NFormItem label="配对密钥"
        ><NInput
          v-model:value="token"
          type="password"
          :input-props="{
            'aria-label': '配对密钥',
            id: 'remote-token',
            required: true,
            autocomplete: 'off',
          }"
      /></NFormItem>
      <p v-if="mobile">X 助手安装在电脑浏览器上。手机与插件连接同一后台。</p>
      <NAlert v-if="error" type="error">{{ error }}</NAlert
      ><NSpace
        ><NButton attr-type="submit" type="primary" :loading="busy">{{
          busy ? "正在验证…" : saved ? "切换工作空间" : "连接后台"
        }}</NButton
        ><NButton v-if="saved && !mobile" :disabled="busy" @click="local"
          >使用本机数据</NButton
        ></NSpace
      ></NForm
    ></NCard
  >
</template>

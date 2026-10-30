<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { connectExtension } from "@/shared/extension-connect";
import { extensionVersion } from "@/shared/extension-version";
const upgrading = useRoute().query.upgrade === "1";
const message = ref("正在检测 X 助手插件…"),
  busy = ref(false),
  done = ref(false);
async function connect() {
  if (busy.value) return;
  busy.value = true;
  try {
    const response = await connectExtension({ upgrade: upgrading });
    message.value =
      "@" +
      response.account +
      (upgrading ? ` 助手 ${response.version || extensionVersion} 已加载并重新连接。` : " 已绑定，后台将每 5 分钟采集数据。");
    const cleanup = response.cleanup;
    if (typeof cleanup?.closed === "number") message.value += ` 已清理 ${cleanup.closed} 个空任务页，保留 ${cleanup.retained} 个待核对页面。`;
    else if (cleanup?.error) message.value += " 旧任务页清理未完成，页面已保留。";
    done.value = true;
  } catch (c) {
    message.value = c instanceof Error ? c.message : String(c);
  } finally {
    busy.value = false;
  }
}
onMounted(connect);
</script>
<template>
  <main class="setup-container">
    <NCard :title="done ? '工作空间已连接' : '连接 X 助手插件'"
      ><div class="business-stack">
        <strong class="onhold-brand text-28px">OnHold</strong>
        <p role="status">{{ message }}</p>
        <NButton v-if="!done" type="primary" :loading="busy" @click="connect">{{
          busy ? "连接中…" : "重新连接"
        }}</NButton
        ><NButton v-else type="primary" tag="a" href="#/overview"
          >查看运营后台</NButton
        >
      </div></NCard
    >
  </main>
</template>

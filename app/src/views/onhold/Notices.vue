<script setup lang="ts">
import { useWorkspace } from "./workspace";
const w = useWorkspace();
</script>
<template>
  <div
    v-if="w.error || w.notice || w.data?.automation_block"
    class="business-stack"
  >
    <NAlert v-if="w.error" type="error"
      >{{ w.error }}
      <NButton text :disabled="w.busy" @click="w.load(true)"
        >重试</NButton
      ></NAlert
    ><NAlert v-if="w.notice" type="success">{{ w.notice }}</NAlert
    ><NAlert v-if="w.data?.automation_block" type="warning"
      >自动化已停止：{{ w.data.automation_block.reason }}
      <RouterLink to="/automation">查看自动化任务配置</RouterLink></NAlert
    >
  </div>
</template>

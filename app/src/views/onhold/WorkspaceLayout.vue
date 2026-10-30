<script setup lang="ts">
import BaseLayout from "@/layouts/base-layout/index.vue";
import { useWorkspace } from "./workspace";
import ConnectionSetup from "./ConnectionSetup.vue";
import WorkspaceConnection from "./WorkspaceConnection.vue";
import Settings from "./Settings.vue";
const w = useWorkspace();
</script>
<template>
  <main
    v-if="!w.platformReady || (w.nativeMobile && !w.remote)"
    class="setup-container business-stack"
  >
    <WorkspaceConnection
      v-if="w.platformReady"
      mobile
      @change="w.workspaceChanged"
    />
    <p v-else role="status">正在打开工作空间…</p>
    <NAlert v-if="w.error" type="error"
      >{{ w.error }}<NButton text @click="w.bootstrap">重试</NButton></NAlert
    >
  </main>
  <main
    v-else-if="w.setupOpen && w.data && !w.remote && !w.nativeMobile"
    class="setup-container business-stack"
  >
    <ConnectionSetup @complete="w.finishSetup" @skip="w.finishSetup" /><NAlert
      v-if="w.error"
      type="error"
      >{{ w.error }}</NAlert
    >
  </main>
  <template v-else><BaseLayout /><Settings /></template>
</template>

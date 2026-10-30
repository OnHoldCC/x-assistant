<script setup lang="ts">
import { computed } from "vue";
import { useBreakpoints, breakpointsTailwind } from "@vueuse/core";
import { useWorkspace } from "./workspace";
import CreatorStatus from "./CreatorStatus.vue";
import ExtensionUpgrade from "./ExtensionUpgrade.vue";
const w = useWorkspace();
const compact = useBreakpoints(breakpointsTailwind).smaller("xl");
const options = computed(
  () =>
    w.data?.accounts.map((a) => ({ label: "@" + a.handle, value: a.handle })) ||
    [],
);
</script>
<template>
  <div class="business-toolbar flex-nowrap gap-8px">
    <NTag v-if="!compact" size="small">永久免费</NTag
    ><CreatorStatus
      :icon-only="compact"
      :summary="w.data?.creator"
      :analytics="w.data?.analytics_periods"
      @saved="w.load()"
    /><ExtensionUpgrade v-if="!w.nativeMobile && !w.remote" /><NSelect
      role="combobox"
      :menu-props="{ role: 'listbox' }"
      :node-props="
        (option: { label?: unknown }) => ({
          role: 'option',
          'aria-label': String(option.label),
        })
      "
      class="workspace-account"
      :style="{ width: compact ? '115px' : '160px' }"
      aria-label="当前账号"
      :value="w.selected"
      :options="options"
      :disabled="!options.length"
      placeholder="尚未连接账号"
      @update:value="w.choose"
    /><NButton
      quaternary
      circle
      :aria-label="
        w.ready && !w.loadFailed
          ? w.data?.automation_block
            ? '已连接，自动化受限，管理账号与模型'
            : '连接正常，管理账号与模型'
          : '未连接，管理账号与模型'
      "
      @click="w.settingsOpen = true"
      ><NBadge
        dot
        :type="
          w.ready && !w.loadFailed
            ? w.data?.automation_block
              ? 'warning'
              : 'success'
            : 'default'
        "
        ><SvgIcon icon="mdi:cog-outline" class="text-20px" /></NBadge
    ></NButton>
  </div>
</template>

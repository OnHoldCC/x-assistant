<script setup lang="ts">
defineProps<{
  value?: number | null;
  approximate?: boolean;
  compact?: boolean;
}>();
</script>
<template>
  <NSkeleton
    v-if="value == null"
    text
    :width="48"
    style="display: inline-block; vertical-align: middle"
    role="img"
    aria-label="数值未采集"
  /><span v-else class="business-number"
    >{{ approximate ? "≈" : ""
    }}{{
      value.toLocaleString(
        "zh-CN",
        compact ? { notation: "compact", maximumFractionDigits: 1 } : undefined,
      )
    }}</span
  >
</template>

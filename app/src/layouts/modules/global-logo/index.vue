<script setup lang="ts">
import { $t } from '@/locales';

defineOptions({
  name: 'GlobalLogo'
});

interface Props {
  /** Whether to show the title */
  showTitle?: boolean;
}

withDefaults(defineProps<Props>(), {
  showTitle: true
});
</script>

<template>
  <RouterLink to="/" class="w-full flex-center nowrap-hidden">
    <span class="onhold-brand text-24px font-bold">O</span>
    <h2 v-show="showTitle" class="pl-8px text-16px onhold-brand font-bold transition duration-300 ease-in-out">
      OnHold
    </h2>
  </RouterLink>
</template>

<style scoped></style>

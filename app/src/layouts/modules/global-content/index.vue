<script setup lang="ts">
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { LAYOUT_SCROLL_EL_ID } from '@sa/materials';
import { useAppStore } from '@/store/modules/app';
import { useRouteStore } from '@/store/modules/route';
import { useTabStore } from '@/store/modules/tab';

defineOptions({
  name: 'GlobalContent'
});

interface Props {
  /** Show padding for content */
  showPadding?: boolean;
}

withDefaults(defineProps<Props>(), {
  showPadding: true
});

const appStore = useAppStore();
const route = useRoute();
const routeStore = useRouteStore();
const tabStore = useTabStore();


function resetScroll() {
  const el = document.querySelector(`#${LAYOUT_SCROLL_EL_ID}`);

  el?.scrollTo({ left: 0, top: 0 });
}
watch(() => route.fullPath, resetScroll, { flush: 'post' });
</script>

<template>
  <RouterView v-slot="{ Component, route }">
      <KeepAlive :include="routeStore.cacheRoutes" :exclude="routeStore.excludeCacheRoutes">
        <component
          :is="Component"
          v-if="appStore.reloadFlag"
          :key="tabStore.getTabIdByRoute(route)"
          :class="{ 'p-16px sm:p-24px': showPadding }"
          class="workspace-page flex-grow bg-layout transition-300"
        />
      </KeepAlive>
  </RouterView>
</template>

<style></style>

<script setup lang="ts">
import { versions } from "./releases";
</script>
<template>
  <div class="business-stack">
    <NCard title="作者"
      ><div class="business-stack">
        <NSpace vertical
          ><NButton
            v-for="[label, url] in [
              ['X', 'https://x.com/OnHoldCC'],
              ['Telegram', 'https://t.me/On_Hold_CC'],
              ['GitHub', 'https://github.com/OnHoldCC/x-assistant'],
            ]"
            :key="label"
            text
            tag="a"
            :href="url"
            target="_blank"
            rel="noreferrer"
            :aria-label="label + ' ' + url"
            >{{ label }} · {{ url }}</NButton
          ></NSpace
        ><NCollapse aria-label="版本日志"
          ><NCollapseItem
            v-for="release in versions"
            :key="release.version"
            :title="'v' + release.version"
            :name="release.version"
            ><template #header-extra>{{ release.date }}</template>
            <ul class="list-disc pl-20px">
              <li v-for="item in release.items" :key="item">{{ item }}</li>
            </ul></NCollapseItem
          ></NCollapse
        >
      </div></NCard
    >
  </div>
</template>

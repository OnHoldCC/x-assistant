<script setup lang="ts">
import { ref } from "vue";
import { darkTheme, zhCN, dateZhCN } from "naive-ui";
const value = ref(""),
  checked = ref(false),
  selected = ref("overview"),
  drawer = ref(false),
  tab = ref("components");
</script>
<template>
  <NConfigProvider
    :theme="darkTheme"
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme-overrides="{
      common: {
        fontFamily:
          '-apple-system, BlinkMacSystemFont, &quot;Segoe UI&quot;, &quot;PingFang SC&quot;, &quot;Microsoft YaHei&quot;, sans-serif',
      },
    }"
    ><NGlobalStyle />
    <main class="business-stack p-24px">
      <h1 class="onhold-brand text-28px">OnHold · Soybean Admin / Naive UI</h1>
      <NTabs v-model:value="tab" type="line"
        ><NTabPane
          :tab-props="{ role: 'tab', tabindex: 0 }"
          name="components"
          tab="原生组件"
          ><div class="business-stack">
            <NCard title="按钮"
              ><NSpace
                ><NButton type="primary">主要操作</NButton
                ><NButton>次要操作</NButton
                ><NButton type="error">危险操作</NButton
                ><NButton disabled>禁用</NButton></NSpace
              ></NCard
            ><NCard title="表单"
              ><NForm
                ><NFormItem label="搜索"
                  ><NInput
                    v-model:value="value"
                    placeholder="搜索账号或内容"
                    :input-props="{ 'aria-label': '搜索' }" /></NFormItem
                ><NFormItem label="页面"
                  ><NSelect
                    role="combobox"
                    :menu-props="{ role: 'listbox' }"
                    :node-props="
                      (option: { label?: unknown }) => ({
                        role: 'option',
                        'aria-label': String(option.label),
                      })
                    "
                    v-model:value="selected"
                    :options="[
                      { label: '运营概览', value: 'overview' },
                      { label: '任务记录', value: 'tasks' },
                    ]" /></NFormItem
                ><NCheckbox v-model:checked="checked"
                  >保留选择</NCheckbox
                ></NForm
              ></NCard
            ><NCard title="反馈"
              ><NAlert type="success">操作已完成</NAlert
              ><NProgress type="line" :percentage="60" /><NButton
                @click="drawer = true"
                >打开抽屉</NButton
              ></NCard
            >
          </div></NTabPane
        ><NTabPane
          :tab-props="{ role: 'tab', tabindex: 0 }"
          name="framework"
          tab="框架来源"
          ><NCard title="Soybean Admin 2.3.0"
            ><p>
              直接使用原版 AdminLayout、导航、标签页、主题设置与 Naive UI 组件。
            </p>
            <NButton
              tag="a"
              href="https://github.com/soybeanjs/soybean-admin"
              target="_blank"
              rel="noreferrer"
              >查看源仓库</NButton
            ></NCard
          ></NTabPane
        ></NTabs
      ><NDrawer
        aria-label="原生抽屉"
        v-model:show="drawer"
        :width="420"
        style="max-width: 100vw"
        ><NDrawerContent title="原生抽屉" closable
          >Naive UI NDrawer</NDrawerContent
        ></NDrawer
      >
    </main></NConfigProvider
  >
</template>

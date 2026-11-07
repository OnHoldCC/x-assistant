<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { modelApi } from '@/shared/api';

type ImageConfig = { provider: 'codex_cli' | 'images_api'; endpoint: string; model: string; key_saved: boolean };
const config = ref<ImageConfig>({ provider: 'codex_cli', endpoint: 'https://api.openai.com/v1', model: 'gpt-image-2', key_saved: false });
const key = ref(''), busy = ref(false), error = ref(''), message = ref('');
onMounted(async () => {
  try { config.value = await modelApi<ImageConfig>('image_model_config'); }
  catch (cause) { error.value = String(cause); }
});
async function save() {
  if (busy.value) return;
  busy.value = true; error.value = ''; message.value = '';
  try {
    config.value = await modelApi<ImageConfig>('save_image_model_config', { config: config.value, apiKey: key.value || null });
    key.value = ''; message.value = '生图设置已保存；实际可用性将在首次生图时验证';
  } catch (cause) { error.value = String(cause); }
  finally { busy.value = false; }
}
</script>

<template>
  <NCard title="AI 生图" size="small">
    <div class="business-stack">
      <p>为搞笑图文自动化生成原创图片。文案和看图复核继续使用上方已登录的 Codex。</p>
      <NForm class="business-form" :disabled="busy" @submit.prevent="save">
        <NFormItem label="生图调用方式">
          <NSelect v-model:value="config.provider" role="combobox" aria-label="生图调用方式" :menu-props="{ role: 'listbox' }" :node-props="(option: { label?: unknown }) => ({ role: 'option', 'aria-label': String(option.label) })" :options="[{ value: 'codex_cli', label: '本机 Codex CLI（现有登录）' }, { value: 'images_api', label: 'OpenAI 兼容图片 API' }]" />
        </NFormItem>
        <p v-if="config.provider === 'codex_cli'">使用后台所在电脑已登录的 Codex CLI 原生生图，无需额外 API Key，消耗现有 Codex 额度。生图完成后再独立复核和配文。</p>
        <template v-else><NFormItem label="生图 API 地址">
          <NInput v-model:value="config.endpoint" :input-props="{ 'aria-label': '生图 API 地址', type: 'url', required: true }" />
        </NFormItem>
        <NFormItem label="生图模型">
          <NInput v-model:value="config.model" :input-props="{ 'aria-label': '生图模型', required: true }" />
        </NFormItem>
        <NFormItem label="生图 API Key">
          <NInput v-model:value="key" type="password" :placeholder="config.key_saved ? '已保存，留空保留' : '在此填写，不要发到聊天里'" :input-props="{ 'aria-label': '生图 API Key', autocomplete: 'off' }" />
        </NFormItem>
        </template><NButton attr-type="submit" type="primary" :loading="busy">保存生图设置</NButton>
      </NForm>
      <NAlert v-if="error" type="error">{{ error }}</NAlert>
      <NAlert v-if="message" type="success">{{ message }}</NAlert>
      <p class="business-muted">每次生成一张原创图片，生图及复核完成后才进入发布队列，账号串行执行。建议先用2分钟间隔，实际速度取决于生成耗时及其它任务。图片 API 使用独立额度，需支持 OpenAI Images API 和 JPEG base64 返回。保存设置不会生成图片或启用计划。</p>
    </div>
  </NCard>
</template>

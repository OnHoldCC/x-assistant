<script setup lang="ts">
import { ref, onMounted } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { modelApi } from "@/shared/api";
type ModelConfig = {
  provider: "codex_cli" | "responses_api";
  cli_path: string;
  model: string;
  endpoint: string;
  api_style: string;
  key_saved: boolean;
};
const config = ref<ModelConfig>({
    provider: "codex_cli",
    cli_path: "",
    model: "",
    endpoint: "https://api.openai.com/v1",
    api_style: "responses",
    key_saved: false,
  }),
  key = ref(""),
  busy = ref(false),
  error = ref(""),
  message = ref("");
onMounted(async () => {
  try {
    config.value = await modelApi<ModelConfig>("model_config");
  } catch (c) {
    error.value = String(c);
  }
});
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  try {
    config.value = await modelApi<ModelConfig>("save_model_config", {
      config: config.value,
      apiKey: key.value || null,
    });
    key.value = "";
    message.value = "模型设置已保存";
  } catch (c) {
    error.value = String(c);
  } finally {
    busy.value = false;
  }
}
async function inspect() {
  busy.value = true;
  error.value = "";
  try {
    message.value = (
      await modelApi<{ message: string }>("inspect_model", {
        config: config.value,
      })
    ).message;
  } catch (c) {
    error.value = String(c);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <NCard title="模型接入" size="small"
    ><div class="business-stack">
      <p>运营记忆保存在本地；复盘与已创建的改写任务使用此模型。</p>
      <NForm class="business-form" :disabled="busy" @submit.prevent="save"
        ><NFormItem label="调用方式"
          ><NSelect
            role="combobox"
            :menu-props="{ role: 'listbox' }"
            :node-props="
              (option: { label?: unknown }) => ({
                role: 'option',
                'aria-label': String(option.label),
              })
            "
            v-model:value="config.provider"
            aria-label="调用方式"
            :options="[
              {
                value: 'codex_cli',
                label: (isTauri() ? '本机' : '容器内') + ' Codex CLI',
              },
              { value: 'responses_api', label: '自带 API Key' },
            ]" /></NFormItem
        ><template v-if="config.provider === 'codex_cli'"
          ><NFormItem v-if="isTauri()" label="CLI 路径（留空自动查找）"
            ><NInput v-model:value="config.cli_path" placeholder="codex"
          /></NFormItem>
          <p v-else>
            Codex 是可选文章服务。请通过安装 Skill
            启用并完成账号登录，再点击「检查 CLI」。也可选择自带 API。
          </p></template
        ><template v-else
          ><NFormItem label="API 地址"
            ><NInput
              v-model:value="config.endpoint"
              :input-props="{
                'aria-label': 'API 地址',
                type: 'url',
                required: true,
              }" /></NFormItem
          ><NFormItem label="接口格式"
            ><NSelect
              role="combobox"
              :menu-props="{ role: 'listbox' }"
              :node-props="
                (option: { label?: unknown }) => ({
                  role: 'option',
                  'aria-label': String(option.label),
                })
              "
              v-model:value="config.api_style"
              aria-label="接口格式"
              :options="[
                { value: 'responses', label: 'Responses API' },
                { value: 'chat_completions', label: 'Chat Completions' },
              ]" /></NFormItem
          ><NFormItem label="API Key"
            ><NInput
              v-model:value="key"
              type="password"
              :input-props="{ autocomplete: 'off', 'aria-label': 'API Key' }"
              :placeholder="
                config.key_saved
                  ? '已保存，留空保留'
                  : isTauri()
                    ? '仅保存到本机系统凭据库'
                    : '保存到本机 Docker 私有数据卷'
              " /></NFormItem></template
        ><NFormItem
          :label="
            '模型名称' + (config.provider === 'codex_cli' ? '（可留空）' : '')
          "
          ><NInput
            v-model:value="config.model"
            :input-props="{
              required: config.provider === 'responses_api',
              'aria-label': '模型名称',
            }"
            :placeholder="
              config.provider === 'codex_cli'
                ? '使用 CLI 默认模型'
                : '填写服务方的模型 ID'
            " /></NFormItem
        ><NSpace
          ><NButton attr-type="submit" type="primary" :disabled="busy"
            >保存模型</NButton
          ><NButton
            v-if="config.provider === 'codex_cli'"
            :disabled="busy"
            @click="inspect"
            >检查 CLI</NButton
          ></NSpace
        ></NForm
      ><NAlert v-if="error" type="error">{{ error }}</NAlert
      ><NAlert v-if="message" type="success">{{ message }}</NAlert>
      <p class="business-muted">
        API 调用使用你自己的模型额度。Codex
        使用已登录账号，在独立只读环境执行，不继承自定义工具配置。
      </p>
    </div></NCard
  >
</template>

import {
  Button,
  Card,
  Input,
  Notice,
  SectionTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/onhold";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
export type ModelConfig = {
  provider: "codex_cli" | "responses_api";
  cli_path: string;
  model: string;
  endpoint: string;
  api_style: string;
  key_saved: boolean;
};
const defaults: ModelConfig = {
  provider: "codex_cli",
  cli_path: "",
  model: "",
  endpoint: "https://api.openai.com/v1",
  api_style: "responses",
  key_saved: false,
};
export function ModelSettings() {
  const [config, setConfig] = useState<ModelConfig>(defaults),
    [key, setKey] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    invoke<ModelConfig>("model_config")
      .then(setConfig)
      .catch((cause) => setError(String(cause)));
  }, []);
  const update = (name: keyof ModelConfig, value: string) =>
    setConfig((previous) => ({ ...previous, [name]: value }));
  return (
    <Card className="model-settings">
      <SectionTitle
        title="模型接入"
        description="运营记忆保存在本地；仅在你发送复盘时调用模型。"
      />
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setMessage("");
          try {
            const saved = await invoke<ModelConfig>("save_model_config", {
              config,
              apiKey: key || null,
            });
            setConfig(saved);
            setKey("");
            setMessage("模型设置已保存");
          } catch (cause) {
            setError(String(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          调用方式
          <Select
            value={config.provider}
            onValueChange={(value) => update("provider", value)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="codex_cli">本机 Codex CLI</SelectItem>
              <SelectItem value="responses_api">自带 API Key</SelectItem>
            </SelectContent>
          </Select>
        </label>
        {config.provider === "codex_cli" ? (
          <label>
            CLI 路径（留空自动查找）
            <Input
              value={config.cli_path}
              onChange={(event) => update("cli_path", event.target.value)}
              placeholder="codex"
            />
          </label>
        ) : (
          <>
            <label>
              API 地址
              <Input
                type="url"
                required
                value={config.endpoint}
                onChange={(event) => update("endpoint", event.target.value)}
              />
            </label>
            <label>
              接口格式
              <Select
                value={config.api_style}
                onValueChange={(value) => update("api_style", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="responses">Responses API</SelectItem>
                  <SelectItem value="chat_completions">
                    Chat Completions
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              API Key
              <Input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder={
                  config.key_saved
                    ? "已存入系统凭据库，留空保留"
                    : "仅保存到本机系统凭据库"
                }
              />
            </label>
          </>
        )}
        <label>
          模型名称{config.provider === "codex_cli" ? "（可留空）" : ""}
          <Input
            required={config.provider === "responses_api"}
            value={config.model}
            onChange={(event) => update("model", event.target.value)}
            placeholder={
              config.provider === "codex_cli"
                ? "使用 CLI 默认模型"
                : "填写服务方的模型 ID"
            }
          />
        </label>
        <div className="analytics-controls">
          <Button type="submit" disabled={busy}>
            保存模型
          </Button>
          {config.provider === "codex_cli" && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const value = await invoke<{ message: string }>(
                    "inspect_model",
                    { config },
                  );
                  setMessage(value.message);
                } catch (cause) {
                  setError(String(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              检查 CLI
            </Button>
          )}
        </div>
      </form>
      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <p className="muted">
        API 调用使用你自己的模型额度。Codex
        使用已登录账号，在独立只读环境执行，不继承自定义工具配置。
      </p>
    </Card>
  );
}

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
} from "@/components/onhold";
import type { Client } from "@/shared/types";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowRight, Check, Copy, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { extensionNeedsUpgrade, extensionVersion } from "@/shared/extension-version";
export type Pairing = {
  token: string;
  endpoint: string;
  extension?: string;
  error?: string;
  mobile?: boolean;
};
export function ConnectionSetup({
  pairing,
  clients,
  onComplete,
  onSkip,
}: {
  pairing: Pairing | null;
  clients: Client[];
  onComplete?: () => void;
  onSkip?: () => void;
}) {
  const [step, setStep] = useState(0),
    [waiting, setWaiting] = useState(false),
    [message, setMessage] = useState("");
  const connected = clients.find(
    (client) =>
      client.online &&
      client.transport === "websocket" &&
      client.login_state === "logged_in" &&
      !extensionNeedsUpgrade(client.extension_version),
  );
  useEffect(() => {
    setStep((current) => (connected ? 2 : current === 2 ? 1 : current));
    if (connected) setWaiting(false);
  }, [connected?.id, connected?.online, connected?.login_state, connected?.extension_version]);
  async function connect() {
    setMessage("");
    setWaiting(true);
    try {
      if (isTauri()) await invoke("open_browser_connection");
      else window.open(location.origin + "/#connect", "_blank", "noopener");
    } catch (error) {
      setMessage(String(error));
      setWaiting(false);
    }
  }
  async function install() {
    setMessage("");
    try {
      if (pairing?.extension)
        void navigator.clipboard.writeText(pairing.extension).catch(() => {});
      if (isTauri()) await invoke("open_extension_installation");
      else
        setMessage(
          "在 Chrome 中打开 chrome://extensions，加载 extension 文件夹。",
        );
    } catch (error) {
      setMessage(String(error));
    }
  }
  return (
    <Card className="connection-setup w-full max-w-lg">
      <CardHeader>
        <ol
          className="mb-6 flex items-center gap-3 text-sm text-muted-foreground"
          aria-label="连接步骤"
        >
          {["安装", "连接", "完成"].map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              className={step === index ? "font-medium text-foreground" : ""}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
        <CardTitle className="text-xl">
          {["安装 X 助手", "连接你的 X 账号", "连接成功"][step]}
        </CardTitle>
        {step === 0 && <Badge variant="secondary">{extensionVersion}</Badge>}
        <CardDescription>
          {
            [
              "选择 browser-extension 文件夹。",
              "在浏览器中登录 X，然后连接。",
              connected ? "@" + connected.account : "",
            ][step]
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pairing?.error && (
          <p role="alert" className="text-sm text-destructive">
            {pairing.error}
          </p>
        )}
        {step === 0 && (
          <>
            <Button onClick={install} disabled={!pairing}>
              打开扩展管理页
            </Button>
            {pairing?.extension && (
              <div className="flex gap-2">
                <Input
                  aria-label="插件目录"
                  value={pairing.extension}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="复制插件目录"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(pairing.extension!)
                      .then(() => setMessage("目录已复制"))
                      .catch(() => setMessage("请选中目录手动复制"))
                  }
                >
                  <Copy />
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              开启开发者模式，点击「加载已解压的扩展程序」，选中
              browser-extension 文件夹。
            </p>
          </>
        )}
        {step === 1 && (
          <>
            {clients.some(client => client.online && extensionNeedsUpgrade(client.extension_version)) && <Button variant="outline" onClick={() => setStep(0)}>更新助手至 {extensionVersion}</Button>}
            <Button onClick={connect} disabled={!pairing || !!pairing.error}>
              {waiting && <LoaderCircle className="animate-spin" />}连接 X
              助手插件
            </Button>
            {waiting && (
              <p role="status" className="text-sm text-muted-foreground">
                等待浏览器连接…
              </p>
            )}
            {clients
              .filter((client) => client.error)
              .map((client) => (
                <p key={client.id} className="text-sm text-destructive">
                  {client.error}
                </p>
              ))}
          </>
        )}
        {step === 2 && (
          <div className="flex items-center gap-2">
            <Check className="size-5" />
            <span>账号已绑定</span>
            <Badge variant="outline">每 5 分钟采集</Badge>
          </div>
        )}
        {message && (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2">
        {step === 0 ? (
          <>
            <Button variant="ghost" onClick={onSkip || (() => setStep(1))}>
              {onSkip ? "稍后设置" : "跳过安装"}
            </Button>
            <Button onClick={() => setStep(1)}>
              已安装，下一步
              <ArrowRight />
            </Button>
          </>
        ) : step === 1 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setStep(0);
              setWaiting(false);
            }}
          >
            <ArrowLeft />
            上一步
          </Button>
        ) : onComplete ? (
          <Button onClick={onComplete}>
            进入运营后台
            <ArrowRight />
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setStep(1)}>
            重新连接
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

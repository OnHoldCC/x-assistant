import { Brand, Button, Card } from "@/components/onhold";
import { api } from "@/shared/api";
import { extensionNeedsUpgrade, extensionVersion } from "@/shared/extension-version";
import { Check, Link2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
declare const chrome: {
  runtime?: {
    sendMessage: (
      id: string,
      message: object,
    ) => Promise<{
      ok: boolean;
      error?: string;
      data: { account: string };
      protocol?: number;
      version?: string;
    }>;
  };
};
export function BrowserConnect() {
  const [message, setMessage] = useState("正在检测 X 助手插件…"),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  async function connect() {
    setBusy(true);
    try {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage)
        throw Error("请先安装 X 助手插件。");
      const pairing = await api<{ token: string }>("pairing");
      let installed: string | undefined;
      for (const id of [
        "efnelpfiicmcfahpkoidcegnebndoiad",
        "hffgfbgnlpclaibfceoihghioflhecmj",
      ]) {
        try {
          const result = await chrome.runtime.sendMessage(id, {
            type: "ONHOLD_DISCOVER",
            data: { endpoint: location.origin },
          });
          if (result?.ok && result.protocol === 1) {
            if (extensionNeedsUpgrade(result.version)) throw Error(`助手 ${result.version || "版本未知"} 需更新到 ${extensionVersion}，请返回桌面端重载新版助手。`);
            installed = id;
            break;
          }
        } catch (error) { if (error instanceof Error && error.message.includes("需更新到")) throw error; }
      }
      if (!installed)
        throw Error("未检测到新版助手，请先在扩展管理页重载助手。");
      const response = await chrome.runtime.sendMessage(installed, {
        type: "ONHOLD_PAIR",
        data: { endpoint: location.origin, token: pairing.token },
      });
      if (!response?.ok) throw Error(response?.error || "插件连接未完成");
      setMessage("@" + response.data.account + " 已绑定，WebSocket 已连接。");
      setDone(true);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessage(
        /Receiving end does not exist|Could not establish connection/.test(text)
          ? "未找到 X 助手插件。请返回电脑端安装或重载最新版，再重试。"
          : text,
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    connect();
  }, []);
  return (
    <main className="browser-connect">
      <Brand />
      <Card className="pairing-result">
        <span className={"pairing-icon " + (done ? "success" : "")}>
          {done ? <Check /> : <Link2 />}
        </span>
        <h1>{done ? "工作空间已连接" : "连接 X 助手插件"}</h1>
        <p role="status">{message}</p>
        {!done ? (
          <Button disabled={busy} onClick={connect}>
            <RefreshCw className={busy ? "spin" : ""} />
            {busy ? "连接中…" : "重新连接"}
          </Button>
        ) : (
          <Button
            onClick={() => {
              location.hash = "overview";
              location.reload();
            }}
          >
            查看运营后台
          </Button>
        )}
      </Card>
    </main>
  );
}

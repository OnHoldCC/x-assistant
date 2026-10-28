import { Badge, Button, Input, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/onhold";
import type { Client } from "@/shared/types";
import { extensionNeedsUpgrade, extensionVersion } from "@/shared/extension-version";
import type { Pairing } from "./ConnectionSetup";
import { invoke } from "@tauri-apps/api/core";
import { Check, Download, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ExtensionUpgrade({ clients, account, pairing, refresh }: {
  clients: Client[]; account: string | null; pairing: Pairing | null; refresh: () => Promise<void>;
}) {
  const client = clients.filter(item => item.transport === "websocket" && item.account === account).sort((a,b) => Number(b.online)-Number(a.online) || b.last_seen-a.last_seen)[0];
  const outdated = !!client && extensionNeedsUpgrade(client.extension_version);
  const verified = !!client?.online && !extensionNeedsUpgrade(client.extension_version);
  const [open, setOpen] = useState(false), [step, setStep] = useState(0), [error, setError] = useState(""), [waiting, setWaiting] = useState(false);
  const prompted = useRef(new Set<string>());
  useEffect(() => {
    const key = client?.id + ":" + extensionVersion;
    if (outdated && !prompted.current.has(key)) { prompted.current.add(key); setStep(0); setOpen(true); }
  }, [outdated, client?.id]);
  useEffect(() => {
    if (!open) return;
    if (verified) { setStep(2); setWaiting(false); return; }
    const timer = setInterval(() => { void refresh(); }, 2000);
    return () => clearInterval(timer);
  }, [open, verified, refresh]);
  async function proceed() {
    setError("");
    try {
      if (step === 0) { await invoke("open_extension_installation"); setStep(1); }
      else { await invoke("open_browser_connection"); setWaiting(true); await refresh(); }
    } catch (cause) { setError(String(cause)); setWaiting(false); }
  }
  return <>
    {outdated && <Button variant="outline" size="sm" onClick={() => { setStep(0); setOpen(true); }}><Download aria-hidden="true" />更新助手</Button>}
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="extension-upgrade-sheet">
        <SheetHeader>
          <SheetTitle>{["更新 X 助手", "重载现有助手", "助手已更新"][step]}</SheetTitle>
          <SheetDescription>{step === 2 ? "原有配对与设置已保留" : (client?.extension_version || "旧版助手") + " → " + extensionVersion}</SheetDescription>
        </SheetHeader>
        <div className="extension-upgrade-body">
          <ol className="upgrade-steps" aria-label="插件升级步骤">{["打开", "重载", "完成"].map((label,index)=><li key={label} aria-current={step===index?"step":undefined}>{index+1}. {label}</li>)}</ol>
          {step === 0 && <p>打开扩展管理页，重载 X 助手。</p>}
          {step === 1 && <>
            <p>在 X 助手卡片点击“重新加载”，再检查连接。</p>
            <details><summary>没有更新成功？</summary>
              <p>加载下方新版目录，再重新连接。</p>
              <Input aria-label="新版插件目录" value={pairing?.extension || ""} readOnly onFocus={event=>event.currentTarget.select()} />
              <Button variant="outline" onClick={() => invoke("open_extension_installation").catch(cause=>setError(String(cause)))}>打开新版目录</Button>
            </details>
            {waiting && <p role="status"><LoaderCircle className="spin size-4" aria-hidden="true" />等待浏览器确认 {extensionVersion}…</p>}
          </>}
          {step === 2 && <p role="status" className="upgrade-success"><Check aria-hidden="true" />{client?.extension_version}<Badge variant="secondary">已连接</Badge></p>}
          {error && <p role="alert">{error}</p>}
          <div className="upgrade-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>{step===2?"关闭":"稍后"}</Button>
            {step < 2 && <Button onClick={proceed}>{step===0?"打开扩展页":"检查更新并连接"}</Button>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </>;
}

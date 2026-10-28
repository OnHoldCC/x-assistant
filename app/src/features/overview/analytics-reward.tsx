import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/onhold";
import { api } from "@/shared/api";
import { analyticsRewardEstimate, creatorOutlook } from "@/shared/metrics";
import type { AnalyticsSnapshot, CreatorSummary } from "@/shared/types";
import { useState } from "react";

export function AnalyticsReward({ summary, snapshots = {}, onSaved }: {
  summary?: CreatorSummary | null;
  snapshots?: Record<string, AnalyticsSnapshot>;
  onSaved?: () => void;
}) {
  const [period, setPeriod] = useState("7d"), [payout, setPayout] = useState(""), [currency, setCurrency] = useState("USD");
  const [start, setStart] = useState(""), [end, setEnd] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const available = Object.entries(snapshots).filter(([, snapshot]) => snapshot.data.series?.length);
  const current = snapshots[period] || available[0]?.[1];
  const history = [...available].sort((a,b) => b[1].data.series!.length-a[1].data.series!.length)[0]?.[1];
  const estimate = analyticsRewardEstimate(current, summary);
  const calibration = summary?.calibration;
  const manual = creatorOutlook(summary?.snapshot?.data, summary?.assumptions);
  const manualAmount = !calibration && summary?.assumptions ? manual.amount : null;
  const amount = manualAmount ?? estimate.amount;
  const moneyCurrency = manualAmount != null ? "CNY" : estimate.currency;
  return <div className="analytics-reward">
    <div className="reward-heading">
      <span>Analytics 收益参考</span>
      {!!available.length && <Select value={snapshots[period] ? period : available[0][0]} onValueChange={setPeriod}>
        <SelectTrigger aria-label="收益统计周期" className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>{available.map(([key,snapshot])=><SelectItem value={key} key={key}>{snapshot.data.period || key}</SelectItem>)}</SelectContent>
      </Select>}
    </div>
    <strong className="reward-amount">{amount == null ? calibration ? "暂无本期数据" : "待校准" : amount.toLocaleString("zh-CN", {style:"currency",currency:moneyCurrency})}</strong>
    <p className="muted">{manualAmount != null && !manual.blocked ? "手动合格曝光估算 · 非官方结算" : estimate.calibrated ? "历史结算校准 · 非官方结算" : amount === 0 ? "当前未达标，非历史到账金额" : "用一笔同周期结算校准，后续自动更新"}</p>
    {calibration && <p className="muted">{calibration.start_date} — {calibration.end_date} · {calibration.payout.toLocaleString("zh-CN",{style:"currency",currency:calibration.currency})} / {calibration.impressions.toLocaleString("zh-CN")} 次曝光</p>}
    <details className="reward-calibration">
      <summary>{calibration ? "重新校准" : "校准历史收益"}</summary>
      {!history ? <p className="muted">先采集官方逐日数据。</p> : <form onSubmit={async event=>{
        event.preventDefault();if(!summary?.account)return;setBusy(true);setError("");
        try { await api("save_earnings_calibration", {account:summary.account,observed_at:history.observed_at,payout:Number(payout),currency,start_date:start,end_date:end,confirmed});onSaved?.(); }
        catch(cause){setError(String(cause));}finally{setBusy(false);}
      }}>
        <label>结算金额<Input type="number" min="0" max="1000000000" step="any" required value={payout} onChange={event=>setPayout(event.target.value)} /></label>
        <label>币种<Select value={currency} onValueChange={setCurrency}><SelectTrigger aria-label="结算币种"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="CNY">CNY</SelectItem></SelectContent></Select></label>
        <label>统计开始<Input type="date" required min={history.data.series![0].date} max={history.data.series!.at(-1)!.date} value={start} onChange={event=>{setStart(event.target.value);setConfirmed(false);}} /></label>
        <label>统计结束<Input type="date" required min={start || history.data.series![0].date} max={history.data.series!.at(-1)!.date} value={end} onChange={event=>{setEnd(event.target.value);setConfirmed(false);}} /></label>
        <label className="calibration-confirm"><input type="checkbox" required checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} />该金额对应上述统计时间段</label>
        <p className="muted">本期曝光 × 历史结算 ÷ 同期曝光。未公开的官方参数不做假设。</p>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !confirmed}>{busy?"保存中…":"保存校准"}</Button>
      </form>}
    </details>
  </div>;
}

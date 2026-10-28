import {
  Badge,
  Button,
  Card,
  Input,
  Notice,
  NumberValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/onhold";
import { api } from "@/shared/api";
import { creatorOutlook } from "@/shared/metrics";
import { time } from "@/shared/operations";
import type { AnalyticsSnapshot, CreatorSummary } from "@/shared/types";
import { AnalyticsReward } from "./analytics-reward";
import { useEffect, useState } from "react";

function creatorLabel(summary?: CreatorSummary | null) {
  const creator = summary?.snapshot?.data;
  if (!creator || (creator.state === "unknown" && !creator.verified_followers && !creator.verified_impressions)) return "尚未采集";
  return creator.state === "enrolled" ? "已开通" : creator.state === "eligible" ? "可申请" : creatorOutlook(creator, summary?.assumptions).blocked ? "未达标" : "待确认";
}

export function CreatorStatus({ summary, onSaved, iconOnly = false, analytics }: {
  summary?: CreatorSummary | null;
  onSaved?: () => void;
  iconOnly?: boolean;
  analytics?: Record<string, AnalyticsSnapshot>;
}) {
  const label = creatorLabel(summary);
  const creator = summary?.snapshot?.data;
  const outlook = creatorOutlook(creator, summary?.assumptions);
  const complete = creator?.state === "enrolled" || creator?.state === "eligible" || (outlook.progress === 100 && !outlook.blocked);
  const progress = complete ? 100 : outlook.progress;
  return (
    <Sheet>
      <TooltipProvider>
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button className={"creator-status creator-progress-trigger" + (iconOnly ? " compact" : "")} variant="ghost" size="sm" aria-label="查看创作者进度" data-complete={complete}>
                <span className="creator-progress-track" role="progressbar" aria-label="创作者资格总进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? undefined} aria-valuetext={progress == null ? "尚未采集" : progress.toFixed(1) + "%"}>
                  <span style={{ width: (progress ?? 0) + "%" }} />
                </span>
                <span className="creator-progress-percent">{progress == null ? "—" : progress.toLocaleString("zh-CN", { maximumFractionDigits: 1 }) + "%"}</span>
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end" sideOffset={8} className="creator-progress-tooltip">
            <strong>创作者进度 · {label}</strong>
            {([ ["verified_followers", "认证粉丝"], ["verified_impressions", "认证主页曝光"] ] as const).map(([key, name]) => {
              const item = creator?.[key];
              return <div className="creator-progress-detail" key={key} data-complete={!!item && item.current.value >= item.target}>
                <div><span>{name}</span><b>{item ? <><NumberValue value={item.current.value} approximate={item.current.approximate} /> / <NumberValue value={item.target} /></> : "尚未采集"}</b></div>
                <span className="creator-progress-track"><span style={{ width: item ? Math.min(100, item.current.value / item.target * 100) + "%" : "0%" }} /></span>
              </div>;
            })}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SheetContent className="creator-sheet">
        <SheetHeader>
          <SheetTitle>创作者中心</SheetTitle>
          <SheetDescription>{summary?.account ? "@" + summary.account + " · " : ""}资格与收益</SheetDescription>
        </SheetHeader>
        <CreatorPanel summary={summary} onSaved={onSaved} analytics={analytics} />
      </SheetContent>
    </Sheet>
  );
}

export function CreatorPanel({
  summary,
  compact = false,
  onSaved,
  analytics,
}: {
  summary?: CreatorSummary | null;
  compact?: boolean;
  onSaved?: () => void;
  analytics?: Record<string, AnalyticsSnapshot>;
}) {
  const creator = summary?.snapshot?.data,
    empty =
      !creator ||
      (creator.state === "unknown" &&
        !creator.verified_followers &&
        !creator.verified_impressions);
  const [qualified, setQualified] = useState(""),
    [rpm, setRpm] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setQualified(
      summary?.assumptions?.qualified30 == null
        ? ""
        : String(summary.assumptions.qualified30),
    );
    setRpm(
      summary?.assumptions?.rpmCny == null
        ? ""
        : String(summary.assumptions.rpmCny),
    );
    setError("");
  }, [summary?.account, summary?.assumptions?.observed_at]);
  const state = creatorLabel(summary);
  const content = empty ? (
    <>
    <div className="creator-heading">
      <h2>创作者进度</h2>
      <span className="muted">尚未采集</span>
    </div>
    {!!Object.keys(analytics || {}).length && <AnalyticsReward summary={summary} snapshots={analytics} onSaved={onSaved} />}
    </>
  ) : (
    <>
      <div className="creator-heading">
        <h2>创作者进度</h2>
        <Badge variant="secondary">{state}</Badge>
      </div>
      <div className="creator-progress-metrics">
        {(
          [
            ["verified_followers", "认证粉丝"],
            [
              "verified_impressions",
              creator?.verified_impressions
                ? "近 " + creator.verified_impressions.days + " 天认证主页曝光"
                : "认证主页曝光",
            ],
          ] as const
        ).filter(([key]) => creator?.[key]).map(([key, label]) => {
          const item = creator?.[key],
            ratio = item
              ? Math.min(100, (item.current.value / item.target) * 100)
              : null;
          return (
            <div key={key}>
              <div>
                <span>{label}</span>
                <b>
                  <NumberValue
                    value={item?.current.value}
                    approximate={item?.current.approximate}
                    compact
                  />{" "}
                  / <NumberValue value={item?.target} compact />
                </b>
              </div>
              {ratio != null && (
                <progress
                  aria-label={label + "进度"}
                  max={100}
                  value={ratio}
                />
              )}
              {!compact && item && (
                <small>
                  还差{" "}
                  <NumberValue
                    value={Math.max(0, item.target - item.current.value)}
                    approximate={item.current.approximate}
                    compact
                  />
                  {key === "verified_impressions" &&
                  creator?.verified_impressions?.exclude_replies
                    ? " · 不含回复"
                    : ""}
                </small>
              )}
            </div>
          );
        })}
      </div>
      <AnalyticsReward summary={summary} snapshots={analytics} onSaved={onSaved} />
      {!compact && (
        <>
          <p className="muted">
            {summary?.snapshot
              ? time(summary.snapshot.observed_at) + " · X 创作者中心"
              : "采集运营数据后更新"}{" "}
            ·{" "}
            <a
              href="https://help.x.com/en/using-x/original-content-rewards"
              target="_blank"
              rel="noreferrer"
            >
              资格口径
            </a>
          </p>
          <details className="earnings-assumptions">
            <summary>合格曝光手动估算</summary>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!summary?.account) return;
                setBusy(true);
                setError("");
                try {
                  await api("save_earnings", {
                    account: summary.account,
                    qualified30: Number(qualified),
                    rpmCny: Number(rpm),
                  });
                  onSaved?.();
                } catch (cause) {
                  setError(String(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                近30天合格曝光
                <Input
                  type="number"
                  min="0"
                  max="1000000000000000"
                  step="1"
                  required
                  value={qualified}
                  onChange={(event) => setQualified(event.target.value)}
                />
              </label>
              <label>
                历史每千次合格曝光收益（元）
                <Input
                  type="number"
                  min="0"
                  max="1000000"
                  step="any"
                  required
                  value={rpm}
                  onChange={(event) => setRpm(event.target.value)}
                />
              </label>
              <Button
                type="submit"
                size="sm"
                disabled={busy || !summary?.account}
              >
                {busy ? "保存中…" : "保存依据"}
              </Button>
            </form>
            <p className="muted">
              不使用总曝光或90天资格曝光替代近30天合格曝光。
            </p>
          </details>
          {error && <Notice tone="danger">{error}</Notice>}
        </>
      )}
    </>
  );
  return compact ? (
    <section
      className={"creator-panel compact" + (empty ? " creator-empty" : "")}
      aria-label="创作者进度与收益"
    >
      {content}
    </section>
  ) : (
    <Card className={"creator-panel" + (empty ? " creator-empty" : "")}>{content}</Card>
  );
}

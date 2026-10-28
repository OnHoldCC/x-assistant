import {
  Badge,
  Button,
  Card,
  Input,
  Notice,
  NumberValue,
} from "@/components/onhold";
import { api } from "@/shared/api";
import { creatorOutlook } from "@/shared/metrics";
import { time } from "@/shared/operations";
import type { CreatorSummary } from "@/shared/types";
import { useEffect, useState } from "react";
export function CreatorPanel({
  summary,
  compact = false,
  onSaved,
}: {
  summary?: CreatorSummary | null;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const creator = summary?.snapshot?.data,
    outlook = creatorOutlook(creator, summary?.assumptions),
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
  const state =
    creator?.state === "enrolled"
      ? "已开通"
      : creator?.state === "eligible"
        ? "可申请"
        : outlook.blocked
          ? "未达标"
          : "待确认";
  const content = empty ? (
    <div className="creator-heading">
      <h2>创作者进度</h2>
      <span className="muted">尚未采集</span>
    </div>
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
      <div className="creator-earnings">
        <span>30 天预估收益</span>
        <strong>
          {outlook.amount == null
            ? "暂无估算"
            : outlook.amount.toLocaleString("zh-CN", {
                style: "currency",
                currency: "CNY",
                maximumFractionDigits: 2,
              })}
        </strong>
        <small>
          {outlook.blocked
            ? "当前未达标，非历史到账金额"
            : outlook.amount == null
              ? "需填写合格曝光和历史结算单价"
              : "按手动依据计算的情景估算，非官方结算"}
        </small>
      </div>
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
            <summary>收益估算依据</summary>
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

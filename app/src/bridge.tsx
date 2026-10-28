import {
  Button,
  Input,
  Brand,
  StatusBadge,
  NumberValue,
  Notice,
  Skeleton,
} from "@/components/onhold";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Link2,
  Monitor,
  RefreshCw,
  Settings2,
  Unplug,
  ExternalLink,
} from "lucide-react";
import { FreeBadge } from "@/app/free-badge";
import { CreatorStatus } from "@/features/overview/creator-panel";
import type { AnalyticsSnapshot, CreatorSummary, Client, Metric, Job } from "@/shared/types";
import { loginLabels, time } from "@/shared/operations";
import "@/style.css";
import "@/bridge.css";
declare const chrome: {
  tabs: { create: (input: { url: string }) => Promise<unknown> };
  runtime: {
    sendMessage: (
      message: object,
    ) => Promise<{ ok: boolean; data: unknown; error?: string }>;
    getURL: (path: string) => string;
  };
  permissions: { request: (input: { origins: string[] }) => Promise<boolean> };
};
type BridgeStatus = {
  endpoint?: string;
  configured?: boolean;
  cdpAccount?: string;
  cdpWs?: string;
  cdpLoginState?: Client["login_state"];
  cdpError?: string;
  busy?: boolean;
};
type Overview = {
  account: string;
  source?: string;
  stale?: boolean;
  error?: string;
  creator?: CreatorSummary;
  analytics_periods?: Record<string, AnalyticsSnapshot>;
  postCount: number;
  lastCapture: number | null;
  metrics: Record<
    "followers" | "following" | "views" | "likes" | "replies" | "reposts",
    Metric | null
  >;
  job: Pick<Job, "state" | "error" | "updated_at"> | null;
};
async function call<T>(action: string, data?: object): Promise<T> {
  const result = await chrome.runtime.sendMessage({
    type: "CDP_" + action,
    data,
  });
  if (!result.ok) throw Error(result.error || "操作失败");
  return result.data as T;
}
function Popup() {
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:18431"),
    [token, setToken] = useState("");
  const [status, setStatus] = useState<BridgeStatus>({}),
    [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [refreshError, setRefreshError] = useState(""),
    [message, setMessage] = useState(""),
    [manualOpen, setManualOpen] = useState(false);
  const polling = useRef(false),
    mounted = useRef(true),
    savedEndpoint = useRef<string | undefined>(undefined);
  const refresh = async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const data = await call<BridgeStatus>("STATUS");
      if (!mounted.current) return;
      setStatus(data);
      setLoaded(true);
      if (data.endpoint && data.endpoint !== savedEndpoint.current) {
        setEndpoint(data.endpoint);
        savedEndpoint.current = data.endpoint;
      }
      if (data.cdpAccount && data.configured) {
        try {
          const summary = await call<Overview>("OVERVIEW");
          if (mounted.current) {
            setOverview(summary);
            setRefreshError("");
          }
        } catch (cause) {
          if (mounted.current) {
            setOverview((previous) =>
              previous && previous.account === data.cdpAccount
                ? { ...previous, stale: true }
                : null,
            );
            setRefreshError(
              cause instanceof Error ? cause.message : String(cause),
            );
          }
        }
      } else {
        setOverview(null);
        setRefreshError("");
      }
    } catch (cause) {
      if (mounted.current) {
        setRefreshError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      polling.current = false;
    }
  };
  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  async function perform(action: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "CONNECT" && token) {
        const url = new URL(endpoint);
        if (
          url.protocol !== "http:" ||
          !["localhost", "127.0.0.1"].includes(url.hostname) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash ||
          !/^[a-f0-9]{64}$/i.test(token)
        )
          throw Error("请填写本机后台地址和 64 位配对密钥");
        if (
          !(await chrome.permissions.request({ origins: [url.origin + "/*"] }))
        )
          throw Error("未允许连接本机后台");
        await call("SAVE", { endpoint: url.origin, token });
        setToken("");
      }
      await call(action, action === "CONNECT" ? { pickX: true } : undefined);
      setMessage(
        action === "CONNECT"
          ? "已连接，首次采集已写入。"
          : action === "COLLECT"
            ? "运营数据采集已排队。"
            : "已断开，历史数据保留。",
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  const connected = status.cdpWs === "connected",
    ready = connected && status.cdpLoginState === "logged_in",
    working =
      busy ||
      !!status.busy ||
      (!!overview?.job && ["queued", "running"].includes(overview.job.state));
  useEffect(
    () => setMessage(""),
    [status.cdpAccount, status.cdpWs, status.cdpLoginState],
  );
  const summary = overview?.account === status.cdpAccount ? overview : null;
  const stateLabel = overview?.stale
    ? "后台离线"
    : !connected
      ? "未连接"
      : ready
        ? "采集就绪"
        : loginLabels[status.cdpLoginState || "unknown"];
  const openWorkspace = () =>
    chrome.tabs.create({
      url: (status.endpoint || "http://127.0.0.1:18431") + "/",
    });
  return (
    <main
      className="bridge-shell"
      aria-busy={working}
      data-ui-library="onhold-ui"
      data-ui-base="shadcn/ui"
    >
      <header>
        <Brand />
        <FreeBadge />
        <CreatorStatus key={summary?.account} summary={summary?.creator} analytics={summary?.analytics_periods} iconOnly />
        <Button
          variant="ghost"
          size="icon"
          aria-label="打开工作台"
          title="打开工作台"
          onClick={openWorkspace}
        >
          <ExternalLink aria-hidden="true" />
        </Button>
        <details className="bridge-options">
          <summary aria-label="插件设置" title="插件设置">
            <Settings2 aria-hidden="true" />
          </summary>
          <div>
            <Button
              variant="ghost"
              onClick={() => setManualOpen((value) => !value)}
            >
              手动配对
            </Button>
            <Button variant="ghost" asChild>
              <a
                href={chrome.runtime.getURL("settings.html")}
                target="_blank"
                rel="noreferrer"
              >
                翻译与广告设置
              </a>
            </Button>
            {connected && (
              <Button
                variant="ghost"
                disabled={working}
                onClick={() => perform("DISCONNECT")}
              >
                断开连接
              </Button>
            )}
          </div>
        </details>
      </header>
      <section className="bridge-account">
        <span className="account-avatar">
          {status.cdpAccount ? (
            status.cdpAccount[0].toUpperCase()
          ) : (
            <Monitor aria-hidden="true" />
          )}
        </span>
        <div>
          <h1>
            {status.cdpAccount ? "@" + status.cdpAccount : "连接运营后台"}
          </h1>
          <p>
            {ready
              ? "每 5 分钟自动采集"
              : connected
                ? "请回到 X 检查登录，再重新绑定"
                : status.configured
                  ? "打开 X 后重新连接"
                  : "先打开工作台，完成配对"}
          </p>
        </div>
        <StatusBadge tone={ready ? "success" : connected ? "warning" : "neutral"}>
          {stateLabel}
        </StatusBadge>
      </section>
      {!loaded && !refreshError && <Skeleton className="h-20 w-full" />}
      {summary && (
        <section className="bridge-summary" aria-label="已采集数据">
          <dl className="bridge-metrics">
            {(
              [
                ["followers", "粉丝"],
                ["following", "关注"],
                ["views", "浏览量"],
                ["likes", "点赞"],
                ["replies", "评论"],
                ["reposts", "转发"],
              ] as const
            ).map(([name, label]) => (
              <div key={name}>
                <dt>{label}</dt>
                <dd
                  title={
                    summary.metrics[name]?.value == null
                      ? undefined
                      : (summary.metrics[name]?.approximate ? "≈" : "") +
                        summary.metrics[name]?.value?.toLocaleString("zh-CN")
                  }
                >
                  <NumberValue
                    compact
                    value={summary.metrics[name]?.value}
                    approximate={summary.metrics[name]?.approximate}
                  />
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            {summary.source || "已采集帖子"} · {time(summary.lastCapture)}
            {summary.stale ? " · 离线快照" : ""}
          </p>
          {summary.job && summary.job.state !== "completed" && (
            <p className="muted">
              最近任务 ·{" "}
              {
                {
                  queued: "等待执行",
                  running: "执行中",
                  completed: "已完成",
                  failed: "失败",
                }[summary.job.state]
              }
            </p>
          )}
          {summary.job?.error && (
            <Notice tone="danger">{summary.job.error}</Notice>
          )}
        </section>
      )}
      {!manualOpen &&
        (ready ? (
          <Button
            className="bridge-connect"
            disabled={working}
            onClick={() => perform("COLLECT")}
          >
            <RefreshCw className={working ? "spin" : ""} aria-hidden="true" />
            {working ? "正在采集…" : "立即采集"}
          </Button>
        ) : (
          <Button
            className="bridge-connect"
            disabled={working || !loaded}
            onClick={() =>
              status.configured || token
                ? perform("CONNECT")
                : chrome.tabs.create({ url: "http://127.0.0.1:18431/#connect" })
            }
          >
            <Link2 aria-hidden="true" />
            {working
              ? "正在连接…"
              : connected
                ? "重新绑定 X 账号"
                : "连接 X 助手插件"}
            <ArrowRight aria-hidden="true" />
          </Button>
        ))}
      {(error || refreshError || status.cdpError) && (
        <Notice tone="danger">
          {error || refreshError || status.cdpError}
        </Notice>
      )}
      {message && <Notice tone="success">{message}</Notice>}
      <footer hidden={!manualOpen}>
        <section
          id="bridge-manual"
          className="bridge-manual"
          hidden={!manualOpen}
          aria-label="手动配对"
        >
          <label htmlFor="backend">后台地址</label>
          <Input
            id="backend"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
          />
          <label htmlFor="token">
            配对密钥{status.configured ? "（留空复用）" : ""}
          </label>
          <Input
            id="token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
          />
          <Button
            variant="outline"
            disabled={working || (!token && !status.configured)}
            onClick={() => perform("CONNECT")}
          >
            保存并连接
          </Button>
        </section>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Popup />);

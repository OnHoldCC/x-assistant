import { AppSidebar } from "@/app/app-sidebar";
import { SiteHeader } from "@/app/site-header";
import {
  Button,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SidebarInset,
  SidebarProvider,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/onhold";
import type { Pairing } from "@/features/connections/ConnectionSetup";
import { ConnectionSetup } from "@/features/connections/ConnectionSetup";
import { WorkspaceConnection } from "@/features/connections/WorkspaceConnection";
import { ModelSettings } from "@/features/settings/model-settings";
import { CreatorStatus } from "@/features/overview/creator-panel";
import { ExtensionUpgrade } from "@/features/connections/ExtensionUpgrade";
import { useIsMobile } from "@/hooks/use-mobile";
import { api } from "@/shared/api";
import { PostDetail, SessionCard } from "@/shared/operations";
import type { Client, Dashboard, Job, Post } from "@/shared/types";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  Bookmark,
  Contact,
  FileText,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  Terminal,
  Users,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const OverviewPage = lazy(() =>
  import("@/features/overview/OverviewPage").then((module) => ({
    default: module.OverviewPage,
  })),
);

const PostsPage = lazy(() =>
  import("@/features/posts/PostsPage").then((module) => ({
    default: module.PostsPage,
  })),
);

const AccountsPage = lazy(() =>
  import("@/features/accounts/AccountsPage").then((module) => ({
    default: module.AccountsPage,
  })),
);

const JobsPage = lazy(() =>
  import("@/features/jobs/JobsPage").then((module) => ({
    default: module.JobsPage,
  })),
);

const AutomationManager = lazy(() =>
  import("@/features/automation/automation-manager").then((module) => ({
    default: module.AutomationManager,
  })),
);

const SystemLog = lazy(() =>
  import("@/features/logs/system-log").then((module) => ({
    default: module.SystemLog,
  })),
);

const AuthorPage = lazy(() =>
  import("@/features/about/author-page").then((module) => ({
    default: module.AuthorPage,
  })),
);

const BookmarkLibrary = lazy(() =>
  import("@/features/bookmarks/bookmark-library").then((module) => ({
    default: module.BookmarkLibrary,
  })),
);

const menu = [
  { id: "overview", label: "运营概览", icon: LayoutDashboard },
  { id: "posts", label: "内容复盘", icon: FileText },
  { id: "bookmarks", label: "我的收藏", icon: Bookmark },
  { id: "accounts", label: "账号管理", icon: Users },
  { id: "automation", label: "自动化", icon: ListChecks },
  { id: "logs", label: "系统日志", icon: Terminal },
  { id: "author", label: "作者", icon: Contact },
] as const;
type View = (typeof menu)[number]["id"] | "tasks";
const currentView = (): View =>
  location.hash === "#tasks"
    ? "tasks"
    : menu.find((item) => item.id === location.hash.slice(1))?.id || "overview";
export function App() {
  const [view, setView] = useState<View>(currentView),
    [days, setDays] = useState("7"),
    [account, setAccount] = useState("");
  const [data, setData] = useState<Dashboard | null>(null),
    [clients, setClients] = useState<Client[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [error, setError] = useState(""),
    [loadFailed, setLoadFailed] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(location.hash === "#settings"),
    [refreshing, setRefreshing] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [notice, setNotice] = useState("");
  const [overviewTab, setOverviewTab] = useState("official"),
    [detail, setDetail] = useState<Post | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null),
    [setupOpen, setSetupOpen] = useState(
      () => !localStorage.getItem("onhold-setup-complete"),
    );
  const mobile = useIsMobile();
  const [nativeMobile, setNativeMobile] = useState(false),
    [platformReady, setPlatformReady] = useState(!isTauri()),
    [remote, setRemote] = useState(!!localStorage.getItem("onhold-remote")),
    [workspaceRevision, setWorkspaceRevision] = useState(0);
  const bootstrap = useCallback(() => {
    if (!isTauri()) return;
    setError("");
    invoke<Pairing>("admin", { operation: "pairing", input: {} })
      .then((value) => {
        setNativeMobile(!!value.mobile);
        setPairing(value);
        setPlatformReady(true);
      })
      .catch((cause) => setError(String(cause)));
  }, []);
  useEffect(bootstrap, [bootstrap]);
  const requestId = useRef(0),
    submittingRef = useRef(false);
  const busy = refreshing || submitting;
  const activeCapture = jobs.find(
    (job) =>
      job.account === (account || data?.account) &&
      ["queued", "running"].includes(job.state),
  );
  useEffect(() => {
    const change = () => {
      if (location.hash === "#settings") setSettingsOpen(true);
      else setView(currentView());
      setNotice("");
      setDetail(null);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const load = useCallback(async () => {
    if (!platformReady || (nativeMobile && !remote)) return;
    const id = ++requestId.current;
    setRefreshing(true);
    try {
      const [dashboard, connections, tasks] = await Promise.all([
        api<Dashboard>("dashboard", { account, days: Number(days) }),
        api<Client[]>("connections"),
        api<Job[]>("jobs"),
      ]);
      if (id !== requestId.current) return;
      setLoadFailed(false);
      setData(dashboard);
      setClients(connections);
      setJobs(tasks);
      setError("");
    } catch (cause) {
      if (id === requestId.current) {
        setLoadFailed(true);
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [account, days, platformReady, nativeMobile, remote, workspaceRevision]);
  const latestLoad = useRef(load);
  latestLoad.current = load;
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) await load();
      if (alive)
        timer = setTimeout(poll, setupOpen || activeCapture ? 2000 : 10000);
    };
    poll();
    return () => {
      alive = false;
      requestId.current++;
      clearTimeout(timer);
    };
  }, [load, setupOpen, activeCapture?.id]);
  useEffect(() => {
    if (
      platformReady &&
      !nativeMobile &&
      !remote &&
      (settingsOpen || setupOpen)
    )
      api<Pairing>("pairing")
        .then(setPairing)
        .catch((cause) => setError(String(cause)));
  }, [settingsOpen, setupOpen, platformReady, nativeMobile, remote]);
  const captureClients = clients.filter(client => client.transport === "backend" || !clients.some(other => other.transport === "backend" && other.account === client.account));
  const selected = data?.account,
    posts = data?.posts || [],
    ready = captureClients.some(
      (client) =>
        client.account === selected &&
        client.online &&
        client.login_state === "logged_in",
    );
  const analyticsReady = captureClients.some(
    (client) =>
      client.account === selected &&
      client.online &&
      client.login_state === "logged_in" &&
      client.analytics_supported,
  );
  const collect = async (
    target = selected,
    action: Job["action"] = "capture",
  ) => {
    if (!target || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await api("enqueue", { account: target, action });
      setNotice("@" + target + " 采集已排队");
      await latestLoad.current();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const disconnect = async (target: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      await api("forget_x_session", { account: target });
      setNotice("@" + target + " 已断开采集，历史数据已保留");
      await latestLoad.current();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const choose = (value: string) => {
    requestId.current++;
    setAccount(value);
    setData(null);
    setDetail(null);
    location.hash = "overview";
  };
  const goConnect = () => {
    setSettingsOpen(true);
  };
  const active =
    view === "tasks"
      ? { ...menu[0], label: "采集记录" }
      : menu.find((item) => item.id === view) || menu[0];
  const workspaceChanged = () => {
    requestId.current++;
    setRemote(!!localStorage.getItem("onhold-remote"));
    setWorkspaceRevision((value) => value + 1);
    setAccount("");
    setData(null);
    setClients([]);
    setJobs([]);
    setDetail(null);
    setError("");
    setSetupOpen(false);
    setSettingsOpen(false);
    localStorage.setItem("onhold-setup-complete", "1");
    location.hash = "overview";
  };
  if (!platformReady || (nativeMobile && !remote))
    return (
      <main
        className="setup-page"
        data-ui-library="onhold-ui"
        data-ui-base="shadcn/ui"
      >
        {platformReady ? (
          <WorkspaceConnection mobile onChange={workspaceChanged} />
        ) : (
          <p role="status">正在打开工作空间…</p>
        )}
        {error && (
          <Notice tone="danger">
            {error}
            <Button variant="link" onClick={bootstrap}>
              重试
            </Button>
          </Notice>
        )}
      </main>
    );
  if (setupOpen && data && !remote && !nativeMobile)
    return (
      <main
        className="setup-page"
        data-ui-library="onhold-ui"
        data-ui-base="shadcn/ui"
      >
        <ConnectionSetup
          pairing={pairing}
          clients={clients}
          onComplete={() => {
            localStorage.setItem("onhold-setup-complete", "1");
            setSetupOpen(false);
            load();
          }}
          onSkip={() => setSetupOpen(false)}
        />
        {error && <Notice tone="danger">{error}</Notice>}
      </main>
    );
  return (
    <SidebarProvider data-ui-library="onhold-ui" data-ui-base="shadcn/ui">
      {!mobile && (
        <AppSidebar
          variant="inset"
          items={menu}
          active={view}
          account={selected}
          online={ready}
        />
      )}
      <SidebarInset>
        <SiteHeader title={active.label} mobileNavigation>
          {" "}
          <div className="top-actions">
            <CreatorStatus key={selected} summary={data?.creator} analytics={data?.analytics_periods} onSaved={load} />
            {isTauri() && !nativeMobile && !remote && <ExtensionUpgrade clients={clients} account={selected || null} pairing={pairing} refresh={load} />}
            <Select
              value={selected || "none"}
              onValueChange={choose}
              disabled={!data?.accounts.length}
            >
              <SelectTrigger aria-label="当前账号" className="account-select">
                <SelectValue placeholder="尚未连接账号" />
              </SelectTrigger>
              <SelectContent>
                {data?.accounts.length ? (
                  data.accounts.map((item) => (
                    <SelectItem key={item.handle} value={item.handle}>
                      @{item.handle}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="none">尚未连接账号</SelectItem>
                )}
              </SelectContent>
            </Select>
            <button
              type="button"
              className="connection-indicator"
              data-connected={ready && !loadFailed}
              data-restricted={!!data?.automation_block}
              aria-label={
                ready && !loadFailed
                  ? data?.automation_block
                    ? "已连接，自动化受限，管理账号与模型"
                    : "连接正常，管理账号与模型"
                  : "未连接，管理账号与模型"
              }
              title={
                ready && !loadFailed
                  ? data?.automation_block
                    ? "已连接 · " + data.automation_block.reason
                    : "连接正常 · 账号与模型"
                  : "未连接 · 账号与模型"
              }
              onClick={() => setSettingsOpen(true)}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </SiteHeader>
        <div className="app-content @container/main flex min-w-0 flex-1 flex-col gap-4 p-4 md:gap-6 lg:p-6">
          <Suspense fallback={<p role="status">正在加载页面…</p>}>
            {view === "automation" && <AutomationManager account={selected} />}
            {view === "logs" && <SystemLog />}
            {view === "author" && <AuthorPage />}
            {view === "bookmarks" && (
              <BookmarkLibrary account={selected} onSelect={setDetail} />
            )}
            {view === "overview" && (
              <div className="heading-actions">
                {view === "overview" && overviewTab === "observed" && (
                  <Tabs value={days} onValueChange={setDays}>
                    <TabsList aria-label="统计周期">
                      <TabsTrigger value="1">今日</TabsTrigger>
                      <TabsTrigger value="7">7 天</TabsTrigger>
                      <TabsTrigger value="30">30 天</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
                {view === "overview" && (
                  <Button
                    size="sm"
                    disabled={
                      !selected ||
                      !ready ||
                      busy ||
                      !!activeCapture ||
                      (overviewTab === "official" && !analyticsReady)
                    }
                    onClick={() =>
                      collect(
                        selected,
                        overviewTab === "official"
                          ? "capture_analytics"
                          : "capture",
                      )
                    }
                  >
                    <RefreshCw aria-hidden="true" />
                    {activeCapture
                      ? activeCapture.state === "queued"
                        ? "等待采集…"
                        : "采集中…"
                      : overviewTab === "official"
                        ? "采集运营数据"
                        : "立即采集"}
                  </Button>
                )}
              </div>
            )}
            {error && (
              <Notice tone="danger">
                {error}
                <Button variant="link" onClick={load} disabled={busy}>
                  重试
                </Button>
              </Notice>
            )}
            {notice && <Notice tone="success">{notice}</Notice>}
            {data?.automation_block && view !== "automation" && (
              <Notice tone="warning">
                自动化已停止：{data.automation_block.reason}
                <Button variant="link" asChild>
                  <a href="#automation">查看自动化</a>
                </Button>
              </Notice>
            )}
            {view === "overview" && (
              <OverviewPage
                data={data}
                overviewTab={overviewTab}
                setOverviewTab={setOverviewTab}
                ready={ready}
                analyticsReady={analyticsReady}
                goConnect={goConnect}
                setDetail={setDetail}
              />
            )}
            {view === "posts" && (
              <PostsPage
                posts={posts}
                selected={selected}
                setDetail={setDetail}
              />
            )}
            {view === "accounts" && (
              <AccountsPage
                data={data}
                clients={clients}
                busy={busy}
                goConnect={goConnect}
                choose={choose}
                collect={collect}
                disconnect={disconnect}
              />
            )}
            {view === "tasks" && (
              <JobsPage
                key={selected}
                jobs={jobs}
                selected={selected}
                ready={ready}
                analyticsReady={analyticsReady}
                busy={busy}
                collect={collect}
              />
            )}
          </Suspense>
        </div>
      </SidebarInset>
      {mobile && (
        <nav className="mobile-navigation" aria-label="主导航">
          {menu
            .filter((item) =>
              ["overview", "posts", "bookmarks", "automation", "logs"].includes(
                item.id,
              ),
            )
            .map((item) => (
              <a
                key={item.id}
                href={"#" + item.id}
                aria-label={item.label}
                aria-current={view === item.id ? "page" : undefined}
              >
                <item.icon aria-hidden="true" />
                <span>
                  {
                    (
                      {
                        overview: "概览",
                        posts: "复盘",
                        bookmarks: "收藏",
                        automation: "自动化",
                        logs: "日志",
                      } as Record<string, string>
                    )[item.id]
                  }
                </span>
              </a>
            ))}
        </nav>
      )}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="connection-sheet">
          <SheetHeader>
            <SheetTitle>账号与模型</SheetTitle>
            <SheetDescription>连接状态与模型偏好</SheetDescription>
          </SheetHeader>
          <div className="connection-sheet-body">
            <SessionCard
              clients={clients}
              account={selected}
              onConnect={() => {
                setSettingsOpen(false);
                setSetupOpen(true);
              }}
            />
            {!nativeMobile && !remote && isTauri() && <ModelSettings />}
            {!nativeMobile && !remote && isTauri() && (
              <details>
                <summary>安装助手与诊断</summary>
                <Button
                  variant="outline"
                  onClick={() =>
                    invoke("open_extension_installation").catch((cause) =>
                      setError(String(cause)),
                    )
                  }
                >
                  安装或重载助手
                </Button>
                <p className="muted">{pairing?.endpoint}</p>
              </details>
            )}
            <details>
              <summary>远程工作空间</summary>
              <WorkspaceConnection
                mobile={nativeMobile}
                onChange={workspaceChanged}
              />
            </details>
          </div>
        </SheetContent>
      </Sheet>
      <PostDetail post={detail} onClose={() => setDetail(null)} />
    </SidebarProvider>
  );
}

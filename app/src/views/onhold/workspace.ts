import { computed, ref, watch, onScopeDispose } from "vue";
import { defineStore } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { api } from "@/shared/api";
import type { Client, Dashboard, Job } from "@/shared/types";
export type Pairing = {
  token: string;
  endpoint: string;
  extension?: string;
  error?: string;
  mobile?: boolean;
};
export const useWorkspace = defineStore("onhold-workspace", () => {
  const route = useRoute(),
    router = useRouter();
  const account = ref(""),
    days = ref("7"),
    analyticsPeriod = ref("7d"),
    data = ref<Dashboard | null>(null),
    clients = ref<Client[]>([]),
    jobs = ref<Job[]>([]),
    error = ref(""),
    notice = ref(""),
    refreshing = ref(false),
    submitting = ref(false),
    loadFailed = ref(false),
    settingsOpen = ref(location.hash.includes("settings")),
    pairing = ref<Pairing | null>(null),
    setupOpen = ref(!localStorage.getItem("onhold-setup-complete")),
    nativeMobile = ref(false),
    platformReady = ref(!isTauri()),
    remote = ref(!!localStorage.getItem("onhold-remote")),
    workspaceRevision = ref(0);
  let requestId = 0,
    mutation = false;
  const selected = computed(() => data.value?.account);
  const captureClients = computed(() =>
    clients.value.filter(
      (c) =>
        c.transport === "backend" ||
        !clients.value.some(
          (other) =>
            other.transport === "backend" && other.account === c.account,
        ),
    ),
  );
  const ready = computed(() =>
    captureClients.value.some(
      (c) =>
        c.account === selected.value &&
        c.online &&
        c.login_state === "logged_in",
    ),
  );
  const analyticsReady = computed(() =>
    clients.value.some(
      (c) =>
        c.account === selected.value &&
        c.online &&
        c.login_state === "logged_in" &&
        c.analytics_supported,
    ),
  );
  const activeCapture = computed(() =>
    jobs.value.find(
      (j) =>
        j.account === (account.value || selected.value) &&
        ["capture", "capture_analytics", "capture_creator"].includes(
          j.action,
        ) &&
        ["queued", "running"].includes(j.state),
    ),
  );
  const busy = computed(() => refreshing.value || submitting.value);
  async function bootstrap() {
    error.value = "";
    try {
      pairing.value = await (isTauri()
        ? invoke<Pairing>("admin", { operation: "pairing", input: {} })
        : api<Pairing>("pairing"));
      nativeMobile.value = !!pairing.value.mobile;
      platformReady.value = true;
    } catch (cause) {
      error.value = String(cause);
    }
  }
  async function load(progress = false) {
    if (!platformReady.value || (nativeMobile.value && !remote.value)) return;
    const id = ++requestId;
    if (progress) refreshing.value = true;
    try {
      const [d, c, j] = await Promise.all([
        api<Dashboard>("dashboard", {
          account: account.value,
          days: Number(days.value),
        }),
        api<Client[]>("connections"),
        api<Job[]>("jobs"),
      ]);
      if (id !== requestId) return;
      data.value = d;
      clients.value = c;
      jobs.value = j;
      loadFailed.value = false;
      error.value = "";
    } catch (cause) {
      if (id === requestId) {
        error.value = cause instanceof Error ? cause.message : String(cause);
        loadFailed.value = true;
      }
    } finally {
      if (id === requestId) refreshing.value = false;
    }
  }
  async function collect(
    target = selected.value,
    action: Job["action"] = "capture",
  ) {
    if (!target || mutation) return;
    mutation = true;
    submitting.value = true;
    error.value = "";
    notice.value = "";
    try {
      await api("enqueue", { account: target, action });
      await load();
    } catch (cause) {
      error.value = String(cause);
    } finally {
      mutation = false;
      submitting.value = false;
    }
  }
  async function disconnect(target: string) {
    if (mutation) return;
    mutation = true;
    submitting.value = true;
    error.value = "";
    try {
      await api("forget_x_session", { account: target });
      notice.value = "@" + target + " 已断开采集，历史数据已保留";
      await load();
    } catch (cause) {
      error.value = String(cause);
    } finally {
      mutation = false;
      submitting.value = false;
    }
  }
  function choose(value: string) {
    requestId++;
    account.value = value;
    data.value = null;
    void router.push("/overview");
  }
  function finishSetup() {
    localStorage.setItem("onhold-setup-complete", "1");
    setupOpen.value = false;
    void load();
  }
  function workspaceChanged() {
    requestId++;
    remote.value = !!localStorage.getItem("onhold-remote");
    workspaceRevision.value++;
    account.value = "";
    data.value = null;
    clients.value = [];
    jobs.value = [];
    error.value = "";
    setupOpen.value = false;
    settingsOpen.value = false;
    localStorage.setItem("onhold-setup-complete", "1");
    void router.push("/overview");
  }
  watch(
    () => route.fullPath,
    () => {
      notice.value = "";
    },
  );
  watch(
    [
      account,
      days,
      platformReady,
      nativeMobile,
      remote,
      workspaceRevision,
      setupOpen,
      () => activeCapture.value?.id,
      () => route.name,
    ],
    (_, __, cleanup) => {
      let alive = true;
      let timer: ReturnType<typeof setTimeout>;
      async function poll() {
        if (!document.hidden) await load();
        if (alive)
          timer = setTimeout(
            poll,
            setupOpen.value || activeCapture.value || route.name === "tasks"
              ? 2000
              : 10000,
          );
      }
      void poll();
      cleanup(() => {
        alive = false;
        requestId++;
        clearTimeout(timer);
      });
    },
    { immediate: true },
  );
  watch([settingsOpen, setupOpen, platformReady], () => {
    if (
      platformReady.value &&
      !nativeMobile.value &&
      !remote.value &&
      (settingsOpen.value || setupOpen.value)
    )
      void api<Pairing>("pairing")
        .then((v) => (pairing.value = v))
        .catch((c) => (error.value = String(c)));
  });
  void bootstrap();
  onScopeDispose(() => requestId++);
  return {
    account,
    days,
    analyticsPeriod,
    data,
    clients,
    jobs,
    error,
    notice,
    refreshing,
    submitting,
    loadFailed,
    settingsOpen,
    pairing,
    setupOpen,
    nativeMobile,
    platformReady,
    remote,
    selected,
    ready,
    analyticsReady,
    activeCapture,
    busy,
    bootstrap,
    load,
    collect,
    disconnect,
    choose,
    finishSetup,
    workspaceChanged,
  };
});

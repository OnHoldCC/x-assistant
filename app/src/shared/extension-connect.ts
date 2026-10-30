import { api } from "./api";
import { extensionNeedsUpgrade, extensionVersion } from "./extension-version";

type Connection = {
  account: string;
  version?: string;
  cleanup?: { closed?: number; retained?: number; error?: string };
};
export type BrowserPreferences = { hideAds: boolean; translationEnabled: false };
declare const chrome: {
  runtime?: {
    sendMessage: (id: string, message: object) => Promise<{
      ok: boolean;
      error?: string;
      data: unknown;
      protocol?: number;
      version?: string;
      browserSettings?: boolean;
      reload?: boolean;
    }>;
  };
};

async function discoverExtension(settings = false, upgrading = false) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage)
      throw Error("请先安装 X 助手插件。");
    let installed: { id: string; version?: string; reload?: boolean } | undefined;
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
          if (!upgrading && extensionNeedsUpgrade(result.version))
            throw Error(`助手 ${result.version || "版本未知"} 需更新到 ${extensionVersion}，请在扩展管理页重载新版助手。`);
          if (settings && !result.browserSettings)
            throw Error("请在扩展管理页重载助手，启用后台浏览器设置。");
          installed = { id, version: result.version, reload: result.reload };
          break;
        }
      } catch (cause) {
        if (cause instanceof Error && /需更新到|启用后台浏览器设置/.test(cause.message)) throw cause;
      }
    }
    if (!installed) throw Error("未检测到新版助手，请先在扩展管理页重载助手。");
    return installed;
}

export async function browserPreferences(hideAds?: boolean): Promise<BrowserPreferences> {
  const installed = await discoverExtension(true);
  const pairing = await api<{ token: string }>("pairing");
  const response = await chrome.runtime!.sendMessage(installed.id, {
    type: "ONHOLD_BROWSER_SETTINGS",
    data: { endpoint: location.origin, token: pairing.token, ...(hideAds === undefined ? {} : { hideAds }) },
  });
  if (!response?.ok) throw Error(response?.error || "浏览器设置未完成");
  return response.data as BrowserPreferences;
}

export async function connectExtension({ upgrade = false } = {}): Promise<Connection> {
  try {
    const pairing = await api<{ token: string }>("pairing");
    const installed = await discoverExtension(false, upgrade);
    if (upgrade && extensionNeedsUpgrade(installed.version, extensionVersion)) {
      if (!installed.reload) throw Error("当前旧版助手不支持自动重载，请在 Chrome 扩展管理页重载一次，再重试更新连接。");
      const reloading = await chrome.runtime!.sendMessage(installed.id, {
        type: "ONHOLD_RELOAD",
        data: { endpoint: location.origin, token: pairing.token },
      });
      if (!reloading?.ok) throw Error(reloading?.error || "助手重载未完成");
      const deadline = Date.now() + 15000;
      let updated = false;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          const result = await chrome.runtime!.sendMessage(installed.id, { type: "ONHOLD_DISCOVER", data: { endpoint: location.origin } });
          if (result?.ok && result.protocol === 1 && !extensionNeedsUpgrade(result.version, extensionVersion)) { updated = true; break; }
        } catch { /* The service worker is unavailable briefly while reloading. */ }
      }
      if (!updated) throw Error(`重载后尚未检测到 ${extensionVersion}，请检查固定插件目录是否已更新；未宣告升级成功。`);
    }
    const response = await chrome.runtime!.sendMessage(installed.id, {
      type: "ONHOLD_PAIR",
      data: { endpoint: location.origin, token: pairing.token },
    });
    if (!response?.ok) throw Error(response?.error || "插件连接未完成");
    if (upgrade && extensionNeedsUpgrade(response.version, extensionVersion)) throw Error("插件运行版本尚未更新，请重试更新连接。");
    return { ...response.data as Connection, version: response.version };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw Error(/Receiving end does not exist|Could not establish connection/.test(message)
      ? "未找到 X 助手插件。请安装或重载最新版，再重试。"
      : message);
  }
}

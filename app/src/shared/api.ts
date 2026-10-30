import { invoke, isTauri } from "@tauri-apps/api/core";
export async function api<T>(
  operation: string,
  input: object = {},
  timeout = 15000,
): Promise<T> {
  const remote = localStorage.getItem("onhold-remote");
  if (remote) {
    const { endpoint, token } = JSON.parse(remote) as {
      endpoint: string;
      token: string;
    };
    if (isTauri())
      return invoke<T>("remote_admin", { endpoint, token, operation, input });
    throw Error("远程后台连接请使用安装后的应用");
  }
  if (isTauri()) return invoke<T>("admin", { operation, input });
  const token =
    document.querySelector<HTMLMetaElement>('meta[name="onhold-token"]')
      ?.content ||
    sessionStorage.getItem("onhold-token") ||
    "";
  const base = localStorage.getItem("onhold-endpoint") || "";
  const response = await fetch(base + "/api/admin", {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify({ operation, input }),
    signal: AbortSignal.timeout(timeout),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(value.error || `后台返回 HTTP ${response.status}`);
  return value as T;
}
export function modelApi<T>(operation: string, input: Record<string, unknown> = {}): Promise<T> {
  return isTauri() ? invoke<T>(operation, input) : api<T>(operation, input, 180000);
}
export async function connectRemote(endpoint: string, token: string) {
  const url = new URL(endpoint);
  if (
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname))
    ) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !/^[a-f0-9]{64}$/i.test(token)
  )
    throw Error("请填写 HTTPS 后台地址和 64 位配对密钥");
  if (!isTauri()) throw Error("远程连接请使用安装后的应用");
  await invoke("remote_admin", {
    endpoint: url.origin,
    token,
    operation: "dashboard",
    input: { days: 7 },
  });
  localStorage.setItem(
    "onhold-remote",
    JSON.stringify({ endpoint: url.origin, token }),
  );
}

import {
  Button,
  Card,
  CardContent,
  CardFooter,
  Input,
  Notice,
  SectionTitle,
} from "@/components/onhold";
import { connectRemote } from "@/shared/api";
import { useState } from "react";

export function WorkspaceConnection({
  mobile,
  onChange,
}: {
  mobile: boolean;
  onChange: () => void;
}) {
  const saved = localStorage.getItem("onhold-remote");
  const [endpoint, setEndpoint] = useState(() => {
    try {
      return JSON.parse(saved || "{}").endpoint || "";
    } catch {
      return "";
    }
  });
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Card className="workspace-connection">
      <SectionTitle
        title="连接工作空间"
        description={
          mobile
            ? "连接已有的 HTTPS 后台，查看数据与管理采集任务。"
            : "连接已部署的 HTTPS 后台。"
        }
      />
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await connectRemote(endpoint.trim(), token.trim());
            setToken("");
            onChange();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(false);
          }
        }}
        aria-busy={busy}
      >
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="remote-endpoint">HTTPS 后台地址</label>
            <Input
              id="remote-endpoint"
              type="url"
              required
              value={endpoint}
              placeholder="https://your-backend.example"
              onChange={(event) => setEndpoint(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="remote-token">配对密钥</label>
            <Input
              id="remote-token"
              type="password"
              required
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          {mobile && (
            <p className="muted">
              X 助手安装在电脑浏览器上。手机与插件连接同一后台。
            </p>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2 pt-6">
          <Button type="submit" disabled={busy}>
            {busy ? "正在验证…" : saved ? "切换工作空间" : "连接后台"}
          </Button>
          {saved && !mobile && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                localStorage.removeItem("onhold-remote");
                setToken("");
                onChange();
              }}
            >
              使用本机数据
            </Button>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}

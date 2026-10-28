import {
  Button,
  Card,
  EmptyState,
  Input,
  SectionTitle,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/onhold";
import { useIsMobile } from "@/hooks/use-mobile";
import { loginLabels, time } from "@/shared/operations";
import type { Client, Dashboard } from "@/shared/types";
import { ArrowUpRight, Plus, Search, Users } from "lucide-react";
import { useState } from "react";

export function AccountsPage({
  data,
  clients,
  busy,
  goConnect,
  choose,
  collect,
}: {
  data: Dashboard | null;
  clients: Client[];
  busy: boolean;
  goConnect: () => void;
  choose: (account: string) => void;
  collect: (account: string) => Promise<void>;
}) {
  const mobile = useIsMobile();
  const [search, setSearch] = useState("");
  return (
    <Card className="table-panel">
      <SectionTitle
        title="已连接账号"
        description={`${data?.accounts.length ?? 0} 个账号 · 数据按账号独立保存`}
        action={
          <Button variant="outline" size="sm" onClick={goConnect}>
            <Plus aria-hidden="true" />
            连接账号
          </Button>
        }
      />
      <div className="table-filter search-field">
        <Search aria-hidden="true" />
        <Input
          type="search"
          aria-label="搜索账号"
          placeholder="搜索账号…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {mobile ? (
        <div className="mobile-records" aria-label="账号列表">
          {(data?.accounts || [])
            .filter((item) =>
              item.handle.toLowerCase().includes(search.toLowerCase()),
            )
            .map((item) => {
              const client =
                clients.find((c) => c.account === item.handle && c.online) ||
                clients.find((c) => c.account === item.handle);
              return (
                <article className="mobile-record" key={item.handle}>
                  <div className="record-heading">
                    <Button variant="link" onClick={() => choose(item.handle)}>
                      @{item.handle}
                      <ArrowUpRight aria-hidden="true" />
                    </Button>
                    <StatusBadge
                      tone={
                        client?.online && client.login_state === "logged_in"
                          ? "success"
                          : client?.online
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {client?.online
                        ? loginLabels[client.login_state]
                        : "已离线"}
                    </StatusBadge>
                  </div>
                  <p className="muted">最近采集 {time(item.last_seen)}</p>
                  {client?.error && (
                    <p className="inline-error">{client.error}</p>
                  )}
                  <Button
                    variant="outline"
                    disabled={
                      busy ||
                      !client?.online ||
                      client.login_state !== "logged_in"
                    }
                    onClick={() => collect(item.handle)}
                  >
                    立即采集
                  </Button>
                </article>
              );
            })}
        </div>
      ) : (
        <Table aria-label="账号列表" className="account-table">
          <TableHeader>
            <TableRow>
              <TableHead>账号</TableHead>
              <TableHead>浏览器</TableHead>
              <TableHead>登录状态</TableHead>
              <TableHead>最近采集</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.accounts || [])
              .filter((item) => item.handle.includes(search.toLowerCase()))
              .map((item) => {
                const client =
                  clients.find((c) => c.account === item.handle && c.online) ||
                  clients.find((c) => c.account === item.handle);
                return (
                  <TableRow key={item.handle}>
                    <TableCell>
                      <button
                        className="account-cell"
                        onClick={() => choose(item.handle)}
                      >
                        <span className="account-avatar small">
                          {item.handle[0].toUpperCase()}
                        </span>
                        <span>
                          <strong>@{item.handle}</strong>
                          <small>
                            首次连接{" "}
                            {new Date(item.first_seen).toLocaleDateString(
                              "zh-CN",
                            )}
                          </small>
                        </span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={client?.online ? "success" : "neutral"}
                      >
                        {client?.online ? "已连接" : "未连接"}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>
                      {client ? loginLabels[client.login_state] : "等待连接"}
                    </TableCell>
                    <TableCell>{time(item.last_seen)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          busy ||
                          !client?.online ||
                          client.login_state !== "logged_in"
                        }
                        onClick={() => collect(item.handle)}
                      >
                        立即采集
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      )}
      {!!data?.accounts.length &&
        !data.accounts.some((item) =>
          item.handle.toLowerCase().includes(search.toLowerCase()),
        ) && <EmptyState title="没有匹配的账号" />}
      {!data?.accounts.length && (
        <EmptyState
          icon={Users}
          title="暂无账号"
          description="连接 X 助手以添加账号。"
          action={<Button onClick={goConnect}>连接 X 助手插件</Button>}
        />
      )}
    </Card>
  );
}

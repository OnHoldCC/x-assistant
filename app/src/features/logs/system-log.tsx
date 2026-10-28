import {
  Badge,
  Button,
  Card,
  Input,
  Notice,
  SectionTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/onhold";
import { api } from "@/shared/api";
import { time } from "@/shared/operations";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
type Log = {
  id: number;
  at: number;
  level: string;
  kind: string;
  account: string | null;
  message: string;
};
export function SystemLog() {
  const [logs, setLogs] = useState<Log[]>([]),
    [search, setSearch] = useState(""),
    [paused, setPaused] = useState(false),
    [error, setError] = useState("");
  const cursor = useRef(0),
    pause = useRef(false);
  pause.current = paused;
  useEffect(() => {
    let alive = true,
      polling = false,
      unlisten: (() => void) | undefined;
    const append = (rows: Log[]) => {
      if (!alive || pause.current) return;
      setLogs((previous) =>
        [
          ...new Map(
            [...previous, ...rows].map((row) => [row.id, row]),
          ).values(),
        ]
          .sort((a, b) => a.id - b.id)
          .slice(-1000),
      );
      for (const row of rows) cursor.current = Math.max(cursor.current, row.id);
    };
    const load = async () => {
      if (polling || pause.current) return;
      polling = true;
      try {
        append(await api<Log[]>("logs", { after: cursor.current }));
        if (alive) setError("");
      } catch (cause) {
        if (alive) setError(String(cause));
      } finally {
        polling = false;
      }
    };
    load();
    const timer = setInterval(load, 2000);
    if (isTauri())
      listen<Log>("system-log", (event) => append([event.payload]))
        .then((stop) => {
          if (alive) unlisten = stop;
          else stop();
        })
        .catch(() => {});
    return () => {
      alive = false;
      clearInterval(timer);
      unlisten?.();
    };
  }, []);
  const visible = logs.filter((log) =>
    (log.message + " " + log.kind + " " + (log.account || ""))
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <Card className="system-log">
      <SectionTitle
        title="系统日志"
        description={paused ? "已暂停界面更新" : "实时更新 · 最近1000条"}
        action={
          <div className="analytics-controls">
            <Input
              type="search"
              aria-label="筛选日志"
              placeholder="筛选事件、账号或内容"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? "继续更新" : "暂停更新"}
            </Button>
          </div>
        }
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <div
        className="log-scroll"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>级别</TableHead>
              <TableHead>账号</TableHead>
              <TableHead>事件</TableHead>
              <TableHead>内容</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...visible].reverse().map((log) => (
              <TableRow key={log.id}>
                <TableCell>{time(log.at)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      log.level === "error" ? "destructive" : "secondary"
                    }
                  >
                    {log.level}
                  </Badge>
                </TableCell>
                <TableCell>
                  {log.account ? "@" + log.account : "系统"}
                </TableCell>
                <TableCell>{log.kind}</TableCell>
                <TableCell>{log.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="analytics-controls">
        <Button variant="link" asChild>
          <a href="#tasks">采集记录</a>
        </Button>
        <Button variant="link" asChild>
          <a href="#author">版本更新内容</a>
        </Button>
      </div>
    </Card>
  );
}

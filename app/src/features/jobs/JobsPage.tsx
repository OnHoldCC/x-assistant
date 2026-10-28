import type { StatusTone } from "@/components/onhold";
import {
  Button,
  Card,
  EmptyState,
  NumberValue,
  SectionTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/onhold";
import { useIsMobile } from "@/hooks/use-mobile";
import { time } from "@/shared/operations";
import type { Job } from "@/shared/types";
import { ListChecks, RefreshCw } from "lucide-react";
import { useState } from "react";

const states = {
  queued: "等待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};

const jobLabels: Record<Job["action"], string> = {
  capture: "采集账号与帖子",
  capture_analytics: "采集官方分析",
  follow_back: "定时回关",
  unfollow: "定时取消关注",
};

const stateTones: Record<Job["state"], StatusTone> = {
  queued: "neutral",
  running: "info",
  completed: "success",
  failed: "danger",
};

export function JobsPage({
  jobs,
  selected,
  ready,
  analyticsReady,
  busy,
  collect,
}: {
  jobs: Job[];
  selected?: string | null;
  ready: boolean;
  analyticsReady: boolean;
  busy: boolean;
  collect: (account: string, action: Job["action"]) => Promise<void>;
}) {
  const mobile = useIsMobile();
  const [jobFilter, setJobFilter] = useState("all");
  const accountJobs = jobs.filter(
      (job) =>
        job.account === selected &&
        ["capture", "capture_analytics"].includes(job.action),
    ),
    visibleJobs = accountJobs.filter(
      (job) => jobFilter === "all" || job.state === jobFilter,
    );
  return (
    <>
      <div className="task-summary">
        {(["queued", "running", "completed", "failed"] as const).map(
          (state) => (
            <StatCard
              key={state}
              label={states[state]}
              value={
                <NumberValue
                  value={
                    accountJobs.filter((job) => job.state === state).length
                  }
                />
              }
            />
          ),
        )}
      </div>
      <Card className="task-heading">
        <div className="task-icon">
          <RefreshCw aria-hidden="true" />
        </div>
        <div>
          <h2>定时采集</h2>
          <p>每 5 分钟采集一次，退出登录或浏览器离线后暂停。</p>
        </div>
        <StatusBadge tone={ready ? "info" : "neutral"}>
          {ready ? "已启用" : "等待连接"}
        </StatusBadge>
      </Card>
      <Card className="table-panel">
        <SectionTitle
          title="执行记录"
          description={selected ? `@${selected} · 最近任务` : "请先选择账号"}
          action={
            <Select value={jobFilter} onValueChange={setJobFilter}>
              <SelectTrigger aria-label="任务状态" className="sort-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(states).map(([state, label]) => (
                  <SelectItem key={state} value={state}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        {mobile ? (
          <div className="mobile-records" aria-label="采集任务记录">
            {visibleJobs.map((job) => (
              <article className="mobile-record" key={job.id}>
                <div className="record-heading">
                  <strong>{jobLabels[job.action]}</strong>
                  <StatusBadge tone={stateTones[job.state]}>
                    {states[job.state]}
                  </StatusBadge>
                </div>
                <p className="muted">
                  @{job.account} · {time(job.created_at)}
                </p>
                <p className={job.error ? "inline-error" : "muted"}>
                  {job.error ||
                    (job.state === "completed"
                      ? "数据已写入"
                      : job.state === "running"
                        ? "正在读取 X 数据…"
                        : "等待浏览器执行")}
                </p>
                {job.state === "failed" && (
                  <Button
                    variant="outline"
                    disabled={
                      !ready ||
                      busy ||
                      (job.action === "capture_analytics" && !analyticsReady)
                    }
                    onClick={() => collect(job.account, job.action)}
                  >
                    重新采集
                  </Button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Table aria-label="采集任务记录" className="jobs-table">
            <TableHeader>
              <TableRow>
                <TableHead>账号</TableHead>
                <TableHead>任务</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead>结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell>@{job.account}</TableCell>
                  <TableCell>{jobLabels[job.action]}</TableCell>
                  <TableCell>
                    <StatusBadge tone={stateTones[job.state]}>
                      {states[job.state]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{time(job.created_at)}</TableCell>
                  <TableCell className="job-result">
                    <p>
                      {job.error ||
                        (job.state === "completed" ? "数据已写入" : "—")}
                    </p>
                    {job.state === "failed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        disabled={
                          !ready ||
                          busy ||
                          (job.action === "capture_analytics" &&
                            !analyticsReady)
                        }
                        onClick={() => collect(job.account, job.action)}
                      >
                        重新采集
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!visibleJobs.length && (
          <EmptyState
            icon={ListChecks}
            title={jobFilter === "all" ? "还没有任务" : "没有匹配的任务"}
            description="连接浏览器后会自动采集，也可以手动新建一次任务。"
          />
        )}
      </Card>
    </>
  );
}

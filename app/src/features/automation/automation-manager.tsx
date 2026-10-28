import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Notice,
  SectionTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/onhold";
import { api } from "@/shared/api";
import { time } from "@/shared/operations";
import { useEffect, useRef, useState } from "react";
type Plan = {
  id: string;
  enabled: boolean;
  state: string;
  next_run: number;
  last_run: number | null;
  config: {
    action: "follow_back" | "unfollow";
    interval_minutes: number;
    limit: number;
    after_days: number;
    scope: string;
    targets: string[];
  };
};
type State = {
  account: string;
  block: { reason: string; at: number } | null;
  tasks: Plan[];
};
export function AutomationManager({ account }: { account?: string | null }) {
  const [state, setState] = useState<State | null>(null),
    [action, setAction] = useState("follow_back"),
    [scope, setScope] = useState("automation_owned"),
    [interval, setIntervalMinutes] = useState("1440"),
    [limit, setLimit] = useState("5"),
    [days, setDays] = useState("7"),
    [targets, setTargets] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef(0);
  async function load() {
    const id = ++request.current;
    if (!account) {
      setState(null);
      return;
    }
    try {
      const value = await api<State>("automation", { account });
      if (id === request.current && value.account === account) setState(value);
    } catch (cause) {
      if (id === request.current) setError(String(cause));
    }
  }
  useEffect(() => {
    setState(null);
    setError("");
    load();
    const timer = setInterval(load, 2000);
    return () => {
      request.current++;
      clearInterval(timer);
    };
  }, [account]);
  async function perform(operation: string, input: object = {}) {
    setBusy(true);
    setError("");
    try {
      await api(operation, { ...input, account });
      await load();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="automation-manager">
      <Card className="automation-intro">
        <SectionTitle
          title="自动化"
          description="浏览器在线且登录正常时执行；触发限制立即暂停。"
        />
        {state?.block && (
          <Notice tone="danger">
            {state.block.reason} · {time(state.block.at)}
            <Button
              variant="link"
              disabled={busy}
              onClick={() => perform("resume_automation")}
            >
              确认限制解除并恢复
            </Button>
          </Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <details className="automation-create">
          <summary>新建自动化任务</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              perform("save_automation", {
                action,
                scope,
                interval_minutes: Number(interval),
                limit: Number(limit),
                after_days: Number(days),
                targets: targets
                  .split(/[,，\s]+/)
                  .map((value) => value.replace(/^@/, "").trim().toLowerCase())
                  .filter(Boolean),
              });
            }}
          >
            <label>
              任务类型
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow_back">定时回关</SelectItem>
                  <SelectItem value="unfollow">定时取消关注</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              目标范围
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automation_owned">
                    {action === "follow_back"
                      ? "当前账号的关注者"
                      : "本系统关注且到期未回关的人"}
                  </SelectItem>
                  <SelectItem value="manual">手动指定名单</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {scope === "manual" && (
              <label className="full-width">
                目标账号
                <Input
                  required
                  value={targets}
                  onChange={(event) => setTargets(event.target.value)}
                  placeholder="账号之间用逗号分隔，不含 @"
                />
              </label>
            )}
            <label>
              执行间隔
              <Select value={interval} onValueChange={setIntervalMinutes}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">每小时</SelectItem>
                  <SelectItem value="720">每12小时</SelectItem>
                  <SelectItem value="1440">每天</SelectItem>
                  <SelectItem value="10080">每周</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              每次最多
              <Input
                type="number"
                min="1"
                max="20"
                required
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </label>
            {action === "unfollow" && scope === "automation_owned" && (
              <label>
                关注满多少天
                <Input
                  type="number"
                  min="1"
                  max="365"
                  required
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
              </label>
            )}
            <Button type="submit" disabled={busy || !account}>
              创建并保持暂停
            </Button>
          </form>
        </details>
      </Card>
      <div className="automation-plans">
        {state?.tasks.map((plan) => (
          <Card key={plan.id}>
            <SectionTitle
              title={
                plan.config.action === "follow_back"
                  ? "定时回关"
                  : "定时取消关注"
              }
              action={
                <Badge
                  variant={
                    plan.state === "limited" ? "destructive" : "secondary"
                  }
                >
                  {state.block
                    ? "限制暂停"
                    : !plan.enabled
                      ? "未启用"
                      : (
                          {
                            queued: "等待执行",
                            running: "执行中",
                            waiting: "已启用",
                            error: "执行失败",
                          } as Record<string, string>
                        )[plan.state] || plan.state}
                </Badge>
              }
            />
            <p>
              {plan.config.scope === "manual"
                ? "指定 " + plan.config.targets.length + " 个账号"
                : plan.config.action === "follow_back"
                  ? "仅回关关注了自己的账号"
                  : "仅处理由本系统关注、满 " +
                    plan.config.after_days +
                    " 天且尚未回关的账号"}
            </p>
            <dl>
              <div>
                <dt>执行间隔</dt>
                <dd>{plan.config.interval_minutes / 60} 小时</dd>
              </div>
              <div>
                <dt>每次最多</dt>
                <dd>{plan.config.limit} 人</dd>
              </div>
              <div>
                <dt>上次执行</dt>
                <dd>{time(plan.last_run)}</dd>
              </div>
              <div>
                <dt>下次执行</dt>
                <dd>
                  {plan.enabled && !state.block
                    ? time(plan.next_run)
                    : "已暂停"}
                </dd>
              </div>
            </dl>
            <div className="analytics-controls">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !!state.block}
                onClick={() =>
                  perform("control_automation", {
                    id: plan.id,
                    enabled: !plan.enabled,
                  })
                }
              >
                {plan.enabled ? "暂停任务" : "启用任务"}
              </Button>
              {plan.enabled && (
                <Button
                  size="sm"
                  disabled={busy || !!state.block}
                  onClick={() => perform("run_automation", { id: plan.id })}
                >
                  立即执行
                </Button>
              )}
              <Button size="sm" variant="link" asChild>
                <a href="#logs">执行日志</a>
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {!state?.tasks.length && (
        <Card>
          <EmptyState
            title="还没有自动化任务"
            description="创建任务、核对范围后，再启用执行。"
          />
        </Card>
      )}
    </div>
  );
}

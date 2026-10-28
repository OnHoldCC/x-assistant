import {
  Button,
  Badge,
  Card,
  CardAction,
  CardHeader,
  CardDescription,
  CardTitle,
  CardFooter,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SectionTitle,
  StatusBadge,
  NumberValue,
  StatCard,
} from "@/components/onhold";
import React, { useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  ExternalLink,
  FileText,
  LoaderCircle,
  Radio,
  Users,
  Wifi,
  WifiOff,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Sigma,
  Minus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { interactionMetrics } from "@/shared/metrics";
import type { Client, Metric, MetricName, Post } from "@/shared/types";
import { useIsMobile } from "@/hooks/use-mobile";

export const labels: Record<MetricName, string> = {
  followers: "粉丝",
  following: "关注",
  views: "浏览量",
  likes: "点赞",
  replies: "评论",
  reposts: "转发",
  bookmarks: "收藏",
};
export const loginLabels: Record<Client["login_state"], string> = {
  logged_in: "已登录",
  logged_out: "需要重新登录",
  account_changed: "账号已切换",
  page_unavailable: "页面不可用",
  unknown: "等待检查",
};
export const time = (at: number | undefined | null) =>
  at ? new Date(at).toLocaleString("zh-CN", { hour12: false }) : "尚未采集";
export function MetricCard({
  label,
  value,
  delta,
  approximate,
  detail,
  icon: Icon,
}: {
  label: string;
  value: number | null | undefined;
  delta?: Metric;
  approximate?: boolean;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <StatCard
      label={label}
      value={<NumberValue value={value} approximate={approximate} compact />}
      change={
        <Badge variant="outline">
          {delta?.delta != null ? (
            <>
              {delta.delta === 0 ? (
                <Minus aria-hidden="true" />
              ) : delta.delta < 0 ? (
                <ArrowDownRight aria-hidden="true" />
              ) : (
                <ArrowUpRight aria-hidden="true" />
              )}
              {delta.delta > 0 ? "+" : ""}
              <NumberValue
                value={delta.delta}
                approximate={delta.delta_approximate}
              />
            </>
          ) : (
            "—"
          )}
        </Badge>
      }
      footer={
        <div className="flex gap-2 font-medium">
          {detail}
          <Icon className="size-4" aria-hidden="true" />
        </div>
      }
    />
  );
}
export function SessionCard({
  clients,
  account,
  onConnect,
}: {
  clients: Client[];
  account?: string | null;
  onConnect: () => void;
}) {
  const client =
    clients.find((item) => item.account === account && item.online) ||
    clients.find((item) => item.account === account);
  const ready = !!client?.online && client.login_state === "logged_in";
  return (
    <Card className="session-card">
      <SectionTitle
        title="账号连接"
        action={
          <Radio aria-hidden="true" className={ready ? "text-success" : ""} />
        }
      />
      <div className="account-identity">
        <span className="account-avatar">
          {account?.[0]?.toUpperCase() || <Users aria-hidden="true" />}
        </span>
        <div>
          <strong>{account ? "@" + account : "尚未绑定账号"}</strong>
          <span>
            {client ? loginLabels[client.login_state] : "连接助手后开始记录"}
          </span>
        </div>
      </div>
      <dl className="status-list">
        <div>
          <dt>{client?.transport === "backend" ? "采集方式" : "浏览器连接"}</dt>
          <dd>
            <StatusBadge tone={client?.online ? "success" : "neutral"}>
              {client?.transport === "backend" ? "后台定时采集" : client?.online ? "长连接在线" : "未连接"}
            </StatusBadge>
          </dd>
        </div>
        <div>
          <dt>自动采集</dt>
          <dd>{ready ? "每 5 分钟" : "等待连接"}</dd>
        </div>
        <div>
          <dt>{client?.transport === "backend" ? "最近请求" : "最近心跳"}</dt>
          <dd>
            {client?.last_seen
              ? new Date(client.last_seen).toLocaleTimeString("zh-CN", {
                  hour12: false,
                })
              : "—"}
          </dd>
        </div>
      </dl>
      {client?.error && <p className="inline-error">{client.error}</p>}
      <Button variant="outline" onClick={onConnect}>
        {ready ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
        {ready ? "管理连接" : "连接 X 助手插件"}
      </Button>
    </Card>
  );
}
const postMetricIcons = {
  views: Eye,
  likes: Heart,
  replies: MessageCircle,
  reposts: Repeat2,
  bookmarks: Bookmark,
};
export function PostMetrics({
  post,
  bookmarks = false,
}: {
  post: Post;
  bookmarks?: boolean;
}) {
  const names: (keyof typeof postMetricIcons)[] = [
    "views",
    "likes",
    "replies",
    "reposts",
    ...(bookmarks ? ["bookmarks" as const] : []),
  ];
  return (
    <dl className="post-icon-metrics" aria-label="帖子指标">
      {names.map((name) => {
        const Icon = postMetricIcons[name];
        return (
          <div key={name} title={labels[name]}>
            <dt>
              <Icon aria-hidden="true" />
              <span className="sr-only">{labels[name]}</span>
            </dt>
            <dd>
              <NumberValue
                value={post.metrics[name]?.value}
                approximate={post.metrics[name]?.approximate}
              />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
export function PostRates({ post }: { post: Post }) {
  const rates = interactionMetrics(post.metrics);
  return (
    <p className="post-rates">
      <span title="评论率：评论 ÷ 浏览量 × 100%">
        <MessageCircle aria-hidden="true" />
        <span className="sr-only">评论率 </span>
        {rates.commentRate === null
          ? "—"
          : (rates.approximate ? "≈" : "") + rates.commentRate.toFixed(3) + "%"}
      </span>
      <span title="加权参考值：（0.66×赞＋5×评＋转）÷浏览量×100%，非 X 官方互动率">
        <Sigma aria-hidden="true" />
        <span className="sr-only">加权参考值 </span>
        {rates.weightedRate === null
          ? "—"
          : (rates.approximate ? "≈" : "") +
            rates.weightedRate.toFixed(2) +
            "%"}
      </span>
    </p>
  );
}
export function PostPerformanceTable({
  posts,
  onSelect,
  compact = false,
}: {
  posts: Post[];
  onSelect: (post: Post) => void;
  compact?: boolean;
}) {
  const mobile = useIsMobile();
  if (mobile)
    return (
      <div
        className="mobile-records"
        aria-label={compact ? "重点帖子" : "帖子表现"}
      >
        {posts.map((post) => (
          <article key={post.id} className="mobile-record">
            <button
              className="mobile-post-title"
              onClick={() => onSelect(post)}
            >
              {post.text || "查看帖子"}
            </button>
            <span className="row-subtitle">
              {time(
                post.created_at ? Date.parse(post.created_at) : post.first_seen,
              )}
            </span>
            <PostMetrics post={post} />
            <PostRates post={post} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelect(post)}
              aria-label={"查看帖子 " + post.id}
            >
              查看详情与评论
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </article>
        ))}
      </div>
    );
  return (
    <Table
      className={"post-table " + (compact ? "compact" : "")}
      aria-label={compact ? "重点帖子" : "帖子表现"}
    >
      <TableHeader>
        <TableRow>
          <TableHead>帖子内容</TableHead>
          <TableHead className="number" title={labels.views}>
            <Eye className="ml-auto size-4" aria-hidden="true" />
            <span className="sr-only">{labels.views}</span>
          </TableHead>
          <TableHead className="number" title={labels.likes}>
            <Heart className="ml-auto size-4" aria-hidden="true" />
            <span className="sr-only">{labels.likes}</span>
          </TableHead>
          <TableHead className="number" title={labels.replies}>
            <MessageCircle className="ml-auto size-4" aria-hidden="true" />
            <span className="sr-only">{labels.replies}</span>
          </TableHead>
          {!compact && (
            <>
              <TableHead className="number" title={labels.reposts}>
                <Repeat2 className="ml-auto size-4" aria-hidden="true" />
                <span className="sr-only">{labels.reposts}</span>
              </TableHead>
              <TableHead className="number">评论率</TableHead>
            </>
          )}
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {posts.map((post) => {
          const rate = interactionMetrics(post.metrics);
          return (
            <TableRow key={post.id}>
              <TableCell>
                <button className="post-title" onClick={() => onSelect(post)}>
                  {post.text}
                </button>
                <span className="row-subtitle">
                  {time(
                    post.created_at
                      ? Date.parse(post.created_at)
                      : post.first_seen,
                  )}
                </span>
              </TableCell>
              {(
                [
                  "views",
                  "likes",
                  "replies",
                  ...(!compact ? ["reposts"] : []),
                ] as MetricName[]
              ).map((name) => (
                <TableCell className="number" key={name}>
                  <NumberValue
                    value={post.metrics[name]?.value}
                    approximate={post.metrics[name]?.approximate}
                  />
                </TableCell>
              ))}
              {!compact && (
                <TableCell className="number">
                  {rate.commentRate === null
                    ? "—"
                    : (rate.approximate ? "≈" : "") +
                      rate.commentRate.toFixed(3) +
                      "%"}
                </TableCell>
              )}
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelect(post)}
                  aria-label={"查看帖子 " + post.id}
                >
                  查看
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
export function PostDetail({
  post,
  onClose,
}: {
  post: Post | null;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Sheet
      open={!!post}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setError("");
        }
      }}
    >
      <SheetContent
        className="post-detail"
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement as HTMLElement;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus.current?.focus();
        }}
      >
        <SheetHeader>
          <SheetTitle>帖子详情</SheetTitle>
          <SheetDescription>
            {post
              ? "@" +
                post.handle +
                " · " +
                time(
                  post.created_at
                    ? Date.parse(post.created_at)
                    : post.first_seen,
                )
              : "帖子数据"}
          </SheetDescription>
        </SheetHeader>
        {post && (
          <div className="post-detail-body">
            <Badge variant="secondary">
              <FileText aria-hidden="true" />
              已采集内容
            </Badge>
            <p className="post-full-text">{post.text}</p>
            <PostMetrics post={post} bookmarks />
            <PostRates post={post} />
            <p className="muted">
              评论率 = 评论 ÷ 浏览量。加权参考值为自定义观察指标，独立于 X
              官方互动率。
            </p>
            <div className="post-tags">
              {post.hashtags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  #{tag}
                </Badge>
              ))}
            </div>
            <dl className="status-list">
              <div>
                <dt>首次采集</dt>
                <dd>{time(post.first_seen)}</dd>
              </div>
              <div>
                <dt>最近采集</dt>
                <dd>{time(post.last_seen)}</dd>
              </div>
            </dl>
            <Button asChild variant="outline">
              <a
                href={post.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  if (isTauri()) {
                    event.preventDefault();
                    invoke("open_x_page", { url: post.url }).catch((cause) =>
                      setError(String(cause)),
                    );
                  }
                }}
              >
                <ExternalLink aria-hidden="true" />
                查看原帖与评论
              </a>
            </Button>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
export function LoadingIcon({ active }: { active: boolean }) {
  return active ? <LoaderCircle className="spin" aria-hidden="true" /> : null;
}

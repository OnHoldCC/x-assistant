import type { Client, MetricName, Job } from "@/shared/types";
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
export const localDate = (at?: number | null) =>
  at
    ? new Date(at - new Date(at).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
export const states = {
  queued: "等待执行",
  rewriting: "改写中",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};
export const jobLabels: Record<Job["action"], string> = {
  capture: "采集账号与帖子",
  capture_analytics: "采集官方分析",
  capture_creator: "采集创作者资格",
  capture_relationships: "同步关系名单",
  capture_for_you: "读取 For You 帖子",
  capture_notifications: "读取通知回复",
  follow_back: "定时回关",
  unfollow: "定时取消关注",
  rewrite_publish: "改写并定时发布",
};
export const jobTitle = (j: Pick<Job, "action" | "input">) =>
  j.action === "capture_notifications" && j.input?.publication_mode === "follow_back"
    ? "识别新关注通知"
    : j.input?.mode === "news"
    ? "新闻发文"
    : j.input?.mode === "reply"
      ? j.input.scope === "notifications"
        ? "自动回复"
        : "自动评论"
      : j.input?.mode === "replicate"
        ? "发同款"
        : j.input?.mode === "similar"
          ? "生成同类文章"
          : jobLabels[j.action];
export function jobLabel(j: Job) {
  if (j.state === "completed" && j.input?.stage === "skipped") return "本轮跳过";
  if (
    j.action === "rewrite_publish" &&
    ["similar", "replicate", "reply"].includes(j.input?.mode || "")
  ) {
    if (j.state === "rewriting") return "生成中";
    if (j.state === "queued" && j.input?.stage === "rewrite") return "等待生成";
  }
  if (j.action !== "rewrite_publish" || j.state !== "queued")
    return states[j.state];
  return j.input?.stage === "rewrite"
    ? "等待改写"
    : j.input?.publish_at
      ? "等待发布"
      : "待设置时间";
}
export function jobMessage(j: Job) {
  if (j.error) return [j.error, j.result?.cleanup_warning].filter(Boolean).join(" · ");
  if (j.state === "completed" && j.input?.stage === "skipped" && j.result?.sent === false)
    return j.result.skip_reason || "本轮未发布";
  if (j.action !== "rewrite_publish")
    return j.state === "completed"
      ? ["capture", "capture_analytics"].includes(j.action)
        ? "数据已写入"
        : "执行完成"
      : j.state === "running"
        ? "正在执行…"
        : "等待浏览器执行";
  if (j.state === "completed")
    return j.result?.cleanup_warning
      ? "已发布到 X · " + j.result.cleanup_warning
      : "已发布到 X";
  if (j.input?.mode === "news")
    return j.state === "rewriting"
      ? "Codex 正在联网查证新闻并生成短帖"
      : j.state === "running"
        ? "正在发送并等待 X 确认"
        : "新闻搜索任务，保留来源、发布时间及发布回执";
  if (j.input?.mode === "reply")
    return j.state === "rewriting"
      ? "Codex CLI 正在根据原帖生成回复"
      : j.state === "running"
        ? "正在回复并等待 X 确认"
        : "逐帖回复任务，将自动发送到来源帖子";
  if (j.input?.mode === "replicate")
    return j.state === "rewriting"
      ? "Codex CLI 正在分析原帖并生成同款正文"
      : j.state === "running"
        ? "正在发送并等待 X 确认"
        : j.input.stage === "ready"
          ? "固定 JSON 已校验，将自动发送到当前账号"
          : "原帖已入队，等待 Codex 分析生成";
  if (j.state === "rewriting")
    return j.input?.mode === "similar"
      ? "Codex CLI 正在生成同类文章"
      : "Codex CLI 正在润色原文";
  if (j.state === "running") return "正在 X 首页输入并发布…";
  return j.input?.publish_at
    ? "计划于 " + time(j.input.publish_at)
    : j.input?.stage === "ready"
      ? "正文已生成，可复制或安排发布"
      : "生成后可查看正文，未安排时间不会发布";
}
export const safeResultUrl = (url?: string | null) =>
  !!url && /^https:\/\/x\.com\/[a-zA-Z0-9_]{1,15}\/status\/\d+$/.test(url);

export type MetricName =
  | "followers"
  | "following"
  | "views"
  | "likes"
  | "replies"
  | "reposts"
  | "bookmarks";
export type Count = { value: number; approximate: boolean; raw: string };
export type Metric = {
  value: number | null;
  delta: number | null;
  approximate: boolean;
  delta_approximate: boolean;
  baseline_at: number | null;
  observed_at: number | null;
};
export type Account = { handle: string; first_seen: number; last_seen: number };
export type Post = {
  id: string;
  handle: string;
  text: string;
  created_at: string | null;
  hashtags: string[];
  first_seen: number;
  last_seen: number;
  url: string;
  metrics: Record<MetricName, Metric>;
};
export type Point = {
  at: number;
  label: string;
  values: Record<MetricName, number | null>;
  approximate: Record<MetricName, boolean>;
};
export type AnalyticsPoint = {
  date: string;
  metrics: Record<string, number | null>;
};
export type EarningsAssumptions = {
  qualified30: number;
  rpmCny: number;
  observed_at?: number;
};
export type EarningsCalibration = {
  payout: number;
  currency: "USD" | "CNY";
  impressions: number;
  start_date: string;
  end_date: string;
  period: string;
  verified_only: boolean;
  observed_at: number;
};
export type CreatorData = {
  account: string;
  state: "unknown" | "ineligible" | "eligible" | "enrolled";
  verified_followers?: { current: Count; target: number };
  verified_impressions?: {
    current: Count;
    target: number;
    days: number;
    exclude_replies?: boolean;
  };
};
export type CreatorSummary = {
  account: string;
  snapshot: { data: CreatorData; source: string; observed_at: number } | null;
  assumptions: EarningsAssumptions | null;
  calibration?: EarningsCalibration | null;
};
export type AnalyticsSnapshot = {
  data: {
    metrics?: Record<string, Count>;
    series?: AnalyticsPoint[];
    period?: string;
    period_key?: string;
    verified_only?: boolean | null;
    available_periods?: string[];
  };
  observed_at: number;
  source: string;
};
export type Dashboard = {
  accounts: Account[];
  account: string | null;
  posts: Post[];
  metrics: Partial<Record<MetricName, Metric>>;
  series: Point[];
  days: number;
  analytics: AnalyticsSnapshot | null;
  analytics_periods?: Record<string, AnalyticsSnapshot>;
  creator?: CreatorSummary;
  automation_block?: { reason: string; at: number } | null;
  task_stats?: TaskStats[];
};
export type Client = {
  id: string;
  account: string;
  last_seen: number;
  online: boolean;
  transport: "http" | "websocket" | "backend";
  login_state:
    | "logged_in"
    | "logged_out"
    | "account_changed"
    | "page_unavailable"
    | "unknown";
  error: string;
  capture_interval_seconds: number;
  analytics_supported?: boolean;
  extension_version?: string;
};
export type NewsSource = "web" | "weibo" | "rednote" | "hot_topics" | "international" | "mixed";
export type TaskStats = Pick<Job, "action" | "input"> & { completed: number; failed: number; skipped: number; tokens: number; missing_usage: number };
export type NewsFeed = { retrieved_at:number; cached:boolean; counts:Record<string,number>; items:{kind:string;platform:string;title:string;url:string;published_at:number|null}[]; errors:{platform:string;error:string}[] };
export type Job = {
  id: string;
  account: string;
  action: "capture" | "capture_analytics" | "capture_creator" | "capture_relationships" | "capture_for_you" | "capture_notifications" | "follow_back" | "unfollow" | "rewrite_publish";
  state: "queued" | "rewriting" | "running" | "completed" | "failed";
  created_at: number;
  updated_at: number;
  error: string | null;
  input?: {
    kind?: "followers" | "following";
    mode?: "rewrite" | "similar" | "replicate" | "reply" | "news";
    stage?: "rewrite" | "ready" | "sending" | "skipped";
    publish_at?: number | null;
    source?: { text: string; url: string; author: string; id: string; title?:string;published_at?:number };
    text?: string;
    limit?: number;
    targets?: string[];
    analysis?: {topic:string;structure:string;tone:string;key_points:string[]};
    schema_version?: number;
    scope?:'for_you'|'notifications'|'trending'|'news';
    query?:string;
    news_source?: NewsSource;
    include_source_link?: boolean;
    allow_news_search?: boolean;
    model_not_called?: boolean;
    news_feed?: NewsFeed;
    publication_mode?: "reply" | "follow_back";
    rejected_generation?:Record<string,unknown>;
    discovered_from?:string;
    capture_summary?:{scanned:number;eligible:number;filtered:Record<'ads'|'truncated'|'source'|'text'|'own'|'language'|'translated',number>};
    telemetry?:{send_started_at?:number;generations?:{started_at:number;finished_at:number;duration_ms:number;usage:{input_tokens:number;output_tokens:number;cached_input_tokens:number|null;total_tokens:number}|null}[]};
  };
  result?: { sent?:boolean;skip_reason?:string;tab_closed?:boolean;cleanup_warning?:string;reply_to?:string|null; reply_progress?:{total:number;completed:number;failed:number}; url?: string | null; completed?: string[]; skipped?: string[] } | null;
};

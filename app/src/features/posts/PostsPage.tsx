import {
  Badge,
  Card,
  EmptyState,
  Input,
  NumberValue,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/onhold";
import { MemoryPanel } from "@/features/posts/memory-panel";
import { useIsMobile } from "@/hooks/use-mobile";
import { interactionMetrics, summarizePosts } from "@/shared/metrics";
import { PostPerformanceTable, labels } from "@/shared/operations";
import type { MetricName, Post } from "@/shared/types";
import { FileText, Search } from "lucide-react";
import { useMemo, useState } from "react";

export function PostsPage({
  posts,
  selected,
  setDetail,
}: {
  posts: Post[];
  selected?: string | null;
  setDetail: (post: Post) => void;
}) {
  const mobile = useIsMobile();
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("views"),
    [postView, setPostView] = useState("posts");
  const filtered = useMemo(
    () =>
      posts
        .filter((post) =>
          post.text.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => {
          if (sort === "recent")
            return (
              (Date.parse(b.created_at || "") || b.first_seen) -
              (Date.parse(a.created_at || "") || a.first_seen)
            );
          const av =
              sort === "commentRate"
                ? interactionMetrics(a.metrics).commentRate
                : a.metrics[sort as MetricName]?.value,
            bv =
              sort === "commentRate"
                ? interactionMetrics(b.metrics).commentRate
                : b.metrics[sort as MetricName]?.value;
          return av == null
            ? bv == null
              ? b.last_seen - a.last_seen
              : 1
            : bv == null
              ? -1
              : bv - av || b.last_seen - a.last_seen;
        }),
    [posts, search, sort],
  );
  const topics = useMemo(() => {
    const topics = new Map<string, Post[]>();
    for (const post of posts.filter(
      (post) =>
        post.text.toLowerCase().includes(search.toLowerCase()) ||
        post.hashtags.some((tag) =>
          tag.toLowerCase().includes(search.toLowerCase().replace(/^#/, "")),
        ),
    ))
      for (const tag of new Set(post.hashtags)) {
        if (!topics.has(tag)) topics.set(tag, []);
        topics.get(tag)!.push(post);
      }
    return topics;
  }, [posts, search]);
  return (
    <>
      <MemoryPanel key={selected} account={selected} />
      <Card className="table-panel content-panel">
        <div className="content-toolbar">
          <Tabs value={postView} onValueChange={setPostView}>
            <TabsList variant="line" aria-label="内容分析视图">
              <TabsTrigger value="posts">帖子表现</TabsTrigger>
              <TabsTrigger value="topics">话题对比</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="table-actions">
            <div className="search-field">
              <Search aria-hidden="true" />
              <Input
                type="search"
                aria-label="搜索帖子"
                placeholder="搜索已采集内容…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger aria-label="帖子排序" className="sort-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">最新发布</SelectItem>
                <SelectItem value="commentRate">评论率优先</SelectItem>
                {(["views", "likes", "replies", "reposts"] as MetricName[]).map(
                  (name) => (
                    <SelectItem value={name} key={name}>
                      {labels[name]}优先
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
        {postView === "posts" ? (
          filtered.length ? (
            <PostPerformanceTable posts={filtered} onSelect={setDetail} />
          ) : (
            <EmptyState
              icon={FileText}
              title="暂无匹配的帖子"
              description="采集后显示帖子数据。"
            />
          )
        ) : (
          <>
            {mobile ? (
              <div className="mobile-records" aria-label="话题表现对比">
                {[...topics]
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([tag, items]) => {
                    const topic = summarizePosts(items);
                    return (
                      <article className="mobile-record" key={tag}>
                        <div className="record-heading">
                          <Badge variant="secondary">#{tag}</Badge>
                          <span className="muted">{items.length} 条帖子</span>
                        </div>
                        <dl className="mobile-metrics">
                          {(["views", "replies"] as MetricName[]).map(
                            (name) => {
                              const known = items
                                .map((post) => post.metrics[name])
                                .filter((metric) => metric.value != null);
                              return (
                                <div key={name}>
                                  <dt>{labels[name]}</dt>
                                  <dd>
                                    <NumberValue
                                      value={
                                        known.length
                                          ? known.reduce(
                                              (sum, metric) =>
                                                sum + metric.value!,
                                              0,
                                            )
                                          : null
                                      }
                                      approximate={known.some(
                                        (metric) => metric.approximate,
                                      )}
                                    />
                                  </dd>
                                </div>
                              );
                            },
                          )}
                          <div>
                            <dt>可比帖评论率</dt>
                            <dd>
                              {topic.commentRate == null
                                ? "—"
                                : (topic.approximate ? "≈" : "") +
                                  topic.commentRate.toFixed(3) +
                                  "%"}
                            </dd>
                          </div>
                        </dl>
                        <p className="muted">
                          可比 {topic.comparable} / {items.length} 条
                        </p>
                      </article>
                    );
                  })}
              </div>
            ) : (
              <Table aria-label="话题表现对比" className="topic-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>原帖话题</TableHead>
                    <TableHead className="number">帖子数</TableHead>
                    {(
                      ["views", "likes", "replies", "reposts"] as MetricName[]
                    ).map((name) => (
                      <TableHead key={name} className="number">
                        {labels[name]}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...topics]
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([tag, items]) => (
                      <TableRow key={tag}>
                        <TableCell>
                          <Badge variant="secondary">#{tag}</Badge>
                        </TableCell>
                        <TableCell className="number">{items.length}</TableCell>
                        {(
                          [
                            "views",
                            "likes",
                            "replies",
                            "reposts",
                          ] as MetricName[]
                        ).map((name) => {
                          const values = items
                            .map((post) => post.metrics[name])
                            .filter((metric) => metric.value !== null);
                          return (
                            <TableCell key={name} className="number">
                              <NumberValue
                                value={
                                  values.length
                                    ? values.reduce(
                                        (sum, metric) => sum + metric.value!,
                                        0,
                                      )
                                    : null
                                }
                                approximate={values.some(
                                  (metric) => metric.approximate,
                                )}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
            {!topics.size && (
              <EmptyState
                title="暂无话题"
                description="采集后按原帖话题汇总。"
              />
            )}
          </>
        )}
        <footer className="table-footnote">
          {postView === "posts"
            ? `${filtered.length} 条已采集帖子 · 点击内容查看详情`
            : "一帖可含多个话题，各话题合计不可相加当作去重总量。"}
        </footer>
      </Card>
    </>
  );
}

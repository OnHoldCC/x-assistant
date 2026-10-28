import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Notice,
  SectionTitle,
} from "@/components/onhold";
import { api } from "@/shared/api";
import { PostMetrics, PostRates, time } from "@/shared/operations";
import type { Count, Post } from "@/shared/types";
import { Bookmark } from "lucide-react";
import { useEffect, useRef, useState } from "react";
type SavedPost = {
  post: {
    id: string;
    author: string;
    text: string;
    url: string;
    metrics: Record<string, Count>;
  };
  tags: string[];
  saved_at: number;
  updated_at: number;
};
type SavedPage = {
  account: string;
  items: SavedPost[];
  tags: string[];
  total: number;
  next_offset: number | null;
};
function toPost(item: SavedPost): Post {
  return {
    id: item.post.id,
    handle: item.post.author,
    text: item.post.text,
    url: item.post.url,
    created_at: null,
    hashtags: item.tags,
    first_seen: item.saved_at,
    last_seen: item.updated_at,
    metrics: Object.fromEntries(
      ["views", "likes", "replies", "reposts", "bookmarks"].map((name) => [
        name,
        {
          value: item.post.metrics[name]?.value ?? null,
          approximate: item.post.metrics[name]?.approximate || false,
          observed_at: item.updated_at,
          delta: null,
          delta_approximate: false,
          baseline_at: null,
        },
      ]),
    ) as Post["metrics"],
  };
}
export function BookmarkLibrary({
  account,
  onSelect,
}: {
  account?: string | null;
  onSelect: (post: Post) => void;
}) {
  const [items, setItems] = useState<SavedPost[]>([]),
    [tags, setTags] = useState<string[]>([]),
    [tag, setTag] = useState(""),
    [search, setSearch] = useState(""),
    [next, setNext] = useState<number | null>(null),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const request = useRef(0);
  async function load(offset = 0) {
    const id = ++request.current;
    if (!account) {
      setItems([]);
      setTags([]);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const page = await api<SavedPage>("bookmarks", {
        account,
        offset,
        search,
        tag,
      });
      if (id !== request.current || page.account !== account) return;
      setItems((previous) =>
        offset ? [...previous, ...page.items] : page.items,
      );
      setTags(page.tags);
      setTotal(page.total);
      setNext(page.next_offset);
    } catch (cause) {
      if (id === request.current) setError(String(cause));
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    setItems([]);
    setTotal(0);
    const timer = setTimeout(() => load(), 200);
    return () => {
      request.current++;
      clearTimeout(timer);
    };
  }, [account, search, tag, revision]);
  return (
    <Card className="bookmark-library">
      <SectionTitle
        title="我的收藏"
        description={total + " 条素材"}
        action={
          <Input
            type="search"
            aria-label="搜索收藏"
            placeholder="搜索素材或作者"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        }
      />
      <div className="bookmark-tags">
        <Button
          size="sm"
          variant={tag ? "ghost" : "secondary"}
          onClick={() => setTag("")}
        >
          全部
        </Button>
        {tags.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={tag === value ? "secondary" : "ghost"}
            onClick={() => setTag(value)}
          >
            {value}
          </Button>
        ))}
      </div>
      {error && (
        <Notice tone="danger">
          {error}
          <Button variant="link" onClick={() => load()}>
            重试
          </Button>
        </Notice>
      )}
      {!items.length && !busy && !error && (
        <EmptyState
          icon={Bookmark}
          title="还没有收藏素材"
          description="在 X 帖子上的收藏入口保存，并添加标签。"
        />
      )}
      <div className="bookmark-records">
        {items.map((item) => (
          <article key={item.post.author + "/" + item.post.id}>
            <div className="bookmark-byline">
              <span>@{item.post.author}</span>
              <small>{time(item.saved_at)}</small>
            </div>
            <button
              className="bookmark-content"
              onClick={() => onSelect(toPost(item))}
            >
              {item.post.text}
            </button>
            <div className="bookmark-tags">
              {item.tags.map((value) => (
                <Badge key={value} variant="secondary">
                  {value}
                </Badge>
              ))}
            </div>
            <PostMetrics post={toPost(item)} />
            <PostRates post={toPost(item)} />
            <details>
              <summary>编辑收藏</summary>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    await api("save_bookmark", {
                      account,
                      post: item.post,
                      tags: String(form.get("tags") || "")
                        .split(/[,，]/)
                        .map((value) => value.trim())
                        .filter(Boolean),
                    });
                    setRevision((value) => value + 1);
                  } catch (cause) {
                    setError(String(cause));
                  }
                }}
              >
                <Input
                  name="tags"
                  defaultValue={item.tags.join(", ")}
                  aria-label={"收藏标签 " + item.post.id}
                />
                <Button size="sm" type="submit">
                  保存标签
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={async () => {
                    try {
                      await api("remove_bookmark", {
                        account,
                        author: item.post.author,
                        id: item.post.id,
                      });
                      setRevision((value) => value + 1);
                    } catch (cause) {
                      setError(String(cause));
                    }
                  }}
                >
                  移除收藏
                </Button>
              </form>
            </details>
          </article>
        ))}
      </div>
      {next != null && (
        <Button variant="outline" disabled={busy} onClick={() => load(next)}>
          {busy ? "读取中…" : "加载更多"}
        </Button>
      )}
    </Card>
  );
}

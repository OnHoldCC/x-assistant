import { Button, Card, Notice, SectionTitle } from "@/components/onhold";
import type { ModelConfig } from "@/features/settings/model-settings";
import { api } from "@/shared/api";
import { time } from "@/shared/operations";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
type Review = {
  id: string;
  at: number;
  provider: string;
  question: string;
  content: string;
  adopted: boolean;
};
export function MemoryPanel({ account }: { account?: string | null }) {
  const [question, setQuestion] = useState(
      "根据我的账号表现，找出有效内容、当前瓶颈和下一步3项运营动作。",
    ),
    [notes, setNotes] = useState(""),
    [context, setContext] = useState<Record<string, unknown> | null>(null),
    [model, setModel] = useState<ModelConfig | null>(null),
    [preview, setPreview] = useState(false),
    [reviews, setReviews] = useState<Review[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const alive = useRef(true),
    native = isTauri() && !localStorage.getItem("onhold-remote");
  useEffect(() => {
    alive.current = true;
    setContext(null);
    setPreview(false);
    setNotes("");
    setReviews([]);
    setError("");
    if (account) {
      api<Record<string, unknown>>("memory_context", { account })
        .then((value) => {
          if (alive.current) {
            setContext(value);
            setNotes(
              (value.preferences as { notes?: string } | null)?.notes || "",
            );
          }
        })
        .catch((cause) => {
          if (alive.current) setError(String(cause));
        });
      api<Review[]>("reviews", { account })
        .then((value) => {
          if (alive.current) setReviews(value);
        })
        .catch(() => {});
    }
    return () => {
      alive.current = false;
    };
  }, [account]);
  return (
    <Card className="memory-panel">
      <SectionTitle
        title="运营记忆与复盘"
        description="记住账号目标、收藏素材和你采用过的建议。"
        action={
          native ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !account}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const path = await invoke<string>("export_memory", {
                    account,
                  });
                  setMessage("已导出到 " + path);
                } catch (cause) {
                  setError(String(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              导出我的数据
            </Button>
          ) : undefined
        }
      />
      <details>
        <summary>账号目标与表达偏好</summary>
        <textarea
          aria-label="运营偏好"
          rows={3}
          maxLength={4000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="账号定位、目标受众、语气和不希望采用的做法"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !account}
          onClick={async () => {
            try {
              await api("save_memory_notes", { account, notes });
              setMessage("运营偏好已保存在本地");
            } catch (cause) {
              setError(String(cause));
            }
          }}
        >
          保存偏好
        </Button>
      </details>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!native || !account) return;
          setBusy(true);
          setError("");
          try {
            const [value, config] = await Promise.all([
              api<Record<string, unknown>>("memory_context", { account }),
              invoke<ModelConfig>("model_config"),
            ]);
            if (alive.current) {
              setContext(value);
              setModel(config);
              setPreview(true);
            }
          } catch (cause) {
            setError(String(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          本次复盘问题
          <textarea
            rows={2}
            required
            maxLength={2000}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <Button type="submit" disabled={busy || !account || !native}>
          {busy ? "处理中…" : "准备复盘"}
        </Button>
      </form>
      {!native && (
        <p className="muted">模型复盘与数据导出请在本机桌面端使用。</p>
      )}
      {preview && context && model && (
        <section className="memory-preview" aria-label="确认模型发送范围">
          <strong>
            发送至{" "}
            {model.provider === "codex_cli" ? "本机 Codex CLI" : model.endpoint}
          </strong>
          <p className="muted">
            本次范围：官方周期指标、最近帖子、收藏摘录、账号偏好和历史复盘。API
            Key 与收益单价不在其中。
          </p>
          <details>
            <summary>查看本次发送的资料</summary>
            <pre>{JSON.stringify(context, null, 2)}</pre>
          </details>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!account) return;
              setBusy(true);
              setError("");
              try {
                await invoke("analyze_memory", {
                  account,
                  question,
                  context,
                  expectedConfig: model,
                });
                if (alive.current) {
                  setReviews(await api<Review[]>("reviews", { account }));
                  setPreview(false);
                  setMessage("复盘已保存在本地");
                }
              } catch (cause) {
                if (alive.current) setError(String(cause));
              } finally {
                if (alive.current) setBusy(false);
              }
            }}
          >
            {busy ? "正在生成复盘…" : "确认并发送"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setPreview(false)}
          >
            取消
          </Button>
        </section>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="memory-reviews">
        {reviews.map((review, index) => (
          <details key={review.id} open={index === 0 || undefined}>
            <summary>
              {time(review.at)} ·{" "}
              {review.provider === "codex_cli" ? "Codex CLI" : "API 模型"} ·{" "}
              {review.adopted ? "已采用" : "未标记采用"}
            </summary>
            <p>{review.question}</p>
            <pre>{review.content}</pre>
            <label className="review-adopted">
              <input
                type="checkbox"
                checked={review.adopted}
                onChange={async (event) => {
                  const adopted = event.target.checked;
                  try {
                    await api("adopt_review", {
                      account,
                      id: review.id,
                      adopted,
                    });
                    setReviews((previous) =>
                      previous.map((item) =>
                        item.id === review.id ? { ...item, adopted } : item,
                      ),
                    );
                  } catch (cause) {
                    setError(String(cause));
                  }
                }}
              />
              我采用了这次复盘建议
            </label>
          </details>
        ))}
      </div>
    </Card>
  );
}

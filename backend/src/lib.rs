pub mod http;
pub mod models;
pub mod news;
pub mod store;
mod ws;

use serde_json::{json, Value};
use store::{now, Store};

pub const DEFAULT_PORT: u16 = 18431;

pub fn dispatch(store: &Store, operation: &str, input: Value) -> Result<Value, String> {
    let account = input
        .get("account")
        .or_else(|| input.get("handle"))
        .and_then(Value::as_str)
        .and_then(|value| store::handle(value).ok());
    let outcome = dispatch_inner(store, operation, input);
    let label = match operation {
        "ingest" => Some("采集数据已更新"),
        "enqueue" => Some("采集任务已排队"),
        "enqueue_rewrite" => Some("一键改写发布已排队"),
        "update_job" => Some("任务已更新"),
        "delete_job" => Some("任务已移除，执行记录已保留"),
        "delete_automation" => Some("自动化任务已删除"),
        "claim" if outcome.as_ref().is_ok_and(|v| !v.is_null()) => Some("任务开始执行"),
        "finish" => Some("任务执行结束"),
        "save_bookmark" => Some("收藏已保存"),
        "remove_bookmark" => Some("收藏已移除"),
        "save_earnings" => Some("收益估算依据已更新"),
        "save_earnings_calibration" => Some("历史收益校准已保存"),
        "save_memory_notes" => Some("运营偏好已更新"),
        _ => None,
    };
    if let Some(label) = label {
        let _ = store.record_event(
            if outcome.is_ok() { "info" } else { "error" },
            operation,
            account.as_deref(),
            if outcome.is_ok() {
                label
            } else {
                "操作失败，请查看对应任务详情"
            },
        );
    }
    outcome
}
fn dispatch_inner(store: &Store, operation: &str, mut input: Value) -> Result<Value, String> {
    if let Some(reference) = input
        .get("account")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
    {
        let name = store.account_handle(reference)?;
        input["account"] = json!(name);
    }
    let text = |key: &str| {
        input
            .get(key)
            .and_then(Value::as_str)
            .ok_or_else(|| format!("缺少 {key}"))
    };
    match operation {
        "learn_x_session" => store.learn_x_session(&input, now()),
        "refresh_x_session" => store.refresh_x_session(&input, now()),
        "forget_x_session" => store.forget_x_session(text("account")?, now()),
        "dashboard" => store.dashboard(
            input.get("account").and_then(Value::as_str),
            input
                .get("days")
                .and_then(Value::as_u64)
                .unwrap_or(7)
                .try_into()
                .map_err(|_| "统计周期无效")?,
            now(),
        ),
        "creator" => store.creator(text("account")?),
        "save_earnings" => store.save_earnings(text("account")?, &input, now()),
        "save_earnings_calibration" => {
            store.save_earnings_calibration(text("account")?, &input, now())
        }
        "bookmarks" => store.bookmarks(
            text("account")?,
            input
                .get("offset")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                .try_into()
                .map_err(|_| "收藏页码无效")?,
            input.get("search").and_then(Value::as_str).unwrap_or(""),
            input.get("tag").and_then(Value::as_str).unwrap_or(""),
        ),
        "save_bookmark" => store.save_bookmark(text("account")?, &input, now()),
        "bookmark" => store.bookmark(text("account")?, text("author")?, text("id")?),
        "remove_bookmark" => store.remove_bookmark(text("account")?, text("author")?, text("id")?),
        "logs" => store.logs(input.get("after").and_then(Value::as_i64).unwrap_or(0)),
        "memory_context" => store.memory_context(text("account")?),
        "save_memory_notes" => store.save_memory_notes(text("account")?, text("notes")?),
        "reviews" => store.reviews(text("account")?),
        "adopt_review" => store.adopt_review(
            text("account")?,
            text("id")?,
            input["adopted"].as_bool().ok_or("复盘反馈无效")?,
        ),
        "connections" => store.connections(now()),
        "jobs" => store.jobs(),
        "job_records" => store.job_records(text("account")?, &input),
        "job_logs" => store.job_logs(text("account")?, text("id")?, &input),
        "update_job" => store.update_job(text("account")?, text("id")?, &input, now()),
        "delete_job" => store.delete_job(text("account")?, text("id")?, now()),
        "enqueue_rewrite" => store.enqueue_rewrite(text("account")?, &input["source"], now()),
        "schedule_publication" => store.schedule_publication(
            text("account")?,
            text("id")?,
            input["run_at"].as_i64().ok_or("发布时间无效")?,
            now(),
        ),
        "retry_rewrite" => store.retry_rewrite(text("account")?, text("id")?, now()),
        "begin_publish" => store.begin_publish(text("id")?, text("client")?, now()),
        "enqueue" => store.enqueue_action(
            text("account")?,
            match input.get("action") {
                Some(action) => action.as_str().ok_or("采集任务类型无效")?,
                None => "capture",
            },
            now(),
        ),
        "pairing" => Ok(
            json!({"token":store.token()?,"endpoint":format!("http://127.0.0.1:{DEFAULT_PORT}"),"protocol":1}),
        ),
        "ingest" => store.ingest(
            serde_json::from_value(input).map_err(|e| e.to_string())?,
            now(),
        ),
        "heartbeat" => store.heartbeat(text("client")?, text("account")?, now()),
        "claim" => store.claim(text("client")?, text("account")?, now()),
        "automation" => store.automation_state(text("account")?),
        "news_queue" => store.news_queue(text("account")?, &input),
        "relationships" => store.relationships(text("account")?, &input),
        "sync_relationships" => store.sync_relationships(text("account")?, &input, now()),
        "save_relationship_page" => store.save_relationship_page(text("account")?, &input, now()),
        "save_automation" => store.save_automation(text("account")?, &input, now()),
        "delete_automation" => store.delete_automation(text("account")?, text("id")?),
        "control_automation" => store.control_automation(
            text("account")?,
            text("id")?,
            input["enabled"].as_bool().ok_or("任务状态无效")?,
            now(),
        ),
        "cancel_job" => store.cancel_job(text("account")?, text("id")?, now()),
        "run_automation" => store.run_automation(text("account")?, text("id")?, now()),
        "for_you_snapshot" => store.record_for_you_snapshot(text("id")?,text("client")?,&input["snapshot"],now()),
        "queue_feed_replies" => {
            store.queue_feed_replies(text("id")?, text("client")?, &input["posts"], now())
        }
        "queue_notification_follows" => store.queue_notification_follows(text("id")?, text("client")?, &input["targets"], now()),
        "automation_progress" => {
            store.automation_progress(text("id")?, text("client")?, text("target")?, now())
        }
        "automation_can_run" => store.automation_can_run(text("account")?, text("task_id")?),
        "automation_block" => store.block_automation(text("account")?, text("reason")?, now()),
        "resume_automation" => store.resume_automation(text("account")?, now()),
        "finish" => {
            if let Some(value) = store.finish_publication(
                text("id")?,
                text("client")?,
                &input["result"],
                input.get("error").and_then(Value::as_str),
                now(),
            )? {
                return Ok(value);
            }
            if let Some(value) = store.finish_automation(
                text("id")?,
                text("client")?,
                &input["result"],
                input.get("error").and_then(Value::as_str),
                now(),
            )? {
                return Ok(value);
            }
            if let Some(value) = store.finish_for_you(
                text("id")?,
                text("client")?,
                input.get("error").and_then(Value::as_str),
                now(),
            )? {
                return Ok(value);
            }
            store.finish(
                text("id")?,
                text("client")?,
                input.get("error").and_then(Value::as_str),
                now(),
            )
        }
        _ => Err("不支持的后台操作".into()),
    }
}

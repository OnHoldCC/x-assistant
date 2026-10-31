use onhold_backend::store::{now, Snapshot, Store};
use rusqlite::{params, Connection};
use serde_json::{json, Value};

#[test]
fn dashboard_task_totals_cover_history_retries_skips_missing_usage_and_account_isolation() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("stats.db");
    let store = Store::open(&path).unwrap();
    let at = now();
    assert_eq!(store.dashboard(None, 7, at).unwrap()["task_stats"], json!([]));
    for account in ["example", "other"] {
        let snapshot: Snapshot = serde_json::from_value(json!({"handle":account,"source":format!("https://x.com/{account}"),"profile":{},"posts":[]})).unwrap();
        store.ingest(snapshot, at).unwrap();
    }
    let db = Connection::open(path).unwrap();
    let insert = |id: &str, account: &str, action: &str, state: &str, input: Value| {
        db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,?,?,?,?,?)",
            params![id,account,action,state,at-60*86_400_000i64,at,input.to_string()]).unwrap();
    };
    for index in 0..130 {
        insert(&format!("capture-{index}"), "example", "capture", if index % 2 == 0 { "completed" } else { "failed" }, json!({}));
    }
    insert("hidden", "example", "capture", "completed", json!({"hidden":true}));
    insert("foreign", "other", "capture", "completed", json!({}));
    let run = |input, output| json!({"usage":{"input_tokens":input,"output_tokens":output,"cached_input_tokens":60,"total_tokens":input+output}});
    insert("reply", "example", "rewrite_publish", "completed", json!({"mode":"reply","scope":"for_you","telemetry":{"generations":[run(100,20),run(200,30)]}}));
    insert("reply-failed", "example", "rewrite_publish", "failed", json!({"mode":"reply","telemetry":{"generations":[run(60,10),{"usage":null}]}}));
    insert("legacy", "example", "rewrite_publish", "failed", json!({"mode":"reply"}));
    insert("pending", "example", "rewrite_publish", "queued", json!({"mode":"reply","stage":"rewrite"}));
    insert("ready", "example", "rewrite_publish", "queued", json!({"mode":"reply","stage":"ready","telemetry":{"generations":[run(50,10)]}}));
    insert("notification", "example", "rewrite_publish", "completed", json!({"mode":"reply","scope":"notifications","telemetry":{"generations":[run(10,7)]}}));
    insert("news-skip", "example", "rewrite_publish", "completed", json!({"mode":"news","stage":"skipped","telemetry":{"generations":[run(8,2)]}}));
    insert("news", "example", "rewrite_publish", "completed", json!({"mode":"news","stage":"sending","telemetry":{"generations":[run(20,5)]}}));
    let stats = store.dashboard(Some("example"), 1, at).unwrap()["task_stats"].clone();
    assert_eq!(stats, store.dashboard(Some("example"), 30, at).unwrap()["task_stats"]);
    let rows = stats.as_array().unwrap();
    let capture = rows.iter().find(|r| r["action"] == "capture").unwrap();
    assert_eq!(capture["completed"], 66);
    assert_eq!(capture["failed"], 65);
    assert_eq!(capture["tokens"], 0);
    assert_eq!(capture["missing_usage"], 0);
    let reply = rows.iter().find(|r| r["input"]["mode"] == "reply" && r["input"]["scope"] == "for_you").unwrap();
    assert_eq!(reply["completed"], 1);
    assert_eq!(reply["failed"], 2);
    assert_eq!(reply["tokens"], 480);
    assert_eq!(reply["missing_usage"], 2);
    let notification = rows.iter().find(|r| r["input"]["scope"] == "notifications").unwrap();
    assert_eq!(notification["tokens"], 17);
    let news = rows.iter().find(|r| r["input"]["mode"] == "news").unwrap();
    assert_eq!(news["completed"], 1);
    assert_eq!(news["failed"], 0);
    assert_eq!(news["tokens"], 35);
    assert_eq!(store.dashboard(Some("other"), 7, at).unwrap()["task_stats"][0]["completed"], 1);
}

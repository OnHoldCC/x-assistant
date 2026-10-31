use onhold_backend::store::Store;
use rusqlite::{params, Connection};
use serde_json::json;

#[test]
fn records_page_all_history_and_keep_search_state_and_account_scoped() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("records.db");
    let store = Store::open(&file).unwrap();
    let db = Connection::open(&file).unwrap();
    for index in 0..132 {
        db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input,error) VALUES(?,?,'capture',?, ?,?, ?,?)", params![format!("job-{index:03}"), if index==131 {"other"} else {"example"},if index%2==0 {"failed"} else {"completed"},index,index,if index==130 {"{\"hidden\":true}"} else {"{}"},if index==0 {"literal % search"} else {""}]).unwrap();
    }
    let first = store.job_records("example", &json!({})).unwrap();
    assert_eq!(first["total"], 130);
    assert_eq!(first["items"].as_array().unwrap().len(), 20);
    assert_eq!(first["items"][0]["id"], "job-129");
    let last = store.job_records("example", &json!({"offset":120})).unwrap();
    assert_eq!(last["items"].as_array().unwrap().len(), 10);
    assert_eq!(last["items"][9]["id"], "job-000");
    assert_eq!(store.job_records("example", &json!({"offset":9999})).unwrap()["offset"],120);
    assert_eq!(store.job_records("example", &json!({"state":"failed"})).unwrap()["total"],65);
    assert_eq!(store.job_records("example", &json!({"search":"%"})).unwrap()["total"],1);
    assert_eq!(store.job_records("example", &json!({"search":"采集账号"})).unwrap()["total"],130);
    assert!(store.job_records("example", &json!({"offset":-1})).is_err());
    assert!(store.job_records("example", &json!({"state":"unknown"})).is_err());
    db.execute("UPDATE jobs SET input=json_set(input,'$.task_id','plan') WHERE id='job-120'",[]).unwrap();
    assert_eq!(store.job_records("example", &json!({"source":"automation"})).unwrap()["total"],1);
    assert_eq!(store.job_records("example", &json!({"source":"other"})).unwrap()["total"],129);
    assert!(store.job_records("example", &json!({"source":"invalid"})).is_err());

    db.execute("UPDATE jobs SET input=json_set(input,'$.source.url','https://x.com/writer/status/56789') WHERE id='job-120'",[]).unwrap();
    assert_eq!(store.job_records("example", &json!({"search":"https://x.com/writer/status/56789"})).unwrap()["total"],1);
    assert!(store.job_logs("other", "job-000", &json!({})).is_err());
}

#[test]
fn records_filter_task_types_and_displayed_states_before_pagination() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("filters.db");
    let store = Store::open(&file).unwrap();
    let db = Connection::open(&file).unwrap();
    let insert = |id: &str, account: &str, action: &str, state: &str, input: serde_json::Value| {
        db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,?,?,1,1,?)",
            params![id,account,action,state,input.to_string()]).unwrap();
    };
    for action in ["capture", "capture_analytics", "capture_creator", "capture_relationships", "capture_for_you", "capture_notifications", "follow_back", "unfollow", "rewrite_publish"] {
        insert(action, "example", action, "completed", json!({}));
        let rows = store.job_records("example", &json!({"task_type":action})).unwrap();
        assert_eq!(rows["total"], 1, "{action}");
        assert_eq!(rows["items"][0]["id"], action);
    }
    for (kind, action, input) in [
        ("capture_notification_follows", "capture_notifications", json!({"publication_mode":"follow_back"})),
        ("reply_for_you", "rewrite_publish", json!({"mode":"reply","scope":"for_you"})),
        ("reply_notifications", "rewrite_publish", json!({"mode":"reply","scope":"notifications"})),
        ("replicate", "rewrite_publish", json!({"mode":"replicate"})),
        ("similar", "rewrite_publish", json!({"mode":"similar"})),
    ] {
        insert(kind, "example", action, "completed", input);
        let rows = store.job_records("example", &json!({"task_type":kind})).unwrap();
        assert_eq!(rows["total"], 1, "{kind}");
        assert_eq!(rows["items"][0]["id"], kind);
    }
    for index in 0..23 {
        let state = if index < 21 { "failed" } else { "completed" };
        insert(&format!("news-{index:02}"), "example", "rewrite_publish", state,
            json!({"mode":"news","task_id":"plan","stage":if index==22 {"skipped"} else {"sending"},"text":format!("News item {index:02}")}));
    }
    insert("foreign", "other", "rewrite_publish", "completed", json!({"mode":"news"}));
    insert("hidden", "example", "rewrite_publish", "completed", json!({"mode":"news","hidden":true}));
    let page = store.job_records("example", &json!({"task_type":"news","offset":20})).unwrap();
    assert_eq!(page["total"], 23);
    assert_eq!(page["items"].as_array().unwrap().len(), 3);
    for (state, total) in [("failed", 21), ("completed", 1), ("skipped", 1)] {
        let rows = store.job_records("example", &json!({"task_type":"news","state":state,"source":"automation","offset":200})).unwrap();
        assert_eq!(rows["total"], total, "{state}");
        assert_eq!(rows["offset"], if total>20 {20} else {0});
    }
    assert_eq!(store.job_records("example", &json!({"task_type":"news","state":"failed","source":"automation","search":"News item 03"})).unwrap()["total"], 1);
    assert_eq!(store.job_records("example", &json!({"task_type":"news","source":"other"})).unwrap()["total"], 0);
    for kind in ["capture_notifications", "rewrite_publish"] {
        assert_eq!(store.job_records("example", &json!({"task_type":kind})).unwrap()["total"], 1, "base types exclude their specialized tasks");
    }
    for invalid in [json!("unknown"), json!(23)] {
        assert!(store.job_records("example", &json!({"task_type":invalid})).is_err());
    }
}

#[test]
fn detailed_logs_persist_real_transitions_model_usage_failures_and_cleanup() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("logs.db");
    let store = Store::open(&file).unwrap();
    let db = Connection::open(&file).unwrap();
    db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES('task','example','rewrite_publish','queued',1000,1000,'{\"stage\":\"rewrite\",\"text\":\"private draft never copied into logs\"}')",[]).unwrap();
    db.execute("UPDATE jobs SET state='rewriting',updated_at=2000 WHERE id='task'",[]).unwrap();
    store.record_generation("task",2000,3000,1000,Some(&json!({"input_tokens":100,"output_tokens":20,"total_tokens":120}))).unwrap();
    db.execute("UPDATE jobs SET state='queued',input=json_set(input,'$.stage','ready'),updated_at=4000 WHERE id='task'",[]).unwrap();
    db.execute("UPDATE jobs SET state='running',updated_at=5000 WHERE id='task'",[]).unwrap();
    db.execute("UPDATE jobs SET input=json_set(input,'$.stage','sending'),updated_at=6000 WHERE id='task'",[]).unwrap();
    db.execute("UPDATE jobs SET state='failed',error='X 回执超时',updated_at=7000 WHERE id='task'",[]).unwrap();
    db.execute("UPDATE jobs SET state='completed',result='{\"url\":\"https://x.com/example/status/123\",\"tab_closed\":false,\"cleanup_warning\":\"页面仍有草稿，已保留\"}',updated_at=8000 WHERE id='task'",[]).unwrap();
    db.execute("UPDATE jobs SET result=json_set(result,'$.tab_closed',json('true'),'$.cleanup_warning',null) WHERE id='task'",[]).unwrap();
    let logs=store.job_logs("example","task",&json!({})).unwrap();
    let messages=logs["items"].as_array().unwrap().iter().map(|row|row["message"].as_str().unwrap()).collect::<Vec<_>>().join("\n");
    for expected in ["任务已创建","开始调用模型","120 tokens","通过校验","向 X 发送","X 回执超时","回执已确认","页面仍有草稿","清空并关闭"] {assert!(messages.contains(expected),"missing {expected}: {messages}");}
    assert!(!messages.contains("private draft"));
    assert_eq!(logs["items"][2]["at"],3000);
    db.execute("UPDATE jobs SET state=state,input=input,result=result WHERE id='task'",[]).unwrap();
    assert_eq!(store.job_logs("example","task",&json!({})).unwrap()["total"],logs["total"]);
    for index in 0..25 {db.execute("UPDATE jobs SET state=?,updated_at=? WHERE id='task'",params![if index%2==0 {"queued"} else {"running"},9000+index]).unwrap();}
    let page=store.job_logs("example","task",&json!({"offset":20})).unwrap();
    assert_eq!(page["offset"],20);
    assert!(page["items"].as_array().unwrap().len()<=20);
    drop(store);
    assert_eq!(Store::open(file).unwrap().job_logs("example","task",&json!({"offset":20})).unwrap(),page);
}

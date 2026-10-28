use onhold_backend::{
    dispatch,
    store::{Snapshot, Store},
};
use serde_json::json;
use uuid::Uuid;

fn snapshot(views: i64, likes: i64, approximate: bool) -> Snapshot {
    serde_json::from_value(json!({"handle":"Example","source":"https://x.com/Example","profile":{"followers":{"value":100,"raw":"100"}},"posts":[{"id":"123","author":"example","text":"A real #test post","created_at":"2026-10-27T00:00:00Z","metrics":{"views":{"value":views,"approximate":approximate},"likes":{"value":likes}}}]})).unwrap()
}
#[test]
fn snapshot_baselines_missing_zero_precision_and_persistence() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("data.sqlite3");
    let db = Store::open(&file).unwrap();
    let at = 1_793_059_200_000;
    db.ingest(snapshot(1000, 0, true), at).unwrap();
    let first = db.dashboard(None, 7, at).unwrap();
    assert!(first["metrics"]["views"]["delta"].is_null());
    assert_eq!(first["metrics"]["likes"]["value"], 0);
    assert!(first["metrics"]["replies"]["value"].is_null());
    db.ingest(snapshot(1100, 2, true), at + 60_000).unwrap();
    assert_eq!(
        db.dashboard(None, 7, at + 60_000).unwrap()["metrics"]["views"]["delta"],
        100
    );
    db.ingest(snapshot(1098, 2, false), at + 120_000).unwrap();
    assert!(db.dashboard(None, 7, at + 120_000).unwrap()["metrics"]["views"]["delta"].is_null());
    let token = db.token().unwrap();
    drop(db);
    let db = Store::open(file).unwrap();
    assert_eq!(db.token().unwrap(), token);
    assert_eq!(
        db.dashboard(None, 7, at + 120_000).unwrap()["posts"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
#[test]
fn untrusted_snapshots_roll_back_and_tasks_belong_to_the_claiming_client() {
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(dir.path().join("data.db")).unwrap();
    let at = 1_793_059_200_000;
    let mut invalid = snapshot(1, 1, false);
    invalid.posts[0].author = "another".into();
    assert!(db.ingest(invalid, at).is_err());
    assert!(db.dashboard(None, 7, at).unwrap()["accounts"]
        .as_array()
        .unwrap()
        .is_empty());
    assert!(db.enqueue("example", at).is_err());
    let client = Uuid::new_v4().to_string();
    db.heartbeat(&client, "example", at).unwrap();
    let id = db.enqueue("example", at).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_string();
    assert!(db.enqueue("example", at).is_err());
    assert_eq!(
        db.claim(&client, "another", at + 1).unwrap(),
        serde_json::Value::Null
    );
    assert_eq!(db.claim(&client, "example", at + 1).unwrap()["id"], id);
    assert!(db
        .finish(&id, &Uuid::new_v4().to_string(), None, at + 2)
        .is_err());
    db.finish(&id, &client, None, at + 3).unwrap();
    assert_eq!(db.jobs().unwrap()[0]["state"], "completed");
    assert!(db.finish(&id, &client, None, at + 4).is_err());
    assert!(dispatch(&db, "execute_javascript", json!({})).is_err());
    assert!(db.dashboard(None, 90, at).is_err());
}

#[test]
fn websocket_login_state_gates_scheduled_tasks_and_disconnect_is_immediate() {
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(dir.path().join("data.db")).unwrap();
    let at = 1_793_059_200_000;
    let client = Uuid::new_v4().to_string();
    db.ingest(snapshot(10, 1, false), at).unwrap();
    db.session_status(&client, "example", "logged_in", "", at)
        .unwrap();
    assert!(!db.schedule_capture("example", at + 299_999).unwrap());
    assert!(
        db.schedule_capture("example", at + 300_000).is_err(),
        "stale sessions cannot receive jobs"
    );
    db.session_status(&client, "example", "logged_in", "", at + 300_000)
        .unwrap();
    assert!(db.schedule_capture("example", at + 300_000).unwrap());
    assert!(
        !db.schedule_capture("example", at + 300_001).unwrap(),
        "scheduled jobs do not duplicate"
    );
    let job = db.claim(&client, "example", at + 300_002).unwrap();
    db.finish(job["id"].as_str().unwrap(), &client, None, at + 300_003)
        .unwrap();
    db.session_status(
        &client,
        "example",
        "logged_out",
        "请重新登录 X",
        at + 600_000,
    )
    .unwrap();
    assert!(db.schedule_capture("example", at + 600_000).is_err());
    let status = db.connections(at + 600_001).unwrap();
    assert_eq!(status[0]["login_state"], "logged_out");
    assert_eq!(status[0]["transport"], "websocket");
    db.session_disconnected(&client).unwrap();
    assert_eq!(db.connections(at + 600_002).unwrap()[0]["online"], false);
    assert!(db
        .session_status(&client, "example", "anything", "", at)
        .is_err());
}

#[test]
fn official_analytics_tasks_keep_their_type_and_reject_arbitrary_actions() {
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(dir.path().join("data.db")).unwrap();
    let client = Uuid::new_v4().to_string();
    let at = onhold_backend::store::now();
    db.session_status(&client, "example", "logged_in", "", at)
        .unwrap();
    assert!(dispatch(
        &db,
        "enqueue",
        json!({"account":"example","action":"javascript"})
    )
    .is_err());
    assert!(dispatch(&db, "enqueue", json!({"account":"example","action":7})).is_err());
    assert!(
        dispatch(
            &db,
            "enqueue",
            json!({"account":"example","action":"capture_analytics"})
        )
        .is_err(),
        "old plugin must not accept official analytics jobs"
    );
    db.set_analytics_support(&client, true).unwrap();
    let queued = dispatch(
        &db,
        "enqueue",
        json!({"account":"example","action":"capture_analytics"}),
    )
    .unwrap();
    assert!(db.enqueue("example", at + 1).is_err());
    assert!(db.claim(&client, "other", at + 1).unwrap().is_null());
    let legacy = Uuid::new_v4().to_string();
    db.session_status(&legacy, "example", "logged_in", "", at)
        .unwrap();
    assert!(
        db.claim(&legacy, "example", at + 1).unwrap().is_null(),
        "old plugin cannot claim another session's analytics task"
    );
    let task = db.claim(&client, "example", at + 2).unwrap();
    assert_eq!(task["id"], queued["id"]);
    assert_eq!(task["action"], "capture_analytics");
    db.finish(
        task["id"].as_str().unwrap(),
        &client,
        Some("账号无分析页权限"),
        at + 3,
    )
    .unwrap();
    assert_eq!(db.jobs().unwrap()[0]["state"], "failed");
    db.enqueue_action("example", "capture_analytics", at + 4)
        .unwrap();
    assert_eq!(
        db.claim(&client, "example", at + 5).unwrap()["action"],
        "capture_analytics"
    );
}

#[test]
fn analytics_periods_keep_latest_per_account_without_merging_28_and_30_days() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("data.db");
    let db = Store::open(&file).unwrap();
    let at = onhold_backend::store::now();
    let official = |period: &str, value: i64| -> Snapshot {
        serde_json::from_value(json!({"handle":"example","source":"https://x.com/i/account_analytics","posts":[],"analytics":{"account":"example","period":period,"metrics":{"impressions":{"value":value}}}})).unwrap()
    };
    for (index, period) in ["1D", "7D", "2W", "4W", "30D", "3M"].iter().enumerate() {
        db.ingest(official(period, index as i64), at + index as i64)
            .unwrap();
    }
    db.ingest(official("7D", 70), at + 10).unwrap();
    let mut other = official("7D", 999);
    other.handle = "other".into();
    other.analytics.as_mut().unwrap()["account"] = json!("other");
    db.ingest(other, at + 11).unwrap();
    let mut invalid = official("4W", 1);
    invalid.analytics.as_mut().unwrap()["period_key"] = json!("30d");
    assert!(db.ingest(invalid, at + 12).is_err());
    assert!(db.ingest(official("7D", -1), at + 12).is_err());
    for (field, value) in [
        ("available_periods", json!(["not-a-period"])),
        ("verified_only", json!("true")),
    ] {
        let mut invalid = official("7D", 1);
        invalid.analytics.as_mut().unwrap()[field] = value;
        assert!(db.ingest(invalid, at + 12).is_err());
    }
    for (field, value) in [("raw", json!(["1"])), ("approximate", json!("false"))] {
        let mut invalid = official("7D", 1);
        invalid.analytics.as_mut().unwrap()["metrics"]["impressions"][field] = value;
        assert!(db.ingest(invalid, at + 12).is_err());
    }
    // A database written by an older desktop app only has the raw period label.
    rusqlite::Connection::open(&file).unwrap().execute("INSERT INTO analytics VALUES(?,?,?)", rusqlite::params!["example", at + 13, json!({"data":{"account":"example","period":"4W","metrics":{"impressions":{"value":28}}},"observed_at":at+13,"source":"https://x.com/i/account_analytics"}).to_string()]).unwrap();
    drop(db);
    let data = Store::open(file)
        .unwrap()
        .dashboard(Some("example"), 7, at + 14)
        .unwrap();
    let periods = &data["analytics_periods"];
    assert_eq!(periods.as_object().unwrap().len(), 6);
    assert_eq!(periods["1d"]["data"]["metrics"]["impressions"]["value"], 0);
    assert_eq!(periods["7d"]["data"]["metrics"]["impressions"]["value"], 70);
    assert_eq!(
        periods["28d"]["data"]["metrics"]["impressions"]["value"],
        28
    );
    assert_eq!(periods["30d"]["data"]["metrics"]["impressions"]["value"], 4);
    assert!(
        data["metrics"]["views"]["value"].is_null(),
        "official impressions are separate from observed post views"
    );
}

#[test]
fn collection_creator_memory_and_logs_stay_scoped_and_survive_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("data.db");
    let db = Store::open(&file).unwrap();
    let at = onhold_backend::store::now();
    db.ingest(snapshot(100, 2, false), at).unwrap();
    let saved = json!({"post":{"id":"456","author":"writer","url":"https://x.com/writer/status/456","text":"Useful reference","metrics":{"views":{"value":100}}},"tags":["选题","案例"]});
    db.save_bookmark("example", &saved, at).unwrap();
    assert_eq!(db.bookmarks("example", 0, "", "选题").unwrap()["total"], 1);
    assert_eq!(db.bookmarks("other", 0, "", "").unwrap()["total"], 0);
    assert_eq!(
        db.bookmark("example", "writer", "456").unwrap()["saved"],
        true
    );
    let mut invalid = saved.clone();
    invalid["post"]["url"] = json!("https://evil.example");
    assert!(db.save_bookmark("example", &invalid, at).is_err());
    let mut official = snapshot(101, 2, false);
    official.creator = Some(
        json!({"account":"example","state":"ineligible","verified_followers":{"current":{"value":492},"target":500},"verified_impressions":{"current":{"value":291},"target":500000,"days":90}}),
    );
    db.ingest(official, at + 1).unwrap();
    db.save_earnings("example", &json!({"qualified30":1000,"rpmCny":2}), at)
        .unwrap();
    assert!(db.creator("other").unwrap()["snapshot"].is_null());
    db.save_memory_notes("example", "面向独立开发者，用中文讲真实案例")
        .unwrap();
    let review = db
        .save_review("example", "codex_cli", "问题", "用真实案例做下一次选题实验")
        .unwrap();
    assert!(db
        .adopt_review("other", review["id"].as_str().unwrap(), true)
        .is_err());
    db.adopt_review("example", review["id"].as_str().unwrap(), true)
        .unwrap();
    let mut stream = db.subscribe_logs();
    db.record_event("info", "test", Some("example"), "采集完成")
        .unwrap();
    assert_eq!(stream.try_recv().unwrap()["message"], "采集完成");
    drop(db);
    let db = Store::open(file).unwrap();
    let memory = db.memory_context("example").unwrap();
    assert_eq!(memory["account"], "example");
    assert_eq!(memory["previous_reviews"][0]["adopted"], true);
    assert!(memory["preferences"]["notes"]
        .as_str()
        .unwrap()
        .contains("独立开发者"));
    let exported = db.export_account("example").unwrap();
    assert_eq!(exported["bookmarks"].as_array().unwrap().len(), 1);
    assert!(!exported.to_string().contains("bridge-token"));
    assert_eq!(db.logs(0).unwrap().as_array().unwrap().len(), 1);
}

#[test]
fn automation_is_opt_in_capability_gated_and_limits_pause_every_write_until_manual_resume() {
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(dir.path().join("data.db")).unwrap();
    let at = onhold_backend::store::now();
    db.ingest(snapshot(1000, 2, false), at).unwrap();
    let client = Uuid::new_v4().to_string();
    db.session_status(&client, "example", "logged_in", "", at)
        .unwrap();
    db.set_analytics_support(&client, true).unwrap();
    let config = json!({"action":"follow_back","scope":"automation_owned","targets":[],"interval_minutes":60,"limit":2,"after_days":7});
    let task = db.save_automation("example", &config, at).unwrap();
    let id = task["id"].as_str().unwrap();
    assert!(db.run_automation("example", id, at).is_err());
    db.control_automation("example", id, true, at).unwrap();
    assert!(db.run_automation("example", id, at).is_err());
    db.set_automation_support(&client, true).unwrap();
    db.run_automation("example", id, at).unwrap();
    let legacy = Uuid::new_v4().to_string();
    db.session_status(&legacy, "example", "logged_in", "", at)
        .unwrap();
    db.set_analytics_support(&legacy, true).unwrap();
    assert!(db.claim(&legacy, "example", at).unwrap().is_null());
    let job = db.claim(&client, "example", at).unwrap();
    db.automation_progress(job["id"].as_str().unwrap(), &client, "writer", at + 1)
        .unwrap();
    db.finish_automation(
        job["id"].as_str().unwrap(),
        &client,
        &json!({"completed":["writer"],"blocked":true,"reason":"关注受限"}),
        Some("关注受限"),
        at + 2,
    )
    .unwrap();
    assert!(db.automation_state("example").unwrap()["block"].is_object());
    assert_eq!(
        db.dashboard(Some("example"), 7, at + 2).unwrap()["automation_block"]["reason"],
        "关注受限"
    );
    assert_eq!(
        db.automation_can_run("example", id).unwrap()["allowed"],
        false
    );
    assert!(db.run_automation("example", id, at + 300000).is_err());
    assert!(db.automation_state("other").unwrap()["block"].is_null());
    db.resume_automation("example", at + 300001).unwrap();
    assert_eq!(
        db.automation_can_run("example", id).unwrap()["allowed"],
        true
    );
    let mut cancel = config.clone();
    cancel["action"] = json!("unfollow");
    let cancel = db.save_automation("example", &cancel, at).unwrap();
    let cancel = cancel["id"].as_str().unwrap();
    db.control_automation("example", cancel, true, at).unwrap();
    db.session_status(&client, "example", "logged_in", "", at + 8 * 86400000)
        .unwrap();
    db.set_automation_support(&client, true).unwrap();
    let queued = db
        .run_automation("example", cancel, at + 8 * 86400000)
        .unwrap();
    assert_eq!(queued["queued"], true);
    let job = db.claim(&client, "example", at + 8 * 86400000).unwrap();
    assert_eq!(job["input"]["targets"], json!(["writer"]));
}

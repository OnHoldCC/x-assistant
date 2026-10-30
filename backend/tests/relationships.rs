use onhold_backend::store::{Snapshot, Store};
use serde_json::{json, Value};

fn setup() -> (tempfile::TempDir, Store, String, i64) {
    let dir = tempfile::tempdir().unwrap();
    let db = Store::open(dir.path().join("data.db")).unwrap();
    let at = onhold_backend::store::now();
    let snapshot:Snapshot=serde_json::from_value(json!({"uid":"1900000000000000123","handle":"example","source":"https://x.com/example","posts":[]})).unwrap();
    db.ingest(snapshot, at).unwrap();
    let client = uuid::Uuid::new_v4().to_string();
    db.session_status(&client, "example", "logged_in", "", at)
        .unwrap();
    db.set_analytics_support(&client, true).unwrap();
    let version: Value =
        serde_json::from_str(include_str!("../../extension/manifest.json")).unwrap();
    db.set_extension_version(&client, version["version"].as_str().unwrap())
        .unwrap();
    (dir, db, client, at)
}
fn item(uid: &str, name: &str, following: Value) -> Value {
    json!({"uid":uid,"handle":name,"name":name,"following":following,"followed_by":null})
}
fn start(db: &Store, client: &str, kind: &str, at: i64) -> Value {
    db.sync_relationships("example", &json!({"kind":kind}), at)
        .unwrap();
    db.claim(client, "example", at).unwrap()
}
fn save(
    db: &Store,
    client: &str,
    job: &Value,
    cursor: Value,
    next: Value,
    items: Value,
    at: i64,
) -> Result<Value, String> {
    db.save_relationship_page("example",&json!({"id":job["id"],"client":client,"cursor":cursor,"next_cursor":next,"complete":next.is_null(),"items":items}),at)
}

#[test]
fn relationship_pages_are_owned_atomic_resumable_and_do_not_guess_missing_flags() {
    let (_dir, db, client, at) = setup();
    let job = start(&db, &client, "followers", at);
    let users = json!([
        item("1900000000000000124", "alice", json!(false)),
        item("1900000000000000125", "bob", Value::Null)
    ]);
    assert!(save(
        &db,
        "wrong-client",
        &job,
        Value::Null,
        json!("next"),
        users.clone(),
        at
    )
    .is_err());
    save(
        &db,
        &client,
        &job,
        Value::Null,
        json!("next"),
        users.clone(),
        at,
    )
    .unwrap();
    assert!(save(&db, &client, &job, Value::Null, json!("next"), users, at).is_err());
    let list = db
        .relationships("example", &json!({"filter":"follow_back"}))
        .unwrap();
    assert_eq!(list["total"], 1);
    assert_eq!(list["items"][0]["handle"], "alice");
    assert_eq!(
        db.relationships("example", &json!({"filter":"followers","search":"bo"}))
            .unwrap()["total"],
        1
    );
    let invalid = json!([
        item("1900000000000000126", "charlie", json!(false)),
        item("invalid", "bad", json!(false))
    ]);
    assert!(save(&db, &client, &job, json!("next"), Value::Null, invalid, at).is_err());
    assert_eq!(
        db.relationships("example", &json!({"filter":"followers"}))
            .unwrap()["total"],
        2
    );
    db.finish(job["id"].as_str().unwrap(), &client, None, at)
        .unwrap();
    let resume = start(&db, &client, "followers", at + 1);
    assert_eq!(resume["input"]["cursor"], "next");
    assert_eq!(resume["input"]["generation"], job["input"]["generation"]);
    save(
        &db,
        &client,
        &resume,
        json!("next"),
        Value::Null,
        json!([]),
        at + 1,
    )
    .unwrap();
    db.finish(resume["id"].as_str().unwrap(), &client, None, at + 1)
        .unwrap();
    let refresh = start(&db, &client, "followers", at + 2);
    assert_ne!(refresh["input"]["generation"], job["input"]["generation"]);
    save(
        &db,
        &client,
        &refresh,
        Value::Null,
        json!("last"),
        json!([item("1900000000000000124", "alice", json!(false))]),
        at + 2,
    )
    .unwrap();
    assert_eq!(
        db.relationships("example", &json!({"filter":"followers"}))
            .unwrap()["total"],
        2,
        "partial refresh never removes unseen people"
    );
    save(
        &db,
        &client,
        &refresh,
        json!("last"),
        Value::Null,
        json!([]),
        at + 3,
    )
    .unwrap();
    assert_eq!(
        db.relationships("example", &json!({"filter":"followers"}))
            .unwrap()["total"],
        1
    );
    assert!(db
        .relationships("example", &json!({"filter":"bogus"}))
        .is_err());
    assert!(db
        .save_relationship_page("other", &json!({"id":refresh["id"],"client":client}), at)
        .is_err());
}

#[test]
fn version_four_upgrades_relationship_tables_without_losing_existing_accounts() {
    let (dir, db, _client, _at) = setup();
    drop(db);
    let raw = rusqlite::Connection::open(dir.path().join("data.db")).unwrap();
    raw.execute_batch(
        "DROP TABLE relationships; DROP TABLE relationship_runs; PRAGMA user_version=4;",
    )
    .unwrap();
    drop(raw);
    let db = Store::open(dir.path().join("data.db")).unwrap();
    let list = db.relationships("example", &json!({})).unwrap();
    assert_eq!(list["total"], 0);
    assert_eq!(list["account"], "example");
}

#[test]
fn automatic_follow_back_uses_synced_confirmed_targets_and_updates_the_list() {
    let (_dir, db, client, at) = setup();
    db.set_automation_support(&client, true).unwrap();
    let plan=db.save_automation("example",&json!({"action":"follow_back","scope":"automation_owned","targets":[],"interval_minutes":60,"limit":5,"after_days":7}),at).unwrap();
    let plan_id = plan["id"].as_str().unwrap();
    db.control_automation("example", plan_id, true, at).unwrap();
    assert!(db
        .run_automation("example", plan_id, at)
        .unwrap_err()
        .contains("先同步"));
    let sync = start(&db, &client, "followers", at);
    save(
        &db,
        &client,
        &sync,
        Value::Null,
        Value::Null,
        json!([
            item("1900000000000000124", "alice", json!(false)),
            item("1900000000000000125", "unknown", Value::Null)
        ]),
        at,
    )
    .unwrap();
    db.finish(sync["id"].as_str().unwrap(), &client, None, at)
        .unwrap();
    db.run_automation("example", plan_id, at + 1).unwrap();
    let job = db.claim(&client, "example", at + 1).unwrap();
    assert_eq!(job["input"]["targets"], json!(["alice"]));
    db.automation_progress(job["id"].as_str().unwrap(), &client, "alice", at + 2)
        .unwrap();
    assert_eq!(
        db.relationships("example", &json!({"filter":"follow_back"}))
            .unwrap()["total"],
        0
    );
}

#[test]
fn notification_follow_back_is_owned_bounded_deduplicated_and_separate_from_replies() {
    let (_dir, db, client, at) = setup();
    db.set_automation_support(&client, true).unwrap();
    let config = json!({"action":"follow_back","scope":"notifications","targets":[],"interval_minutes":60,"limit":2,"after_days":7});
    let task = db.save_automation("example", &config, at).unwrap()["id"].as_str().unwrap().to_owned();
    db.control_automation("example", &task, true, at).unwrap();
    db.set_extension_version(&client, "1.5.13").unwrap();
    assert!(db.run_automation("example", &task, at).unwrap_err().contains("1.5.14"));
    db.set_extension_version(&client, "1.5.14").unwrap();
    let discovery = db.run_automation("example", &task, at).unwrap()["id"].as_str().unwrap().to_owned();
    let capture = db.claim(&client, "example", at).unwrap();
    assert_eq!(capture["action"], "capture_notifications");
    assert_eq!(capture["input"]["publication_mode"], "follow_back");
    assert!(db.queue_feed_replies(&discovery, &client, &json!([]), at).is_err());
    assert!(db.queue_notification_follows(&discovery, "wrong", &json!(["alice"]), at).is_err());
    assert!(db.queue_notification_follows(&discovery, &client, &json!(["alice","example"]), at).is_err());
    assert!(db.queue_notification_follows(&discovery, &client, &json!(["alice","bob","charlie"]), at).is_err());
    assert_eq!(db.jobs().unwrap().as_array().unwrap().len(), 1, "invalid batches roll back completely");
    let queued = db.queue_notification_follows(&discovery, &client, &json!(["alice","alice","bob"]), at).unwrap();
    assert_eq!(queued["queued"], 2);
    assert_eq!(queued["skipped"], 1);
    assert_eq!(db.queue_notification_follows(&discovery, &client, &json!(["alice"]), at).unwrap()["queued"], 0);
    assert!(db.queue_notification_follows(&discovery, &client, &json!(["charlie"]), at).is_err());
    db.control_automation("example", &task, false, at).unwrap();
    assert!(db.queue_notification_follows(&discovery, &client, &json!([]), at).is_err());
    db.finish_for_you(&discovery, &client, None, at).unwrap();
    db.control_automation("example", &task, true, at).unwrap();
    let follow = db.claim(&client, "example", at).unwrap();
    assert_eq!(follow["action"], "follow_back");
    assert_eq!(follow["input"]["targets"], json!(["alice","bob"]));
    assert_eq!(follow["input"]["discovery_job"], discovery);
    assert!(db.claim_rewrite(at).unwrap().is_null(), "follow notifications never invoke a text model");
    assert!(db.automation_progress(follow["id"].as_str().unwrap(), &client, "charlie", at+1).is_err());
    db.automation_progress(follow["id"].as_str().unwrap(), &client, "alice", at+1).unwrap();
    assert_eq!(db.jobs().unwrap().as_array().unwrap().iter().find(|job|job["id"]==follow["id"]).unwrap()["result"]["completed"], json!(["alice"]));
    let mut invalid = config;
    invalid["action"] = json!("unfollow");
    assert!(db.save_automation("example", &invalid, at).is_err(), "follow notifications cannot authorize unfollow");
}

#[test]
fn relationship_search_and_pagination_keep_unknown_states_separate() {
    let (_dir, db, client, at) = setup();
    let job = start(&db, &client, "following", at);
    let users:Vec<Value>=(0..51).map(|i|json!({"uid":format!("190000000000001{:04}",i),"handle":format!("person{:02}",i),"name":"Person","following":true,"followed_by":if i==50{Value::Null}else{json!(false)}})).collect();
    save(
        &db,
        &client,
        &job,
        Value::Null,
        Value::Null,
        json!(users),
        at,
    )
    .unwrap();
    let first = db
        .relationships("example", &json!({"filter":"following"}))
        .unwrap();
    assert_eq!(first["total"], 51);
    assert_eq!(first["items"].as_array().unwrap().len(), 50);
    assert_eq!(first["next_offset"], 50);
    let last = db
        .relationships("example", &json!({"filter":"following","offset":50}))
        .unwrap();
    assert_eq!(last["items"][0]["handle"], "person50");
    assert!(last["next_offset"].is_null());
    assert_eq!(
        db.relationships("example", &json!({"filter":"not_following_back"}))
            .unwrap()["total"],
        50
    );
    assert_eq!(
        db.relationships(
            "example",
            &json!({"filter":"following","search":"person25"})
        )
        .unwrap()["total"],
        1
    );
}

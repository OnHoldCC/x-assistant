use onhold_backend::{
    dispatch,
    store::{now, Snapshot, Store},
};
use serde_json::{json, Value};
use uuid::Uuid;

fn setup() -> (tempfile::TempDir, Store, String, i64) {
    let directory = tempfile::tempdir().unwrap();
    let store = Store::open(directory.path().join("data.db")).unwrap();
    let at = now();
    let snapshot: Snapshot = serde_json::from_value(
        json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]}),
    )
    .unwrap();
    store.ingest(snapshot, at).unwrap();
    let client = Uuid::new_v4().to_string();
    store
        .session_status(&client, "example", "logged_in", "", at)
        .unwrap();
    store.set_automation_support(&client, true).unwrap();
    store.set_analytics_support(&client, true).unwrap();
    let manifest: Value =
        serde_json::from_str(include_str!("../../extension/manifest.json")).unwrap();
    store
        .set_extension_version(&client, manifest["version"].as_str().unwrap())
        .unwrap();
    (directory, store, client, at)
}

#[test]
fn automation_crud_is_owned_validated_and_never_edits_active_work() {
    let (_directory, store, client, at) = setup();
    let mut config = json!({"action":"follow_back","scope":"manual","targets":["writer"],"interval_minutes":60,"limit":2,"after_days":7});
    let created = store.save_automation("example", &config, at).unwrap();
    let id = created["id"].as_str().unwrap();
    store.control_automation("example", id, true, at).unwrap();
    config["id"] = json!(id);
    config["limit"] = json!(3);
    assert!(store.save_automation("other", &config, at).is_err());
    store.save_automation("example", &config, at).unwrap();
    let plan = &store.automation_state("example").unwrap()["tasks"][0];
    assert_eq!(plan["enabled"], false);
    assert_eq!(plan["config"]["limit"], 3);
    config["limit"] = json!(99);
    assert!(store.save_automation("example", &config, at).is_err());
    config["limit"] = json!(3);
    assert!(store.delete_automation("other", id).is_err());
    store.control_automation("example", id, true, at).unwrap();
    let queued = store.run_automation("example", id, at).unwrap();
    assert!(store.save_automation("example", &config, at).is_err());
    assert!(store.delete_automation("example", id).is_err());
    let job = store.claim(&client, "example", at).unwrap();
    assert_eq!(job["id"], queued["id"]);
    assert!(store
        .delete_job("example", job["id"].as_str().unwrap(), at)
        .is_err());
    store
        .finish_automation(
            job["id"].as_str().unwrap(),
            &client,
            &json!({"completed":[]}),
            None,
            at,
        )
        .unwrap();
    assert!(dispatch(
        &store,
        "delete_automation",
        json!({"account":"example","id":id})
    )
    .is_ok());
    assert_eq!(
        store.automation_state("example").unwrap()["tasks"],
        json!([])
    );
    assert_eq!(store.jobs().unwrap().as_array().unwrap().len(), 1);
}

#[test]
fn job_edits_are_owned_and_deletion_cancels_queue_but_keeps_history() {
    let (directory, store, client, at) = setup();
    let created = store.enqueue("example", at).unwrap();
    let id = created["id"].as_str().unwrap();
    assert!(store
        .update_job("other", id, &json!({"action":"capture_analytics"}), at)
        .is_err());
    assert!(store
        .update_job("example", id, &json!({"action":"unfollow"}), at)
        .is_err());
    assert!(dispatch(
        &store,
        "update_job",
        json!({"account":"example","id":id,"action":"capture_analytics"})
    )
    .is_ok());
    assert_eq!(store.jobs().unwrap()[0]["action"], "capture_analytics");
    assert!(store.delete_job("other", id, at).is_err());
    assert!(dispatch(&store, "delete_job", json!({"account":"example","id":id})).is_ok());
    assert_eq!(store.jobs().unwrap(), json!([]));
    assert!(store.claim(&client, "example", at).unwrap().is_null());
    assert!(store
        .update_job("example", id, &json!({"action":"capture"}), at)
        .is_err());
    let db = rusqlite::Connection::open(directory.path().join("data.db")).unwrap();
    let state: String = db
        .query_row("SELECT state FROM jobs WHERE id=?", [id], |row| row.get(0))
        .unwrap();
    assert_eq!(state, "failed");
}

#[test]
fn article_edits_preserve_facts_and_deleted_drafts_cannot_resume() {
    let (_directory, store, client, at) = setup();
    let source = json!({"author":"writer","id":"123","url":"https://x.com/writer/status/123","text":"An idea for 12 people."});
    let created = store.enqueue_rewrite("example", &source, at).unwrap();
    let id = created["id"].as_str().unwrap();
    store.claim_rewrite(at).unwrap();
    assert!(store.delete_job("example", id, at).is_err());
    store
        .save_rewrite(id, Ok("For 12 people, an idea."), at)
        .unwrap();
    assert!(store
        .update_job("example", id, &json!({"text":"For 99 people."}), at)
        .is_err());
    store
        .update_job(
            "example",
            id,
            &json!({"text":"A clear idea for 12 people."}),
            at,
        )
        .unwrap();
    assert_eq!(
        store.jobs().unwrap()[0]["input"]["text"],
        "A clear idea for 12 people."
    );
    store
        .schedule_publication("example", id, at + 1000, at)
        .unwrap();
    store.delete_job("example", id, at).unwrap();
    assert!(store
        .claim(&client, "example", at + 1000)
        .unwrap()
        .is_null());
    assert!(store.retry_rewrite("example", id, at).is_err());
    assert!(store
        .schedule_publication("example", id, at + 1000, at)
        .is_err());
    let replacement = store.enqueue_rewrite("example", &source, at).unwrap();
    assert_ne!(replacement["id"], created["id"]);
}

#[test]
fn removed_published_records_still_block_duplicate_sends() {
    let (_directory, store, client, at) = setup();
    let source = json!({"author":"writer","id":"123","url":"https://x.com/writer/status/123","text":"An idea for 12 people."});
    let created = store.enqueue_rewrite("example", &source, at).unwrap();
    let id = created["id"].as_str().unwrap();
    store.claim_rewrite(at).unwrap();
    store
        .save_rewrite(id, Ok("For 12 people, an idea."), at)
        .unwrap();
    store
        .schedule_publication("example", id, at + 1000, at)
        .unwrap();
    store.claim(&client, "example", at + 1000).unwrap();
    store.begin_publish(id, &client, at + 1000).unwrap();
    store
        .finish_publication(
            id,
            &client,
            &json!({"url":"https://x.com/example/status/999"}),
            None,
            at + 1000,
        )
        .unwrap();
    store.delete_job("example", id, at + 1001).unwrap();
    assert_eq!(store.jobs().unwrap(), json!([]));
    let duplicate = store
        .enqueue_rewrite("example", &source, at + 1002)
        .unwrap();
    assert_eq!(duplicate["id"], created["id"]);
    assert_eq!(duplicate["duplicate"], true);
    assert_eq!(store.jobs().unwrap()[0]["state"], "completed");
    assert!(store
        .claim(&client, "example", at + 1003)
        .unwrap()
        .is_null());
}

#[test]
fn browser_reads_expire_without_another_queued_task_or_claim(){
 let (_directory,store,client,at)=setup();
 let id=store.enqueue("example",at).unwrap()["id"].as_str().unwrap().to_owned();
 assert_eq!(store.claim(&client,"example",at).unwrap()["id"],id);
 assert!(!store.browser_work_due("other",at+120001).unwrap());
 assert_eq!(store.jobs().unwrap()[0]["state"],"running");
 assert!(!store.browser_work_due("example",at+119999).unwrap());
 assert_eq!(store.jobs().unwrap()[0]["state"],"running");
 assert!(!store.browser_work_due("example",at+120001).unwrap());
 let job=store.jobs().unwrap()[0].clone();assert_eq!(job["state"],"failed");assert_eq!(job["error"],"浏览器读取超时，已结束本次采集");
}

#[test]
fn browser_task_claims_are_serial_across_clients_for_the_same_account() {
    let (directory, store, client, at) = setup();
    let first = store.enqueue("example", at).unwrap();
    assert_eq!(store.claim(&client, "example", at).unwrap()["id"], first["id"]);
    let other_client = Uuid::new_v4().to_string();
    store.session_status(&other_client, "example", "logged_in", "", at).unwrap();
    let db = rusqlite::Connection::open(directory.path().join("data.db")).unwrap();
    db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES('next-read','example','capture','queued',?,?,'{}')", [at, at]).unwrap();
    assert!(store.claim(&client, "example", at + 1).unwrap().is_null());
    assert!(store.claim(&other_client, "example", at + 1).unwrap().is_null());
    store.finish(first["id"].as_str().unwrap(), &client, None, at + 2).unwrap();
    assert_eq!(store.claim(&other_client, "example", at + 3).unwrap()["id"], "next-read");
}

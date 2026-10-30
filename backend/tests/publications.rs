use onhold_backend::{
    dispatch,
    store::{now, validate_rewrite, Snapshot, Store},
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
fn source(id: &str) -> Value {
    json!({"author":"writer","id":id,"url":format!("https://x.com/writer/status/{id}"),"text":"A clear idea for 12 people. @writer #test https://example.com"})
}
fn ready(store: &Store, at: i64, id: &str) -> String {
    let queued = store.enqueue_rewrite("example", &source(id), at).unwrap();
    let task = store.claim_rewrite(at).unwrap();
    assert_eq!(task["id"], queued["id"]);
    store
        .save_rewrite(
            task["id"].as_str().unwrap(),
            Ok("For 12 people: a clear idea. @writer #test https://example.com"),
            at,
        )
        .unwrap();
    queued["id"].as_str().unwrap().to_owned()
}
#[test]
fn similar_articles_are_separate_deduplicated_drafts_with_validated_content() {
    let (_directory, store, client, at) = setup();
    let original = source("123");
    let rewrite = store.enqueue_rewrite("example", &original, at).unwrap();
    let mut similar = original.clone();
    for invalid in [json!("unknown"), Value::Null, json!(1)] {
        similar["mode"] = invalid;
        assert!(store.enqueue_rewrite("example", &similar, at).is_err());
    }
    similar["mode"] = json!("similar");
    let generated = store.enqueue_rewrite("example", &similar, at + 1).unwrap();
    assert_ne!(generated["id"], rewrite["id"]);
    assert_eq!(
        store.enqueue_rewrite("example", &similar, at + 2).unwrap()["id"],
        generated["id"]
    );
    let task = store.claim_rewrite(at + 3).unwrap();
    assert_eq!(task["id"], rewrite["id"]);
    store
        .save_rewrite(task["id"].as_str().unwrap(), Err("fixture skipped"), at + 3)
        .unwrap();
    let task = store.claim_rewrite(at + 4).unwrap();
    assert_eq!(task["input"]["mode"], "similar");
    assert_eq!(task["input"]["source"], original);
    let id = generated["id"].as_str().unwrap();
    store
        .save_rewrite(id, Ok(original["text"].as_str().unwrap()), at + 5)
        .unwrap();
    assert_eq!(
        store
            .jobs()
            .unwrap()
            .as_array()
            .unwrap()
            .iter()
            .find(|job| job["id"] == id)
            .unwrap()["state"],
        "failed"
    );
    store.retry_rewrite("example", id, at + 6).unwrap();
    store.claim_rewrite(at + 7).unwrap();
    store.save_rewrite(id, Ok("For 12 people: start with a clear idea, then explain it. @writer #test https://example.com"), at + 8).unwrap();
    let jobs = store.jobs().unwrap();
    let draft = jobs
        .as_array()
        .unwrap()
        .iter()
        .find(|job| job["id"] == id)
        .unwrap();
    assert_eq!(draft["state"], "queued");
    assert_eq!(draft["input"]["stage"], "ready");
    assert!(draft["input"]["publish_at"].is_null());
    assert!(store.claim(&client, "example", at + 9).unwrap().is_null());
}
#[test]
fn rewrites_preserve_protected_facts_and_validate_output() {
    let original = "At 12.5%, see @person #主题 https://example.com/a/123";
    assert!(validate_rewrite(
        original,
        "See @person #主题 at 12.5%: https://example.com/a/123"
    )
    .is_ok());
    for output in [
        "",
        "Changed to 50%",
        "At 12.5%, see @person #主题 https://evil.example/a/123",
        "At 12.5%, see @person #主题 https://example.com/a/123 99",
    ] {
        assert!(validate_rewrite(original, output).is_err());
    }
}
#[test]
fn queued_publications_require_schedule_version_and_verified_owner_then_cannot_replay() {
    let (_directory, store, client, at) = setup();
    let mut invalid = source("123");
    invalid["url"] = json!("https://evil.example/");
    assert!(store.enqueue_rewrite("example", &invalid, at).is_err());
    store.set_extension_version(&client, "1.0.0").unwrap();
    assert!(store
        .enqueue_rewrite("example", &source("123"), at)
        .is_err());
    let manifest: Value =
        serde_json::from_str(include_str!("../../extension/manifest.json")).unwrap();
    store
        .set_extension_version(&client, manifest["version"].as_str().unwrap())
        .unwrap();
    let id = ready(&store, at, "123");
    assert_eq!(
        store
            .enqueue_rewrite("example", &source("123"), at)
            .unwrap()["id"],
        id
    );
    assert!(
        store.claim(&client, "example", at).unwrap().is_null(),
        "unscheduled tasks must never publish"
    );
    assert!(!store.browser_work_due("example", at).unwrap());
    assert!(store
        .schedule_publication("other", &id, at + 1000, at)
        .is_err());
    assert!(store
        .schedule_publication("example", &id, at - 1, at)
        .is_err());
    store
        .schedule_publication("example", &id, at + 1000, at)
        .unwrap();
    assert!(store.claim(&client, "example", at).unwrap().is_null());
    assert!(!store.browser_work_due("example", at).unwrap());
    assert!(store.browser_work_due("example", at + 1000).unwrap());
    let job = store.claim(&client, "example", at + 1000).unwrap();
    assert_eq!(job["id"], id);
    assert!(store.begin_publish(&id, "wrong-client", at + 1000).is_err());
    assert!(store.begin_publish(&id, &client, at + 999).is_err());
    store.begin_publish(&id, &client, at + 1000).unwrap();
    assert!(
        store.begin_publish(&id, &client, at + 1000).is_err(),
        "the send marker is one-use"
    );
    assert!(store
        .finish_publication(
            &id,
            &client,
            &json!({"url":"https://x.com/other/status/999"}),
            None,
            at + 1000
        )
        .is_err());
    assert!(
        store.finish(&id, &client, None, at + 1000).is_err(),
        "generic completion cannot bypass result verification"
    );
    store
        .finish_publication(
            &id,
            &client,
            &json!({"url":"https://x.com/example/status/999"}),
            None,
            at + 1000,
        )
        .unwrap();
    assert_eq!(store.jobs().unwrap()[0]["state"], "completed");
    assert!(store.retry_rewrite("example", &id, at + 1001).is_err());
    assert!(store
        .claim(&client, "example", at + 1001)
        .unwrap()
        .is_null());
    assert_eq!(
        dispatch(
            &store,
            "enqueue_rewrite",
            json!({"account":"example","source":source("123")})
        )
        .unwrap()["duplicate"],
        true
    );
}
#[test]
fn failure_before_send_can_retry_but_uncertain_sends_never_retry_and_blocks_gate_writes() {
    let (_directory, store, client, at) = setup();
    let id = ready(&store, at, "124");
    store
        .schedule_publication("example", &id, at + 1, at)
        .unwrap();
    store
        .block_automation("example", "操作过于频繁", at)
        .unwrap();
    assert!(store.claim(&client, "example", at + 1).unwrap().is_null());
    store.resume_automation("example", at + 1).unwrap();
    store.claim(&client, "example", at + 1).unwrap();
    store
        .finish_publication(&id, &client, &Value::Null, Some("页面未加载"), at + 1)
        .unwrap();
    store.retry_rewrite("example", &id, at + 2).unwrap();
    store.claim(&client, "example", at + 2).unwrap();
    store.begin_publish(&id, &client, at + 2).unwrap();
    store
        .finish_publication(&id, &client, &Value::Null, Some("连接中断"), at + 2)
        .unwrap();
    assert!(store.retry_rewrite("example", &id, at + 3).is_err());
    assert_eq!(store.jobs().unwrap()[0]["input"]["stage"], "sending");
}
#[test]
fn invalid_model_results_and_interrupted_rewrites_fail_without_publishing() {
    let (_directory, store, client, at) = setup();
    let id = store
        .enqueue_rewrite("example", &source("125"), at)
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    store.claim_rewrite(at).unwrap();
    store.save_rewrite(&id, Ok("invented 999"), at).unwrap();
    assert_eq!(store.jobs().unwrap()[0]["state"], "failed");
    store.retry_rewrite("example", &id, at + 1).unwrap();
    store.claim_rewrite(at + 1).unwrap();
    assert!(store.claim_rewrite(at + 181002).unwrap().is_null());
    assert_eq!(store.jobs().unwrap()[0]["state"], "failed");
    assert!(store
        .claim(&client, "example", at + 181003)
        .unwrap()
        .is_null());
}

#[test]
fn interrupted_send_is_recovered_even_without_another_queued_browser_job() {
    let (_directory, store, client, at) = setup();
    let id = ready(&store, at, "126");
    store
        .schedule_publication("example", &id, at + 1, at)
        .unwrap();
    store.claim(&client, "example", at + 1).unwrap();
    store.begin_publish(&id, &client, at + 1).unwrap();
    assert!(store.claim_rewrite(at + 121002).unwrap().is_null());
    assert_eq!(store.jobs().unwrap()[0]["state"], "failed");
    assert!(store.retry_rewrite("example", &id, at + 121003).is_err());
}

#[test]
fn replicate_requires_fixed_analysis_json_before_automatic_publication() {
    let (_directory, store, client, at) = setup();
    // Publishing needs automation capability; official Analytics access is unrelated.
    store.set_analytics_support(&client, false).unwrap();
    let mut original = source("501");
    original["mode"] = json!("replicate");
    let queued = store.enqueue_rewrite("example", &original, at).unwrap();
    let id = queued["id"].as_str().unwrap();
    assert_eq!(
        store.enqueue_rewrite("example", &original, at + 1).unwrap()["id"],
        id
    );
    store.claim_rewrite(at + 2).unwrap();
    assert!(store.claim(&client, "example", at + 3).unwrap().is_null());
    store
        .save_rewrite(
            id,
            Ok("For 12 people: start with a clear idea. @writer #test https://example.com"),
            at + 4,
        )
        .unwrap();
    assert_eq!(store.jobs().unwrap()[0]["state"], "failed");
    assert!(store.claim(&client, "example", at + 5).unwrap().is_null());
    let valid = json!({"schema_version":1,"analysis":{"topic":"A clear idea","structure":"An introduction and explanation","tone":"Direct","key_points":["12 readers"]},"text":"For 12 people: start with a clear idea, then explain it. @writer #test https://example.com"});
    for invalid in [
        json!({"schema_version":1,"text":valid["text"],"analysis":{}}),
        json!({"schema_version":2,"text":valid["text"],"analysis":valid["analysis"]}),
        json!({"schema_version":1,"text":valid["text"],"analysis":valid["analysis"],"command":"publish"}),
    ] {
        store.retry_rewrite("example", id, at + 6).unwrap();
        store.claim_rewrite(at + 7).unwrap();
        store.save_generated(id, Ok(&invalid), at + 8).unwrap();
        assert_eq!(store.jobs().unwrap()[0]["state"], "failed");
        assert!(store.claim(&client, "example", at + 9).unwrap().is_null());
    }
    store.retry_rewrite("example", id, at + 10).unwrap();
    store.claim_rewrite(at + 11).unwrap();
    store.save_generated(id, Ok(&valid), at + 12).unwrap();
    let job = store.claim(&client, "example", at + 13).unwrap();
    assert_eq!(job["id"], id);
    assert_eq!(job["input"]["analysis"], valid["analysis"]);
    assert_eq!(job["input"]["text"], valid["text"]);
    assert_eq!(job["input"]["publish_at"], at);
    store.begin_publish(id, &client, at + 14).unwrap();
    assert!(store
        .finish_publication(id, &client, &json!({}), None, at + 15)
        .is_err());
    store
        .finish_publication(
            id,
            &client,
            &json!({"url":"https://x.com/example/status/501"}),
            None,
            at + 16,
        )
        .unwrap();
    assert_eq!(store.jobs().unwrap()[0]["state"], "completed");
    assert_eq!(
        store
            .enqueue_rewrite("example", &original, at + 17)
            .unwrap()["id"],
        id
    );
    assert!(store.claim(&client, "example", at + 18).unwrap().is_null());
}
#[test]
fn confirmed_publication_with_retained_tab_stays_complete_and_cannot_be_retried(){
    let (_directory,store,client,at)=setup();let id=ready(&store,at,"778");
    store.schedule_publication("example",&id,at+1,at).unwrap();store.claim(&client,"example",at+1).unwrap();store.begin_publish(&id,&client,at+2).unwrap();
    store.finish_publication(&id,&client,&json!({"url":"https://x.com/example/status/779","tab_closed":false,"cleanup_warning":"发送已确认，页面未清空，标签页已保留"}),None,at+3).unwrap();
    let jobs=store.jobs().unwrap();let job=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();assert_eq!(job["state"],"completed");assert_eq!(job["result"]["tab_closed"],false);assert!(job["result"]["cleanup_warning"].as_str().unwrap().contains("已保留"));assert!(store.retry_rewrite("example",&id,at+4).is_err());
    store.finish_publication(&id,&client,&json!({"url":"https://x.com/example/status/779","tab_closed":true}),None,at+1000).unwrap();
    let jobs=store.jobs().unwrap();let job=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();assert_eq!(job["result"]["tab_closed"],true);assert!(job["result"]["cleanup_warning"].is_null());assert_eq!(job["updated_at"],at+3,"UI cleanup must not change the confirmed send time");
    assert!(store.finish_publication(&id,&client,&json!({"url":"https://x.com/example/status/780"}),None,at+1001).is_err());
    store.finish_publication(&id,&client,&Value::Null,Some("cleanup interrupted"),at+1002).unwrap();assert_eq!(store.jobs().unwrap().as_array().unwrap().iter().find(|job|job["id"]==id).unwrap()["state"],"completed");
}
#[test]
fn a_late_verified_receipt_recovers_an_interrupted_send_without_republishing(){
    let (_directory,store,client,at)=setup();let id=ready(&store,at,"880");store.schedule_publication("example",&id,at,at).unwrap();store.claim(&client,"example",at).unwrap();store.begin_publish(&id,&client,at+1).unwrap();
    store.claim_rewrite(at+120002).unwrap();let jobs=store.jobs().unwrap();assert_eq!(jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap()["state"],"failed");
    store.finish_publication(&id,&client,&json!({"url":"https://x.com/example/status/881"}),None,at+120003).unwrap();let jobs=store.jobs().unwrap();let job=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();assert_eq!(job["state"],"completed");assert_eq!(job["result"]["url"],"https://x.com/example/status/881");assert!(store.retry_rewrite("example",&id,at+120004).is_err());
}

#[test]
fn failed_publications_keep_cleanup_metadata_without_becoming_successful(){
    let (_directory,store,client,at)=setup();let id=ready(&store,at,"8881");
    store.schedule_publication("example",&id,at+1,at).unwrap();store.claim(&client,"example",at+1).unwrap();
    store.finish_publication(&id,&client,&json!({"tab_closed":false,"cleanup_warning":"草稿已保留，自动化已暂停"}),Some("输入框未就绪"),at+2).unwrap();
    let jobs=store.jobs().unwrap();let job=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();
    assert_eq!(job["state"],"failed");assert!(job["result"]["url"].is_null());assert_eq!(job["result"]["tab_closed"],false);assert_eq!(job["result"]["cleanup_warning"],"草稿已保留，自动化已暂停");
}

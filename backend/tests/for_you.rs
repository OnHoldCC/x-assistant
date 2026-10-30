use onhold_backend::store::{now, Snapshot, Store};
use serde_json::{json, Value};
fn setup() -> (tempfile::TempDir, Store, String, String, i64) {
    let dir = tempfile::tempdir().unwrap();
    let store = Store::open(dir.path().join("db")).unwrap();
    let at = now();
    store.ingest(serde_json::from_value::<Snapshot>(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
    let client = uuid::Uuid::new_v4().to_string();
    store
        .session_status(&client, "example", "logged_in", "", at)
        .unwrap();
    store.set_automation_support(&client, true).unwrap();
    store
        .set_extension_version(
            &client,
            "1.5.12",
        )
        .unwrap();
    let task = store
        .save_automation(
            "example",
            &json!({"action":"auto_reply","interval_minutes":5,"limit":2}),
            at,
        )
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    (dir, store, client, task, at)
}
#[test]
fn english_plan_accepts_compatible_old_helper_filters_sources_and_keeps_cancelled_history() {
    let (_dir, store, client, task, at) = setup();
    store.save_automation("example", &json!({"id":task,"action":"auto_reply","language":"en","interval_minutes":1,"limit":2}), at).unwrap();
    store.control_automation("example", &task, true, at).unwrap();
    let discovery = store.run_automation("example", &task, at).unwrap()["id"].as_str().unwrap().to_owned();
    let claimed = store.claim(&client, "example", at).unwrap();
    assert_eq!(claimed["input"]["language"], "en");
    let english = json!({"author":"writer","id":"998","url":"https://x.com/writer/status/998","text":"This is a useful improvement for the deployment workflow.","complete":true});
    let result = store.queue_feed_replies(&discovery, &client, &json!([post("997"),english]), at).unwrap();
    assert_eq!(result["queued"], 1);
    assert_eq!(result["skipped"], 1);
    let job = store.claim_rewrite(at+1).unwrap();
    assert_eq!(job["input"]["language"], "en");
    let id = job["id"].as_str().unwrap();
    store.save_generated(id, Ok(&json!({"schema_version":1,"text":"这句话还是中文，不能发。"})), at+2).unwrap();
    assert_eq!(store.jobs().unwrap().as_array().unwrap().iter().find(|j|j["id"]==id).unwrap()["state"], "failed");
    store.retry_rewrite("example", id, at+3).unwrap();
    store.claim_rewrite(at+4).unwrap();
    store.save_generated(id, Ok(&json!({"schema_version":1,"text":"That makes the deployment steps much easier to follow."})), at+5).unwrap();
    assert!(store.cancel_job("other", id, at+6).is_err());
    store.cancel_job("example", id, at+6).unwrap();
    let saved = store.jobs().unwrap();
    let cancelled = saved.as_array().unwrap().iter().find(|j|j["id"]==id).unwrap();
    assert_eq!(cancelled["state"], "failed");
    assert!(cancelled["input"]["text"].as_str().unwrap().starts_with("That makes"));
    assert_eq!(cancelled["input"]["hidden"], Value::Null);
    assert!(store.cancel_job("example", id, at+7).is_err());
    assert!(store.save_automation("example", &json!({"action":"auto_reply","language":"invalid","interval_minutes":1,"limit":1}), at).is_err());
}
fn post(id: &str) -> Value {
    json!({"author":"writer","id":id,"url":format!("https://x.com/writer/status/{id}"),"text":"把复杂的部署流程做简单。","complete":true})
}
#[test]
fn for_you_tasks_are_owned_atomic_deduplicated_and_pause_before_send() {
    let (_dir, store, client, task, at) = setup();
    assert!(store.run_automation("example", &task, at).is_err());
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    let discovery = store.run_automation("example", &task, at).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    store
        .control_automation("example", &task, false, at)
        .unwrap();
    assert!(store.claim(&client, "example", at).unwrap().is_null());
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    assert_eq!(
        store.claim(&client, "example", at).unwrap()["id"],
        discovery
    );
    assert!(store
        .queue_feed_replies(&discovery, "wrong", &json!([post("101")]), at)
        .is_err());
    let mut bad = post("102");
    bad["complete"] = json!(false);
    assert!(store
        .queue_feed_replies(&discovery, &client, &json!([post("101"), bad]), at)
        .is_err());
    assert_eq!(
        store.jobs().unwrap().as_array().unwrap().len(),
        1,
        "batch rollback"
    );
    let batch = store
        .queue_feed_replies(
            &discovery,
            &client,
            &json!([post("101"), post("101"), post("102")]),
            at,
        )
        .unwrap();
    assert_eq!(batch["queued"], 2);
    assert_eq!(batch["skipped"], 1);
    assert_eq!(
        store
            .queue_feed_replies(&discovery, &client, &json!([post("101")]), at)
            .unwrap()["queued"],
        0
    );
    assert!(store
        .queue_feed_replies(&discovery, &client, &json!([post("103")]), at)
        .is_err());
    store.finish_for_you(&discovery, &client, None, at).unwrap();
    store
        .control_automation("example", &task, false, at)
        .unwrap();
    assert!(store.claim_rewrite(at).unwrap().is_null());
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    let job = store.claim_rewrite(at).unwrap();
    let id = job["id"].as_str().unwrap();
    store
        .save_generated(
            id,
            Ok(&json!({"schema_version":1,"text":"把步骤和依赖讲清楚，部署会更容易复现。"})),
            at,
        )
        .unwrap();
    store.claim(&client, "example", at).unwrap();
    store
        .control_automation("example", &task, false, at)
        .unwrap();
    assert!(store.begin_publish(id, &client, at).is_err());
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    store.begin_publish(id, &client, at).unwrap();
    assert!(store
        .finish_publication(
            id,
            &client,
            &json!({"url":"https://x.com/example/status/999","reply_to":"wrong"}),
            None,
            at
        )
        .is_err());
    store.finish_publication(id,&client,&json!({"url":"https://x.com/example/status/999","reply_to":job["input"]["source"]["id"]}),None,at).unwrap();
    assert!(store.retry_rewrite("example", id, at).is_err());
    let plan = store.automation_state("example").unwrap();
    assert_eq!(plan["tasks"][0]["last_job"]["id"], discovery);
    assert_eq!(
        plan["tasks"][0]["last_job"]["result"]["reply_progress"]["completed"],
        1
    );
    let job = store.claim_rewrite(at).unwrap();
    store
        .save_generated(
            job["id"].as_str().unwrap(),
            Ok(&json!({"schema_version":1,"text":"已经有999位用户试过。"})),
            at,
        )
        .unwrap();
    let jobs = store.jobs().unwrap();
    assert_eq!(
        jobs.as_array()
            .unwrap()
            .iter()
            .find(|item| item["id"] == job["id"])
            .unwrap()["state"],
        "failed"
    );
}

#[test]
fn reply_records_keep_usage_across_retries_and_hidden_posts_stay_deduplicated() {
    let (_dir, store, client, task, at) = setup();
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    let parent = store.run_automation("example", &task, at).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    store.claim(&client, "example", at).unwrap();
    let batch = store
        .queue_feed_replies(&parent, &client, &json!([post("501")]), at)
        .unwrap();
    let id = batch["job_ids"][0].as_str().unwrap();
    store.finish_for_you(&parent, &client, None, at).unwrap();
    store.claim_rewrite(at + 1).unwrap();
    store
        .record_generation(
            id,
            at + 1,
            at + 1001,
            1000,
            Some(&json!({"input_tokens":100,"cached_input_tokens":60,"output_tokens":20})),
        )
        .unwrap();
    store
        .save_generated(id, Err("fixture invalid output"), at + 1001)
        .unwrap();
    store.retry_rewrite("example", id, at + 1100).unwrap();
    store.claim_rewrite(at + 1101).unwrap();
    store
        .record_generation(
            id,
            at + 1101,
            at + 2101,
            1000,
            Some(&json!({"input_tokens":200,"cached_input_tokens":100,"output_tokens":30})),
        )
        .unwrap();
    store
        .save_generated(
            id,
            Ok(&json!({"schema_version":1,"text":"把步骤和依赖讲清楚，部署会更容易复现。"})),
            at + 2101,
        )
        .unwrap();
    store.claim(&client, "example", at + 2200).unwrap();
    store.begin_publish(id, &client, at + 2300).unwrap();
    store
        .finish_publication(
            id,
            &client,
            &json!({"url":"https://x.com/example/status/999","reply_to":"501"}),
            None,
            at + 2500,
        )
        .unwrap();
    let jobs = store.jobs().unwrap();
    let saved = jobs
        .as_array()
        .unwrap()
        .iter()
        .find(|job| job["id"] == id)
        .unwrap();
    let runs = &saved["input"]["telemetry"]["generations"];
    assert_eq!(runs.as_array().unwrap().len(), 2);
    assert_eq!(runs[0]["usage"]["total_tokens"], 120);
    assert_eq!(runs[1]["usage"]["total_tokens"], 230);
    assert_eq!(saved["input"]["telemetry"]["send_started_at"], at + 2300);
    store.delete_job("example", id, at + 2600).unwrap();
    let parent = store.run_automation("example", &task, at + 2700).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let claimed = store.claim(&client, "example", at + 2700).unwrap();
    assert_eq!(claimed["id"], parent);
    assert!(claimed["input"]["known_ids"]
        .as_array()
        .unwrap()
        .contains(&json!("501")));
    assert_eq!(
        store
            .queue_feed_replies(&parent, &client, &json!([post("501")]), at + 2700)
            .unwrap()["queued"],
        0
    );
}

#[test]
fn notification_plans_require_verified_reply_parent_and_share_duplicate_history() {
    let (_dir, store, client, _task, at) = setup();
    // Add the stable X user ID required to validate notifications.
    store.ingest(serde_json::from_value::<Snapshot>(json!({"uid":"99","handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
    let task = store
        .save_automation(
            "example",
            &json!({"action":"reply_notifications","interval_minutes":5,"limit":2}),
            at,
        )
        .unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    let parent = store.run_automation("example", &task, at).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    let claimed = store.claim(&client, "example", at).unwrap();
    assert_eq!(claimed["action"], "capture_notifications");
    assert_eq!(claimed["input"]["owner_uid"], "99");
    assert!(store
        .queue_feed_replies(&parent, &client, &json!([post("601")]), at)
        .is_err());
    let mut reply = post("601");
    reply["in_reply_to_user_id"] = json!("99");
    reply["in_reply_to_status_id"] = json!("123");
    assert_eq!(
        store
            .queue_feed_replies(&parent, &client, &json!([reply.clone()]), at)
            .unwrap()["queued"],
        1
    );
    assert_eq!(
        store
            .queue_feed_replies(&parent, &client, &json!([reply]), at)
            .unwrap()["queued"],
        0
    );
    let child = store
        .jobs()
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .find(|job| job["input"]["mode"] == "reply")
        .unwrap()
        .clone();
    assert_eq!(child["input"]["scope"], "notifications");
    assert_eq!(child["input"]["source"]["in_reply_to_status_id"], "123");
}

#[test]
fn notification_seconds_apply_to_discovery_resume_and_each_confirmed_send(){
    let (_dir,store,client,_task,at)=setup();
    store.ingest(serde_json::from_value::<Snapshot>(json!({"uid":"99","handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
    for seconds in [json!(24),json!(26),json!(0),json!(-1),json!(25.5),json!("25"),json!(true)] {
        assert!(store.save_automation("example",&json!({"action":"reply_notifications","interval_seconds":seconds,"limit":1}),at).is_err());
    }
    assert!(store.save_automation("example",&json!({"action":"auto_reply","interval_minutes":1,"interval_seconds":25,"limit":1}),at).is_err());
    assert!(store.save_automation("example",&json!({"action":"reply_notifications","interval_minutes":true,"interval_seconds":25,"limit":1}),at).is_err());
    let task=store.save_automation("example",&json!({"action":"reply_notifications","interval_seconds":25,"limit":2}),at).unwrap()["id"].as_str().unwrap().to_owned();
    store.control_automation("example",&task,true,at).unwrap();
    let reply=|id:&str|{let mut value=post(id);value["in_reply_to_user_id"]=json!("99");value["in_reply_to_status_id"]=json!("123");value};
    let parent=store.run_automation("example",&task,at).unwrap()["id"].as_str().unwrap().to_owned();
    let state=store.automation_state("example").unwrap();let plan=state["tasks"].as_array().unwrap().iter().find(|p|p["id"]==task).unwrap();assert_eq!(plan["next_run"],at+25000);assert_eq!(plan["config"]["interval_seconds"],25);
    store.claim(&client,"example",at).unwrap();store.queue_feed_replies(&parent,&client,&json!([reply("801"),reply("802")]),at).unwrap();store.finish_for_you(&parent,&client,None,at+1).unwrap();
    for text in ["That makes sense.","The example helps."] {let job=store.claim_rewrite(at+2).unwrap();store.save_generated(job["id"].as_str().unwrap(),Ok(&json!({"schema_version":1,"text":text})),at+2).unwrap();}
    let first=store.claim(&client,"example",at+3).unwrap();store.begin_publish(first["id"].as_str().unwrap(),&client,at+4).unwrap();store.finish_publication(first["id"].as_str().unwrap(),&client,&json!({"url":"https://x.com/example/status/991","reply_to":first["input"]["source"]["id"]}),None,at+5).unwrap();
    store.control_automation("example",&task,false,at+10).unwrap();let state=store.control_automation("example",&task,true,at+11).unwrap();assert_eq!(state["tasks"].as_array().unwrap().iter().find(|p|p["id"]==task).unwrap()["next_run"],at+25005);
    assert!(store.claim(&client,"example",at+25004).unwrap().is_null());
    let second=store.claim(&client,"example",at+25005).unwrap();assert!(!second.is_null());store.begin_publish(second["id"].as_str().unwrap(),&client,at+25006).unwrap();store.finish_publication(second["id"].as_str().unwrap(),&client,&json!({"url":"https://x.com/example/status/992","reply_to":second["input"]["source"]["id"]}),None,at+25007).unwrap();
    let parent=store.run_automation("example",&task,at+25008).unwrap()["id"].as_str().unwrap().to_owned();store.claim(&client,"example",at+25008).unwrap();store.queue_feed_replies(&parent,&client,&json!([reply("803")]),at+25008).unwrap();store.finish_for_you(&parent,&client,None,at+25009).unwrap();
    let job=store.claim_rewrite(at+25010).unwrap();store.save_generated(job["id"].as_str().unwrap(),Ok(&json!({"schema_version":1,"text":"The steps are clear."})),at+25010).unwrap();
    assert!(store.claim(&client,"example",at+50006).unwrap().is_null());assert_eq!(store.claim(&client,"example",at+50007).unwrap()["id"],job["id"]);
}

#[test]
fn notification_rate_limit_stops_automatic_retries(){
    let (_dir,store,client,_task,at)=setup();store.ingest(serde_json::from_value::<Snapshot>(json!({"uid":"99","handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
    let task=store.save_automation("example",&json!({"action":"reply_notifications","interval_seconds":25,"limit":1}),at).unwrap()["id"].as_str().unwrap().to_owned();store.control_automation("example",&task,true,at).unwrap();let id=store.run_automation("example",&task,at).unwrap()["id"].as_str().unwrap().to_owned();store.claim(&client,"example",at).unwrap();
    store.finish_for_you(&id,&client,Some("X 通知请求返回 HTTP 429"),at+1).unwrap();assert!(!store.automation_state("example").unwrap()["block"].is_null());assert_eq!(store.automation_can_run("example",&task).unwrap()["allowed"],false);
    assert!(store.run_automation("example",&task,at+25001).is_err());
}

#[test]
fn timed_trial_expires_before_sending_and_cannot_be_reenabled_after_deadline() {
    let (_dir, store, client, task, at) = setup();
    let until = at + 5000;
    store.save_automation("example",&json!({"id":task,"action":"auto_reply","interval_minutes":15,"limit":1,"stop_at":until}),at).unwrap();
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    let parent = store.run_automation("example", &task, at).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    store.claim(&client, "example", at).unwrap();
    let id = store
        .queue_feed_replies(&parent, &client, &json!([post("701")]), at)
        .unwrap()["job_ids"][0]
        .as_str()
        .unwrap()
        .to_owned();
    store.finish_for_you(&parent, &client, None, at).unwrap();
    store.claim_rewrite(at + 1).unwrap();
    store
        .save_generated(
            &id,
            Ok(&json!({"schema_version":1,"text":"步骤清晰，大家复现起来会更方便。"})),
            at + 2,
        )
        .unwrap();
    store.claim(&client, "example", at + 3).unwrap();
    assert!(store.begin_publish(&id, &client, until).is_err());
    assert_eq!(
        store.automation_state("example").unwrap()["tasks"][0]["enabled"],
        false
    );
    assert!(store
        .control_automation("example", &task, true, until + 1)
        .is_err());
    assert!(store
        .save_automation(
            "example",
            &json!({"action":"auto_reply","interval_minutes":15,"limit":1,"stop_at":at-1}),
            at
        )
        .is_err());
}

#[test]
fn news_posts_search_without_scores_and_validate_sources_and_duplicates() {
    let (_dir, store, _client, _task, at) = setup();
    let task=store.save_automation("example",&json!({"action":"auto_post","query":"AI news","interval_minutes":60,"limit":1}),at).unwrap()["id"].as_str().unwrap().to_owned();
    store.control_automation("example",&task,true,at).unwrap();
    let id=store.run_automation("example",&task,at).unwrap()["id"].as_str().unwrap().to_owned();
    let job=store.claim_rewrite(at).unwrap();
    assert_eq!(job["id"],id);assert_eq!(job["input"]["mode"],"news");assert!(job["input"].get("min_score").is_none());
    let news=json!({"schema_version":1,"news":{"title":"AI release","url":"https://news.example/release","published_at":chrono::DateTime::from_timestamp_millis(at-60000).unwrap().to_rfc3339(),"summary":"官方发布新的工具。"},"text":"官方发布新的工具。来源：https://news.example/release"});
    store.save_generated(&id,Ok(&news),at+1).unwrap();
    let jobs=store.jobs().unwrap();let saved=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();
    assert_eq!(saved["input"]["stage"],"ready");assert_eq!(saved["input"]["source"]["title"],"AI release");assert_eq!(saved["input"]["discovered_from"],"news");
    assert_eq!(store.news_prompt("example","AI news",at).unwrap()["excluded_urls"][0]["url"],"https://news.example/release");
    store.control_automation("example",&task,false,at+1).unwrap();
    assert!(store.claim_rewrite(at+1).unwrap().is_null());
}

#[test]
fn no_news_is_a_recorded_skip_and_never_becomes_sendable() {
    let (_dir, store, client, _task, at) = setup();
    let task=store.save_automation("example",&json!({"action":"auto_post","query":"current news","interval_minutes":10,"limit":1}),at).unwrap()["id"].as_str().unwrap().to_owned();
    store.control_automation("example",&task,true,at).unwrap();
    let id=store.run_automation("example",&task,at).unwrap()["id"].as_str().unwrap().to_owned();
    assert_eq!(store.claim_rewrite(at).unwrap()["id"],id);
    store.save_generated(&id,Ok(&json!({"schema_version":1,"news":null,"text":""})),at+1).unwrap();
    let saved=store.jobs().unwrap();let row=saved.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();
    assert_eq!(row["state"],"completed");assert_eq!(row["input"]["stage"],"skipped");assert_eq!(row["result"]["sent"],false);assert!(row["error"].is_null());
    assert!(store.claim(&client,"example",at+2).unwrap().is_null());
    assert!(store.begin_publish(&id,&client,at+2).is_err());
    let logs=store.job_logs("example",&id,&json!({})).unwrap();
    assert!(logs["items"].as_array().unwrap().iter().any(|log|log["message"]=="未找到可核实的新新闻，本轮未发布"));
}

#[test]
fn minute_comments_can_reschedule_queued_work_without_changing_its_target() {
    let (_dir, store, client, task, at) = setup();
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    let parent = store.run_automation("example", &task, at).unwrap()["id"]
        .as_str()
        .unwrap()
        .to_owned();
    store.claim(&client, "example", at).unwrap();
    let id = store
        .queue_feed_replies(&parent, &client, &json!([post("901")]), at)
        .unwrap()["job_ids"][0]
        .as_str()
        .unwrap()
        .to_owned();
    store.finish_for_you(&parent, &client, None, at).unwrap();
    let mut config = store.automation_state("example").unwrap()["tasks"][0]["config"].clone();
    config["id"] = json!(task);
    config["interval_minutes"] = json!(1);
    store.save_automation("example", &config, at).unwrap();
    store
        .control_automation("example", &task, true, at)
        .unwrap();
    assert_eq!(store.claim_rewrite(at).unwrap()["id"], id);
    store
        .save_generated(
            &id,
            Ok(&json!({"schema_version":1,"text":"把步骤写明白，大家复现起来就方便多了。"})),
            at + 1,
        )
        .unwrap();
    store.claim(&client, "example", at + 2).unwrap();
    store.begin_publish(&id, &client, at + 3).unwrap();
    store
        .finish_publication(
            &id,
            &client,
            &json!({"url":"https://x.com/example/status/999","reply_to":"901"}),
            None,
            at + 4,
        )
        .unwrap();
    assert!(
        store.automation_state("example").unwrap()["tasks"][0]["next_run"]
            .as_i64()
            .unwrap()
            >= at + 60004
    );
}
#[test]
fn queued_comments_do_not_catch_up_in_a_burst_after_reload(){
    let (_dir,store,client,task,at)=setup();
    store.control_automation("example",&task,true,at).unwrap();
    let parent=store.run_automation("example",&task,at).unwrap()["id"].as_str().unwrap().to_owned();store.claim(&client,"example",at).unwrap();
    let queued=store.queue_feed_replies(&parent,&client,&json!([post("951"),post("952")]),at).unwrap();store.finish_for_you(&parent,&client,None,at).unwrap();
    for _ in 0..2{let job=store.claim_rewrite(at).unwrap();store.save_generated(job["id"].as_str().unwrap(),Ok(&json!({"schema_version":1,"text":if job["input"]["source"]["id"]=="951"{"可以把步骤写清楚，方便大家复现。"}else{"把使用中的反馈记录下来也会有帮助。"}})),at+1).unwrap();}
    let first=store.claim(&client,"example",at+2).unwrap();store.begin_publish(first["id"].as_str().unwrap(),&client,at+3).unwrap();store.finish_publication(first["id"].as_str().unwrap(),&client,&json!({"url":"https://x.com/example/status/999","reply_to":first["input"]["source"]["id"]}),None,at+4).unwrap();
    assert!(store.claim(&client,"example",at+5).unwrap().is_null());
    assert!(store.claim(&client,"example",at+300003).unwrap().is_null());
    let second=store.claim(&client,"example",at+300004).unwrap();assert!(!second.is_null());assert_ne!(second["id"],first["id"]);assert!(queued["job_ids"].as_array().unwrap().contains(&second["id"]));
}

#[test]
fn weibo_plan_persists_source_and_rejects_non_weibo_generated_posts(){
    let (_dir,store,_client,_task,at)=setup();
    assert!(store.save_automation("example",&json!({"action":"auto_post","query":"微博娱乐八卦热点","interval_minutes":10,"limit":1,"news_source":true}),at).is_err());
    let task=store.save_automation("example",&json!({"action":"auto_post","query":"微博娱乐八卦热点","interval_minutes":10,"limit":1,"news_source":"weibo"}),at).unwrap()["id"].as_str().unwrap().to_owned();
    let state=store.automation_state("example").unwrap();assert_eq!(state["tasks"].as_array().unwrap().iter().find(|p|p["id"]==task).unwrap()["config"]["news_source"],"weibo");
    store.control_automation("example",&task,true,at).unwrap();
    for (offset,url,expected) in [(0,"https://news.example/story","failed"),(1000,"https://m.weibo.cn/detail/123","queued")] {
        store.run_automation("example",&task,at+offset).unwrap();let job=store.claim_rewrite(at+offset).unwrap();assert_eq!(job["input"]["news_source"],"weibo");
        let output=json!({"schema_version":1,"news":{"title":"微博热点讨论","url":url,"published_at":chrono::DateTime::from_timestamp_millis(at-60000).unwrap().to_rfc3339(),"summary":"原帖讨论该事件。"},"text":format!("原帖讨论该事件。{url}")});
        store.save_generated(job["id"].as_str().unwrap(),Ok(&output),at+offset+1).unwrap();
        let jobs=store.jobs().unwrap();let row=jobs.as_array().unwrap().iter().find(|j|j["id"]==job["id"]).unwrap();assert_eq!(row["state"],expected);
        if expected=="failed" {assert!(row["input"].get("source").is_none());}else{assert_eq!(row["input"]["source"]["url"],url);}
    }
}

#[test]
fn fetched_sources_persist_and_english_news_can_omit_public_links_without_losing_provenance(){
    let (_dir,store,client,_task,at)=setup();
    assert!(store.save_automation("example",&json!({"action":"auto_post","query":"entertainment","interval_minutes":10,"limit":1,"news_source":"mixed","include_source_link":"false"}),at).is_err());
    let task=store.save_automation("example",&json!({"action":"auto_post","query":"entertainment","interval_minutes":10,"limit":1,"news_source":"mixed","language":"en","include_source_link":false}),at).unwrap()["id"].as_str().unwrap().to_owned();
    store.control_automation("example",&task,true,at).unwrap();
    let url="https://www.bbc.com/news/articles/fixture";let published=(at/1000-60)*1000;
    for (offset,text,date,expected) in [(0,format!("A new performance was announced. {url}"),published,"failed"),(100,"A new performance was announced.".into(),published+1000,"failed"),(200,"A new performance was announced.".into(),published,"queued")] {
        let id=store.run_automation("example",&task,at+offset).unwrap()["id"].as_str().unwrap().to_owned();
        assert_eq!(store.claim_rewrite(at+offset).unwrap()["id"],id);
        store.record_news_feed(&id,&json!({"retrieved_at":at,"counts":{"weibo":50,"rednote":20,"bbc":1},"items":[{"kind":"article","url":url,"published_at":published}],"errors":[]}),at+offset).unwrap();
        let output=json!({"schema_version":1,"news":{"title":"A new performance","url":url,"published_at":chrono::DateTime::from_timestamp_millis(date).unwrap().to_rfc3339(),"summary":"A new performance was announced."},"text":text});
        store.save_generated(&id,Ok(&output),at+offset+1).unwrap();
        let jobs=store.jobs().unwrap();let row=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();assert_eq!(row["state"],expected,"{}",row["error"]);
        assert_eq!(row["input"]["include_source_link"],false);assert_eq!(row["input"]["news_feed"]["counts"]["rednote"],20);
        if expected=="queued" {
            assert_eq!(row["input"]["source"]["url"],url);assert!(!row["input"]["text"].as_str().unwrap().contains("https://"));
            let claimed=store.claim(&client,"example",at+offset+2).unwrap();assert_eq!(claimed["id"],id);assert_eq!(claimed["input"]["stage"],"ready");
        }
        assert!(store.job_logs("example",&id,&json!({})).unwrap()["items"].as_array().unwrap().iter().any(|log|log["stage"]=="sources"));
    }
}

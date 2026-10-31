use onhold_backend::store::{now, Store};
use serde_json::{json,Value};

fn setup() -> (tempfile::TempDir,Store,String,String,i64) {
    let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().join("db")).unwrap();let at=now();
    store.ingest(serde_json::from_value(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
    let client=uuid::Uuid::new_v4().to_string();
    store.session_status(&client,"example","logged_in","",at).unwrap();
    store.set_automation_support(&client,true).unwrap();store.set_extension_version(&client,"1.5.17").unwrap();
    let task=store.save_automation("example",&json!({"action":"auto_post","query":"current entertainment","news_source":"mixed","interval_minutes":10,"limit":5,"include_source_link":false}),at).unwrap()["id"].as_str().unwrap().to_owned();
    store.control_automation("example",&task,true,at).unwrap();
    (dir,store,client,task,at)
}
fn start(store:&Store,task:&str,at:i64)->String {
    let run=store.run_automation("example",task,at).unwrap();
    assert_eq!(run["job_ids"].as_array().unwrap().len(),1,"even older limit=5 plans process one item");
    let id=run["id"].as_str().unwrap().to_owned();assert_eq!(store.claim_rewrite(at).unwrap()["id"],id);id
}
fn feed(count:usize,at:i64)->Value {
    json!({"source":"mixed","retrieved_at":at,"counts":{"bbc":count},"errors":[],"items":(0..count).map(|i|json!({"kind":"article","platform":"bbc","title":format!("Current performance {i}"),"url":format!("https://www.bbc.com/news/articles/fixture{i}"),"published_at":(at/1000-60)*1000,"summary":"A performance was announced."})).collect::<Vec<_>>()})
}
fn generated(item: &Value, text: &str) -> Value {
    json!({"schema_version":1,"news":{"title":item["title"],"url":item["url"],"published_at":chrono::DateTime::from_timestamp_millis(item["published_at"].as_i64().unwrap()).unwrap().to_rfc3339(),"summary":item["summary"]},"text":text,"skip_reason":""})
}
#[test]
fn each_run_uses_latest_randomized_pool_without_waiting_for_old_candidates() {
    let (dir,store,client,task,at)=setup();let id=start(&store,&task,at);
    assert!(store.news_batch_feed(&id,None,at).unwrap().is_none());
    let first=store.news_batch_feed(&id,Some(&feed(3,at)),at).unwrap().unwrap();
    assert_eq!(first["items"].as_array().unwrap().len(),3);
    assert_eq!(first["randomized"],true);assert_eq!(first["latest_pool"],true);
    assert_eq!(store.news_queue("example",&json!({"state":"processing"})).unwrap()["total"],0,"only a chosen candidate is bound to a job");
    let selected=first["items"][2].clone();
    store.save_generated(&id,Ok(&generated(&selected,"A performance was announced.")),at+1).unwrap();
    store.cancel_job("example",&id,at+2).unwrap();drop(store);
    let store=Store::open(dir.path().join("db")).unwrap();
    let later=at+60_000;store.heartbeat(&client,"example",later).unwrap();let id=start(&store,&task,later);
    assert!(store.news_batch_feed(&id,Some(&feed(5,at)),later).is_err(),"a 60-second-old snapshot must be fetched again");
    let latest=store.news_batch_feed(&id,Some(&feed(5,later)),later).unwrap().unwrap();
    assert_ne!(latest["batch_id"],first["batch_id"]);
    assert_eq!(latest["retrieved_at"],later);
    let items=latest["items"].as_array().unwrap();assert_eq!(items.len(),4);
    assert!(items.iter().any(|item|item["title"]=="Current performance 4"),"new candidates enter while old unselected ones remain");
    assert!(!items.iter().any(|item|item["url"]==selected["url"]),"consumed candidates stay deduplicated after restart");
    assert_eq!(store.news_queue("other",&json!({})).unwrap()["total"],0);
}
#[test]
fn ai_selection_must_belong_to_the_latest_pool_and_preserve_rss_facts() {
    for change in ["title","url","date"] {
        let (_dir,store,_client,task,at)=setup();let id=start(&store,&task,at);
        let pool=store.news_batch_feed(&id,Some(&feed(2,at)),at).unwrap().unwrap();
        let mut output=generated(&pool["items"][1],"A performance was announced.");
        match change {"title"=>output["news"]["title"]=json!("Unlisted event"),"url"=>output["news"]["url"]=json!("https://www.bbc.com/news/other"),_=>output["news"]["published_at"]=json!(chrono::DateTime::from_timestamp_millis(at-5000).unwrap().to_rfc3339())}
        store.save_generated(&id,Ok(&output),at+1).unwrap();
        let jobs=store.jobs().unwrap();let job=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();
        assert_eq!(job["state"],"failed","{change}");
        assert_eq!(store.news_queue("example",&json!({"state":"processing"})).unwrap()["total"],0);
    }
}
#[test]
fn minute_news_schedule_does_not_add_an_extra_minute_after_sending() {
    let (_dir,store,client,task,at)=setup();
    store.control_automation("example",&task,false,at).unwrap();
    store.save_automation("example",&json!({"id":task,"action":"auto_post","query":"current entertainment","news_source":"mixed","interval_minutes":1,"limit":1,"include_source_link":false}),at).unwrap();
    store.control_automation("example",&task,true,at).unwrap();
    let id=start(&store,&task,at);let pool=store.news_batch_feed(&id,Some(&feed(1,at)),at).unwrap().unwrap();
    store.save_generated(&id,Ok(&generated(&pool["items"][0],"A performance was announced.")),at+20_000).unwrap();
    store.claim(&client,"example",at+24_000).unwrap();store.begin_publish(&id,&client,at+24_000).unwrap();
    store.finish_publication(&id,&client,&json!({"url":"https://x.com/example/status/234"}),None,at+25_000).unwrap();
    assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["next_run"],at+60_000);
}
#[test]
fn generated_text_stays_processing_until_a_verified_receipt_arrives() {
    let (_dir,store,client,task,at)=setup();let id=start(&store,&task,at);
    let feed=store.news_batch_feed(&id,Some(&feed(1,at)),at).unwrap().unwrap();store.record_news_feed(&id,&feed,at).unwrap();
    let item=&feed["items"][0];
    store.save_generated(&id,Ok(&json!({"schema_version":1,"news":{"title":item["title"],"url":item["url"],"published_at":chrono::DateTime::from_timestamp_millis(item["published_at"].as_i64().unwrap()).unwrap().to_rfc3339(),"summary":"A performance was announced."},"text":"A performance was announced."})),at+1).unwrap();
    let queued=store.news_queue("example",&json!({})).unwrap();assert_eq!(queued["items"][0]["state"],"processing");assert_eq!(queued["items"][0]["posted_to_x"],false);
    assert_eq!(store.claim(&client,"example",at+2).unwrap()["id"],id);store.begin_publish(&id,&client,at+3).unwrap();
    assert!(store.finish_publication(&id,&client,&json!({"url":"https://x.com/other/status/123"}),None,at+4).is_err());
    assert!(store.news_queue("example",&json!({})).unwrap()["items"][0]["posted_to_x"].is_null());
    store.finish_publication(&id,&client,&json!({"url":"https://x.com/example/status/123","tab_closed":true}),None,at+4).unwrap();
    let list=store.news_queue("example",&json!({})).unwrap();assert_eq!(list["items"][0]["state"],"published");assert_eq!(list["items"][0]["posted_to_x"],true);assert_eq!(list["batch"]["counts"]["published"],1);
}
#[test]
fn expired_batch_is_skipped_and_history_is_paginated() {
    let (_dir,store,client,task,at)=setup();let id=start(&store,&task,at);
    store.news_batch_feed(&id,Some(&feed(25,at)),at).unwrap();store.save_generated(&id,Err("failed"),at+1).unwrap();
    assert_eq!(store.news_queue("example",&json!({})).unwrap()["items"].as_array().unwrap().len(),20);
    assert_eq!(store.news_queue("example",&json!({"offset":20})).unwrap()["items"].as_array().unwrap().len(),5);
    let later=at+49*3600000;store.session_status(&client,"example","logged_in","",later).unwrap();
    let id=start(&store,&task,later);assert!(store.news_batch_feed(&id,None,later).unwrap().is_none());
    let fresh=json!({"items":[{"kind":"topic","platform":"weibo","title":"New topic","url":"https://s.weibo.com/weibo/new","published_at":null}],"counts":{"weibo":1},"retrieved_at":later});
    store.news_batch_feed(&id,Some(&fresh),later).unwrap();
    let list=store.news_queue("example",&json!({"offset":20})).unwrap();assert!(list["items"].as_array().unwrap().iter().any(|r|r["reason"]=="热点已超过48小时"));
}

#[test]
fn preexisting_news_is_skipped_before_another_model_call() {
    let (_dir,store,_client,task,at)=setup();let legacy=start(&store,&task,at);
    let candidate=feed(1,at)["items"][0].clone();
    store.save_generated(&legacy,Ok(&json!({"schema_version":1,"news":{"title":candidate["title"],"url":candidate["url"],"published_at":chrono::DateTime::from_timestamp_millis(candidate["published_at"].as_i64().unwrap()).unwrap().to_rfc3339(),"summary":"A performance was announced."},"text":"A performance was announced."})),at+1).unwrap();
    store.cancel_job("example",&legacy,at+2).unwrap();
    let id=start(&store,&task,at+3);let selected=store.news_batch_feed(&id,Some(&feed(2,at)),at+3).unwrap().unwrap();
    assert_eq!(selected["items"][0]["url"],"https://www.bbc.com/news/articles/fixture1");
    let list=store.news_queue("example",&json!({})).unwrap();assert_eq!(list["batch"]["counts"]["skipped"],1);
    assert!(list["items"].as_array().unwrap().iter().any(|r|r["reason"]=="该新闻已有发文任务"));
}

#[test]
fn list_orders_news_by_publication_time_and_unknown_hotlists_by_capture_time() {
    let (_dir,store,_client,task,at)=setup();let id=start(&store,&task,at);
    let mut input=feed(2,at);input["items"][0]["published_at"]=json!(at-7200000);input["items"][1]["published_at"]=json!(at-3600000);
    input["items"].as_array_mut().unwrap().push(json!({"kind":"topic","platform":"weibo","title":"Live hot topic","url":"https://s.weibo.com/weibo?q=live","published_at":null}));
    store.news_batch_feed(&id,Some(&input),at).unwrap();
    let list=store.news_queue("example",&json!({})).unwrap();
    assert_eq!(list["items"][0]["item"]["platform"],"weibo");assert_eq!(list["items"][1]["item"]["url"],input["items"][1]["url"]);assert_eq!(list["items"][2]["item"]["url"],input["items"][0]["url"]);
}

#[test]
fn already_published_news_keeps_the_historical_x_receipt_in_the_new_list() {
    let (_dir,store,client,task,at)=setup();let legacy=start(&store,&task,at);
    let item=feed(1,at)["items"][0].clone();
    store.save_generated(&legacy,Ok(&json!({"schema_version":1,"news":{"title":item["title"],"url":item["url"],"published_at":chrono::DateTime::from_timestamp_millis(item["published_at"].as_i64().unwrap()).unwrap().to_rfc3339(),"summary":"A performance was announced."},"text":"A performance was announced."})),at+1).unwrap();
    store.claim(&client,"example",at+2).unwrap();store.begin_publish(&legacy,&client,at+3).unwrap();
    store.finish_publication(&legacy,&client,&json!({"url":"https://x.com/example/status/234"}),None,at+4).unwrap();
    let id=start(&store,&task,at+5);store.news_batch_feed(&id,Some(&feed(2,at)),at+5).unwrap();
    let list=store.news_queue("example",&json!({})).unwrap();
    let old=list["items"].as_array().unwrap().iter().find(|row|row["item"]["url"]==item["url"]).unwrap();
    assert_eq!(old["state"],"published");assert_eq!(old["posted_to_x"],true);assert_eq!(old["published_url"],"https://x.com/example/status/234");assert_eq!(list["batch"]["counts"]["published"],1);
    let filtered=store.news_queue("example",&json!({"channel":"bbc","state":"published"})).unwrap();assert_eq!(filtered["total"],1);assert_eq!(filtered["items"][0]["published_url"],old["published_url"]);
}

#[test]
fn channel_and_execution_filters_apply_before_pagination_and_validate_inputs() {
    let (_dir,store,_client,task,at)=setup();let id=start(&store,&task,at);
    let mut input=feed(25,at);input["items"].as_array_mut().unwrap().push(json!({"kind":"topic","platform":"weibo","title":"Another topic","url":"https://s.weibo.com/weibo?q=another","published_at":null}));
    let pool=store.news_batch_feed(&id,Some(&input),at).unwrap().unwrap();
    let bbc=store.news_queue("example",&json!({"channel":"bbc","state":"pending","offset":20})).unwrap();assert_eq!(bbc["total"],25);assert_eq!(bbc["items"].as_array().unwrap().len(),5);assert_eq!(bbc["offset"],20);
    let weibo=store.news_queue("example",&json!({"channel":"weibo","state":"pending","offset":20})).unwrap();assert_eq!(weibo["total"],1);assert_eq!(weibo["items"].as_array().unwrap().len(),1);assert_eq!(weibo["offset"],0);assert_eq!(weibo["batch"]["total"],26);
    let active=store.news_queue("example",&json!({"state":"processing"})).unwrap();assert_eq!(active["total"],0);
    store.save_generated(&id,Ok(&generated(&pool["items"][0],"A performance was announced.")),at+1).unwrap();
    assert_eq!(store.news_queue("example",&json!({"state":"processing"})).unwrap()["total"],1);
    store.cancel_job("example",&id,at+2).unwrap();
    assert_eq!(store.news_queue("example",&json!({"channel":"bbc","state":"failed"})).unwrap()["total"],1);
    assert_eq!(store.news_queue("example",&json!({"channel":"weibo","state":"published"})).unwrap()["total"],0);
    assert_eq!(store.news_queue("other",&json!({"channel":"bbc","state":"failed"})).unwrap()["total"],0);
    for invalid in [json!({"channel":"unknown"}),json!({"channel":true}),json!({"state":"completed"}),json!({"state":null})] {assert!(store.news_queue("example",&invalid).is_err());}
}

#[test]
fn uncertain_sends_have_their_own_filter_and_never_count_as_published() {
    let (_dir,store,client,task,at)=setup();let id=start(&store,&task,at);
    let feed=store.news_batch_feed(&id,Some(&feed(1,at)),at).unwrap().unwrap();store.record_news_feed(&id,&feed,at).unwrap();let item=&feed["items"][0];
    store.save_generated(&id,Ok(&json!({"schema_version":1,"news":{"title":item["title"],"url":item["url"],"published_at":chrono::DateTime::from_timestamp_millis(item["published_at"].as_i64().unwrap()).unwrap().to_rfc3339(),"summary":"A performance was announced."},"text":"A performance was announced."})),at+1).unwrap();
    store.claim(&client,"example",at+2).unwrap();store.begin_publish(&id,&client,at+3).unwrap();store.finish_publication(&id,&client,&json!({}),Some("未收到发布回执，请核对"),at+4).unwrap();
    let list=store.news_queue("example",&json!({"state":"uncertain"})).unwrap();assert_eq!(list["total"],1);assert_eq!(list["batch"]["counts"]["uncertain"],1);assert!(list["items"][0]["posted_to_x"].is_null());
    assert_eq!(store.news_queue("example",&json!({"state":"published"})).unwrap()["total"],0);assert_eq!(store.news_queue("example",&json!({"state":"failed"})).unwrap()["total"],0);
}

#[test]
fn empty_drafts_cache_rejections_until_facts_or_topic_change() {
    let (dir,store,client,task,at)=setup();let id=start(&store,&task,at);
    let original=feed(2,at);let pool=store.news_batch_feed(&id,Some(&original),at).unwrap().unwrap();
    assert_eq!(pool["grounded_rss"],true);
    let reason="候选均为已报道的同一事件，没有足够的新信息";
    store.save_generated(&id,Ok(&json!({"schema_version":1,"news":null,"text":"","skip_reason":reason})),at+1).unwrap();
    let jobs=store.jobs().unwrap();let saved=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();
    assert_eq!(saved["result"]["skip_reason"],reason);assert_eq!(saved["input"]["skipped_generation"]["skip_reason"],reason);
    rusqlite::Connection::open(dir.path().join("db")).unwrap().execute("UPDATE news_candidates SET value=json_remove(value,'$._reviewed_for')",[]).unwrap();
    let later=at+60_000;store.heartbeat(&client,"example",later).unwrap();let id=start(&store,&task,later);
    let mut unchanged=original.clone();unchanged["retrieved_at"]=json!(later);unchanged["items"][0]["heat"]=json!(99999);
    let pool=store.news_batch_feed(&id,Some(&unchanged),later).unwrap().unwrap();
    assert_eq!(pool["items"],json!([]),"heat and capture time changes cannot trigger another expensive check");
    store.save_generated(&id,Ok(&json!({"schema_version":1,"news":null,"text":""})),later+1).unwrap();
    let expired=at+16*60_000;store.heartbeat(&client,"example",expired).unwrap();let id=start(&store,&task,expired);
    unchanged["retrieved_at"]=json!(expired);unchanged["items"][0]["published_at"]=json!(expired-1000);
    assert_eq!(store.news_batch_feed(&id,Some(&unchanged),expired).unwrap().unwrap()["items"],json!([]),"time, rank and heat changes cannot restart rejected candidates after 15 minutes");
    store.save_generated(&id,Ok(&json!({"schema_version":1,"news":null,"text":""})),expired+1).unwrap();
    let id=start(&store,&task,expired+2);let mut changed=unchanged.clone();changed["items"][0]["summary"]=json!("A new announcement adds confirmed details.");
    let pool=store.news_batch_feed(&id,Some(&changed),expired+2).unwrap().unwrap();
    assert_eq!(pool["items"].as_array().unwrap().len(),1,"new facts can be reviewed again");
    store.save_generated(&id,Ok(&json!({"schema_version":1,"news":null,"text":"","skip_reason":"Outside the current topic"})),expired+3).unwrap();
    store.control_automation("example",&task,false,expired+4).unwrap();
    store.save_automation("example",&json!({"id":task,"action":"auto_post","query":"a different topic","news_source":"mixed","interval_minutes":10,"limit":1,"include_source_link":false}),expired+4).unwrap();
    store.control_automation("example",&task,true,expired+4).unwrap();
    let id=start(&store,&task,expired+5);changed["retrieved_at"]=json!(expired+5);
    let pool=store.news_batch_feed(&id,Some(&changed),expired+5).unwrap().unwrap();
    assert_eq!(pool["items"].as_array().unwrap().len(),2,"changing the user's topic invalidates previous topic-specific rejections");
}
#[test]
fn rss_prompt_is_bounded_and_cannot_replace_the_provided_source_facts() {
    let (_dir,store,_client,task,at)=setup();let id=start(&store,&task,at);
    let mut raw=feed(25,at);raw["items"].as_array_mut().unwrap().push(json!({"kind":"topic","platform":"weibo","title":"Unverified headline","url":"https://s.weibo.com/weibo?q=topic"}));
    let pool=store.news_batch_feed(&id,Some(&raw),at).unwrap().unwrap();
    assert_eq!(pool["items"].as_array().unwrap().len(),8);assert_eq!(pool["grounded_rss"],true);
    assert!(pool["items"].as_array().unwrap().iter().all(|item|item["kind"]=="article"));
    let mut output=generated(&pool["items"][0],"A performance was announced.");output["news"]["summary"]=json!("An invented claim.");output["skip_reason"]=json!("");
    store.save_generated(&id,Ok(&output),at+1).unwrap();
    let jobs=store.jobs().unwrap();let saved=jobs.as_array().unwrap().iter().find(|job|job["id"]==id).unwrap();
    assert_eq!(saved["state"],"failed");assert_eq!(saved["error"],"模型改变了原始RSS摘要，未发布");
}

#[test]
fn topic_only_news_requires_explicit_search_permission_and_empty_rounds_cost_zero() {
    for allow in [false,true] {
        let (_dir,store,_client,task,at)=setup();
        store.control_automation("example",&task,false,at).unwrap();
        store.save_automation("example",&json!({"id":task,"action":"auto_post","query":"current entertainment","news_source":"mixed","interval_minutes":1,"limit":1,"allow_news_search":allow}),at).unwrap();
        store.control_automation("example",&task,true,at).unwrap();
        let id=start(&store,&task,at);
        let topic=json!({"source":"mixed","retrieved_at":at,"counts":{"weibo":1},"errors":[],"items":[{"kind":"topic","platform":"weibo","title":"A new entertainment headline","url":"https://s.weibo.com/weibo?q=fixture","published_at":null}]});
        let pool=store.news_batch_feed(&id,Some(&topic),at).unwrap().unwrap();
        assert_eq!(pool["items"].as_array().unwrap().len(),if allow {1} else {0});
        assert_eq!(store.jobs().unwrap().as_array().unwrap().iter().find(|job|job["id"]==id).unwrap()["input"]["allow_news_search"],allow);
        if !allow {
            assert!(pool["skip_reason"].as_str().unwrap().contains("未调用模型"));
            store.save_generated(&id,Ok(&json!({"schema_version":1,"news":null,"text":"","skip_reason":pool["skip_reason"]})),at+1).unwrap();
            let stats=store.dashboard(Some("example"),1,at+1).unwrap()["task_stats"].clone();
            let news=stats.as_array().unwrap().iter().find(|row|row["input"]["mode"]=="news").unwrap();
            assert_eq!(news["tokens"],0);assert_eq!(news["missing_usage"],0);
            assert_eq!(news["completed"],0);assert_eq!(news["failed"],0);
        }
    }
}

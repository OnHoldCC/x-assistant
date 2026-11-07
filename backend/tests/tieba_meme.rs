use onhold_backend::store::{Store,now};
use serde_json::{json,Value};
fn setup()->(tempfile::TempDir,Store,String,String,i64){
    let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().join("db")).unwrap();let at=now();
    store.ingest(serde_json::from_value(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
    let client=uuid::Uuid::new_v4().to_string();store.session_status(&client,"example","logged_in","",at).unwrap();store.set_automation_support(&client,true).unwrap();store.set_extension_version(&client,"1.5.31").unwrap();
    let task=store.save_automation("example",&json!({"action":"auto_meme","interval_seconds":120,"limit":1}),at).unwrap()["id"].as_str().unwrap().to_owned();
    assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["enabled"],false);store.control_automation("example",&task,true,at).unwrap();
    store.run_automation("example",&task,at).unwrap();(dir,store,client,task,at)
}
fn verdict()->Value{json!({"candidate_id":"meme.jpg","decision":"pass","meme":true,"political":false,"privacy":false,"other_risk":false,"content_preserved":true,"watermark":"none","watermark_description":"","caption":"What are you wishing for today? #Memes","reason":"普通动画反应图，无政治内容，水印已清除"})}
fn candidate(review:Value)->Value{json!({"candidate_id":"meme.jpg","kind":"tieba_meme","forum":"孙笑川","url":"https://tieba.baidu.com/p/123","title":"动画表情包","image_url":"https://tiebapic.baidu.com/forum/meme.jpg","image_key":"meme.jpg","image_aliases":["meme.jpg","preview.jpg"],"view_index":0,"review":review})}
#[test]
fn automatic_memes_need_pre_and_post_review_and_respect_pause_and_dedup(){
    let (dir,store,client,task,at)=setup();let job=store.claim_rewrite(at).unwrap();let id=job["id"].as_str().unwrap();
    assert_eq!(job["input"]["source"]["kind"],"tieba_pending");assert!(store.claim(&client,"example",at).unwrap().is_null());
    let c=candidate(verdict());store.record_meme_batch(id,std::slice::from_ref(&c),at).unwrap();store.select_meme_candidate(id,&c,at).unwrap();
    store.finish_meme_image(id,Ok(&json!({"status":"ready","pre":verdict(),"post":verdict()})),at).unwrap();
    assert_eq!(store.claim(&client,"example",at).unwrap()["id"],id);
    store.control_automation("example",&task,false,at).unwrap();assert!(store.bind_image_media(id,&client,"456",at).is_err());
    store.control_automation("example",&task,true,at).unwrap();
    let db=rusqlite::Connection::open(dir.path().join("db")).unwrap();
    db.execute("UPDATE jobs SET input=json_set(input,'$.image_review.pre.political',json('true')) WHERE id=?",[id]).unwrap();assert!(store.bind_image_media(id,&client,"456",at).is_err());
    db.execute("UPDATE jobs SET input=json_set(input,'$.image_review.pre.political',json('false')) WHERE id=?",[id]).unwrap();
    store.bind_image_media(id,&client,"456",at).unwrap();store.begin_publish(id,&client,at).unwrap();
    store.finish_publication(id,&client,&json!({"url":"https://x.com/example/status/789","media_id":"456"}),None,at).unwrap();
    let excluded=store.meme_exclusions("example",at).unwrap();assert!(!excluded.contains("post:123"));assert!(excluded.contains("meme.jpg"));assert!(excluded.contains("preview.jpg"));
    store.session_status(&client,"example","logged_in","",at+120000).unwrap();
    for (key,aliases,url,expected) in [
        ("preview.jpg",vec!["preview.jpg"],"https://tieba.baidu.com/p/999",false),
        ("another.jpg",vec!["another.jpg"],"https://tieba.baidu.com/p/123",true),
    ]{
        store.run_automation("example",&task,at+120000).unwrap();let next=store.claim_rewrite(at+120000).unwrap();let next_id=next["id"].as_str().unwrap();
        let mut c=candidate(verdict());c["candidate_id"]=json!(key);c["image_key"]=json!(key);c["image_aliases"]=json!(aliases);c["image_url"]=json!(format!("https://tiebapic.baidu.com/forum/{key}"));c["url"]=json!(url);
        store.record_meme_batch(next_id,std::slice::from_ref(&c),at+120000).unwrap();store.select_meme_candidate(next_id,&c,at+120000).unwrap();
        store.finish_meme_image(next_id,Ok(&json!({"status":"ready","pre":verdict(),"post":verdict()})),at+120000).unwrap();
        let row=store.jobs().unwrap().as_array().unwrap().iter().find(|job|job["id"]==next_id).unwrap().clone();
        assert_eq!(row["state"]=="queued",expected,"same image variants must stop; another image in the same post must pass");
    }
}
#[test]
fn politics_and_uncertainty_stop_before_editing_and_empty_rounds_release_the_plan(){
    let (_dir,store,client,task,at)=setup();let job=store.claim_rewrite(at).unwrap();let id=job["id"].as_str().unwrap();
    for (key,value) in [("political",json!(true)),("decision",json!("uncertain"))]{let mut bad=verdict();bad[key]=value;let c=candidate(bad);store.record_meme_batch(id,std::slice::from_ref(&c),at).unwrap();assert!(store.select_meme_candidate(id,&c,at).is_err());}
    store.finish_meme_image(id,Ok(&json!({"status":"rejected","reason":"候选涉及政治或无法确定，未去水印"})),at).unwrap();
    let row=&store.jobs().unwrap()[0];assert_eq!(row["state"],"completed");assert_eq!(row["input"]["stage"],"skipped");assert_eq!(row["input"]["model_not_called"],true);assert_eq!(row["result"]["sent"],false);
    assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["state"],"waiting");
    assert!(store.meme_exclusions("example",at).unwrap().contains("review:meme.jpg"));
    store.session_status(&client,"example","logged_in","",at+120000).unwrap();
    store.run_automation("example",&task,at+120000).unwrap();let job=store.claim_rewrite(at+120000).unwrap();let id=job["id"].as_str().unwrap();let c=candidate(verdict());store.record_meme_batch(id,std::slice::from_ref(&c),at+120000).unwrap();store.select_meme_candidate(id,&c,at+120000).unwrap();
    let mut bad=verdict();bad["political"]=json!(true);store.finish_meme_image(id,Ok(&json!({"status":"ready","pre":verdict(),"post":bad})),at+120000).unwrap();
    assert_eq!(store.jobs().unwrap().as_array().unwrap().iter().find(|j|j["id"]==id).unwrap()["state"],"failed");
}
#[test]
fn source_excerpt_cannot_publish_without_its_english_translation(){
    for (translation,expected) in [("",false),("Where did these memes come from?",true)]{
        let (_dir,store,_client,_task,at)=setup();let job=store.claim_rewrite(at).unwrap();let id=job["id"].as_str().unwrap();
        let mut c=candidate(verdict());c["text"]=json!("这些梗图从哪来的？");c["text_scope"]=json!("excerpt");
        store.record_meme_batch(id,std::slice::from_ref(&c),at).unwrap();store.select_meme_candidate(id,&c,at).unwrap();
        let mut post=verdict();post["translation"]=json!(translation);
        store.finish_meme_image(id,Ok(&json!({"status":"ready","pre":verdict(),"post":post})),at).unwrap();
        let row=&store.jobs().unwrap()[0];assert_eq!(row["state"]=="queued",expected);
        if expected{assert_eq!(row["input"]["source"]["text"],c["text"]);assert_eq!(row["input"]["image_review"]["post"]["translation"],translation);}
        else{assert_eq!(row["error"],"原帖摘要缺少英文翻译，未发布");}
    }
}
#[test]
fn legacy_records_only_block_the_whole_post_when_the_image_is_unknown(){
    for known in [false,true]{
        let (dir,store,_client,_task,at)=setup();let job=store.claim_rewrite(at).unwrap();let id=job["id"].as_str().unwrap();
        let mut source=json!({"kind":"tieba_meme","url":"https://tieba.baidu.com/p/123"});
        if known{source["image_key"]=json!("meme.jpg");}
        let db=rusqlite::Connection::open(dir.path().join("db")).unwrap();
        db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES('legacy','example','rewrite_publish','completed',?,?,?)",rusqlite::params![at-1,at-1,json!({"mode":"image","stage":"sending","source":source}).to_string()]).unwrap();
        let excluded=store.meme_exclusions("example",at).unwrap();assert_eq!(excluded.contains("post:123"),!known);assert_eq!(excluded.contains("legacy_post:123"),known);
        let mut c=candidate(verdict());c["image_key"]=json!("another.jpg");c["image_url"]=json!("https://tiebapic.baidu.com/forum/another.jpg");c["image_aliases"]=json!(["another.jpg"]);
        store.record_meme_batch(id,std::slice::from_ref(&c),at).unwrap();store.select_meme_candidate(id,&c,at).unwrap();
        store.finish_meme_image(id,Ok(&json!({"status":"ready","pre":verdict(),"post":verdict()})),at).unwrap();
        let row=store.jobs().unwrap().as_array().unwrap().iter().find(|job|job["id"]==id).unwrap().clone();assert_eq!(row["state"]=="queued",known);
    }
}
#[test]
fn old_watermark_rejections_are_rescreened_once_without_releasing_political_rejections(){
    for mark in ["uncertain","creator"]{
    let (dir,store,_client,_task,at)=setup();let job=store.claim_rewrite(at).unwrap();let id=job["id"].as_str().unwrap();
    let mut review=verdict();review["decision"]=json!(if mark=="creator"{"reject"}else{"uncertain"});review["watermark"]=json!(mark);
    let c=candidate(review);store.record_meme_batch(id,std::slice::from_ref(&c),at).unwrap();
    assert!(store.meme_exclusions("example",at).unwrap().contains("review:meme.jpg"));
    let db=rusqlite::Connection::open(dir.path().join("db")).unwrap();db.execute("UPDATE jobs SET input=json_remove(input,'$.meme_screen_version') WHERE id=?",[id]).unwrap();
    assert!(!store.meme_exclusions("example",at).unwrap().contains("review:meme.jpg"));
    db.execute("UPDATE jobs SET input=json_set(input,'$.meme_candidates[0].review.political',json('true')) WHERE id=?",[id]).unwrap();
    assert!(store.meme_exclusions("example",at).unwrap().contains("review:meme.jpg"));
    }
}
#[test]
fn author_watermarks_go_to_cleanup_but_residual_watermarks_never_publish(){
    for cleaned in [false,true]{
        let (_dir,store,_client,_task,at)=setup();let job=store.claim_rewrite(at).unwrap();let id=job["id"].as_str().unwrap();
        let mut pre=verdict();pre["watermark"]=json!("creator");pre["watermark_description"]=json!("右下角账号署名叠层");
        let c=candidate(pre.clone());store.record_meme_batch(id,std::slice::from_ref(&c),at).unwrap();store.select_meme_candidate(id,&c,at).unwrap();
        let post=if cleaned{verdict()}else{pre.clone()};store.finish_meme_image(id,Ok(&json!({"status":"ready","pre":pre,"post":post})),at).unwrap();
        assert_eq!(store.jobs().unwrap()[0]["state"]=="queued",cleaned);
    }
}

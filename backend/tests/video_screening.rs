use onhold_backend::{video_screening::validate,store::{Store,now}};
use serde_json::json;
#[test]
fn screening_requires_one_bounded_verdict_for_each_exact_download(){
 let ids=vec!["first".to_owned(),"second".to_owned()];let value=json!({"schema_version":1,"items":[{"download_id":"first","status":"allowed","reason":"普通视频"},{"download_id":"second","status":"excluded","reason":"政治话题"}]});assert_eq!(validate(&value,&ids).unwrap()["allowed"],1);
 for change in [json!([{"download_id":"first","status":"allowed","reason":"普通视频"}]),json!([value["items"][0],value["items"][0]]),json!([value["items"][0],{"download_id":"unknown","status":"allowed","reason":"普通视频"}])]{let mut bad=value.clone();bad["items"]=change;assert!(validate(&bad,&ids).is_err());}
 let mut bad=value.clone();bad["items"][1]["status"]=json!("publish");assert!(validate(&bad,&ids).is_err());bad=value.clone();bad["items"][1]["text"]=json!("Unrequested caption");assert!(validate(&bad,&ids).is_err());
}
#[test]
fn provider_cooldown_is_persistent_and_shared_by_manual_requests(){
 let dir=tempfile::tempdir().unwrap();let p=dir.path().join("db");let at=now();let store=Store::open(&p).unwrap();store.tiktok_available(at).unwrap();store.cool_down_tiktok(at).unwrap();assert!(store.tiktok_available(at+1).is_err());drop(store);let reopened=Store::open(&p).unwrap();assert!(reopened.tiktok_available(at+60_000).is_err());assert!(reopened.tiktok_available(at+15*60_000).is_ok());
}

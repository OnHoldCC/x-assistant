use onhold_backend::{store::{Store,Snapshot,now},video};
use serde_json::json;
#[test]
fn video_plans_schedule_owned_deduplicated_captions_and_pause_without_blocking_other_work(){
 let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().join("db")).unwrap();let at=now();
 store.ingest(serde_json::from_value::<Snapshot>(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
 let client=uuid::Uuid::new_v4().to_string();store.session_status(&client,"example","logged_in","",at).unwrap();store.set_automation_support(&client,true).unwrap();store.set_extension_version(&client,"1.5.25").unwrap();
 let config=json!({"action":"auto_video","interval_minutes":1,"limit":1,"source_urls":["https://www.tiktok.com/search?q=cats"]});
 let mut invalid=config.clone();invalid["source_urls"]=json!(["https://evil.example/"]);assert!(store.save_automation("example",&invalid,at).is_err());
 invalid=config.clone();invalid["limit"]=json!(2);assert!(store.save_automation("example",&invalid,at).is_err());
 invalid=config.clone();invalid["source_urls"]=json!(["https://www.tiktok.com/","https://www.tiktok.com/@cats"]);assert!(store.save_automation("example",&invalid,at).is_err());
 let task=store.save_automation("example",&config,at).unwrap()["id"].as_str().unwrap().to_owned();
 assert!(store.run_automation("example",&task,at).is_err());store.control_automation("example",&task,true,at).unwrap();assert!(store.run_automation("example",&task,at).is_err(),"old plugins cannot receive video work");
 store.set_extension_version(&client,"1.5.26").unwrap();let capture=store.run_automation("example",&task,at).unwrap()["id"].as_str().unwrap().to_owned();
 assert!(store.run_automation("example",&task,at).is_err(),"no concurrent account tasks");
 store.set_extension_version(&client,"1.5.25").unwrap();assert!(store.claim(&client,"example",at).unwrap().is_null());store.set_extension_version(&client,"1.5.26").unwrap();
 let job=store.claim(&client,"example",at).unwrap();assert_eq!(job["id"],capture);assert_eq!(job["action"],"capture_tiktok");assert_eq!(job["input"]["source_urls"],config["source_urls"]);
 let url="https://www.tiktok.com/@creator/video/123";
 assert!(store.video_capture_context(&capture,"wrong",url,at).is_err());assert!(store.video_capture_context(&capture,&client,"https://evil.example/123",at).is_err());
 assert!(store.record_video_source(&capture,"wrong",url,at).is_err());store.record_video_source(&capture,&client,url,at).unwrap();
 let selected=store.job_records("example",&json!({"task_type":"capture_tiktok"})).unwrap();assert_eq!(selected["items"][0]["input"]["source"]["url"],url);assert_eq!(selected["items"][0]["input"]["source"]["id"],"123");
 let id=uuid::Uuid::new_v4().to_string();let data=json!({"download_id":id,"id":"123","source":url,"author":"creator","title":"A kitten plays","capture_job":capture,"capture_client":client});
 let caption=store.enqueue_video_caption("example",&data,false,at+1).unwrap();assert_eq!(caption["input"]["task_id"],task);assert_eq!(caption["input"]["capture_job"],capture);
 assert!(store.video_capture_context(&capture,&client,url,at+2).is_err(),"deduplicate even before model completion");
 store.finish_video_capture(&capture,&client,None,at+2).unwrap().unwrap();let records=store.job_records("example",&json!({"task_type":"capture_tiktok"})).unwrap();assert_eq!(records["items"][0]["result"]["prepared"],1);
 assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["last_job"]["id"],id);
 store.control_automation("example",&task,false,at+3).unwrap();assert!(store.claim_rewrite(at+4).unwrap().is_null());assert_eq!(store.video_caption_job(&id).unwrap()["state"],"failed");
 store.control_automation("example",&task,true,at+5).unwrap();let next=store.run_automation("example",&task,at+5).unwrap()["id"].as_str().unwrap().to_owned();
 let claimed=store.claim(&client,"example",at+6).unwrap();assert_eq!(claimed["input"]["known_ids"],json!(["123"]));
 store.finish_video_capture(&next,&client,None,at+7).unwrap().unwrap();let records=store.job_records("example",&json!({"task_type":"capture_tiktok","state":"skipped"})).unwrap();assert_eq!(records["total"],1);assert_eq!(records["items"][0]["result"]["sent"],false);
 let limited=store.run_automation("example",&task,at+8).unwrap()["id"].as_str().unwrap().to_owned();store.claim(&client,"example",at+8).unwrap();store.finish_video_capture(&limited,&client,Some("TikTok 页面返回 HTTP 429"),at+9).unwrap().unwrap();
 let state=store.automation_state("example").unwrap();let plan=&state["tasks"][0];assert_eq!(plan["enabled"],true);assert!(plan["next_run"].as_i64().unwrap()>=at+9+15*60_000);assert!(plan["last_job"]["error"].as_str().unwrap().contains("未调用模型"));
 let batch=store.run_automation("example",&task,at+10).unwrap()["id"].as_str().unwrap().to_owned();store.claim(&client,"example",at+10).unwrap();
 let china="https://www.tiktok.com/embed/v2/234";let denied="https://www.tiktok.com/embed/v2/345";
 assert!(store.skip_video_source(&batch,"wrong",china,"中国相关",false,at+10).is_err());
 store.skip_video_source(&batch,&client,china,"中国相关",false,at+10).unwrap();store.skip_video_source(&batch,&client,denied,"HTTP 403",true,at+10).unwrap();store.finish_video_capture(&batch,&client,None,at+11).unwrap();
 let records=store.job_records("example",&json!({"task_type":"capture_tiktok","state":"skipped"})).unwrap();let result=&records["items"][0]["result"];assert_eq!(result["filtered"],1);assert_eq!(result["unavailable"],1);
 let next=store.run_automation("example",&task,at+12).unwrap()["id"].as_str().unwrap().to_owned();let job=store.claim(&client,"example",at+12).unwrap();let known=job["input"]["known_ids"].as_array().unwrap();assert!(known.contains(&json!("234")));assert!(known.contains(&json!("345")));store.finish_video_capture(&next,&client,None,at+13).unwrap();
 let later=at+3600_020;store.session_status(&client,"example","logged_in","",later).unwrap();store.run_automation("example",&task,later).unwrap();let job=store.claim(&client,"example",later).unwrap();let known=job["input"]["known_ids"].as_array().unwrap();assert!(known.contains(&json!("234")));assert!(!known.contains(&json!("345")),"unavailable clips may be retried after an hour");assert!(store.video_capture_context(job["id"].as_str().unwrap(),&client,denied,later).is_ok());assert!(store.video_capture_context(job["id"].as_str().unwrap(),&client,china,later).is_err());
}
#[test]
fn video_source_validation_allows_only_supported_tiktok_pages(){
 for url in ["https://www.tiktok.com/","https://tiktok.com/foryou","https://www.tiktok.com/search/video?q=cats","https://www.tiktok.com/@cats","https://www.tiktok.com/@cats/video/123"]{assert!(video::source_page(url).is_ok(),"{url}");}
 for url in ["https://www.tiktok.com.evil.example/","https://a@www.tiktok.com/","http://www.tiktok.com/","https://www.tiktok.com:123/","https://www.tiktok.com/login","file:///tmp/video"]{assert!(video::source_page(url).is_err(),"{url}");}
}

#[test]
fn video_publishing_is_opt_in_and_stops_when_its_plan_is_paused(){
 let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().join("db")).unwrap();let at=now();
 store.ingest(serde_json::from_value::<Snapshot>(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
 let client=uuid::Uuid::new_v4().to_string();store.session_status(&client,"example","logged_in","",at).unwrap();store.set_automation_support(&client,true).unwrap();store.set_extension_version(&client,"1.5.29").unwrap();
 let config=json!({"action":"auto_video","interval_minutes":1,"limit":1,"source_urls":["https://www.tiktok.com/"],"publish_mode":"automatic"});
 let mut invalid=config.clone();invalid["publish_mode"]=json!("anything");assert!(store.save_automation("example",&invalid,at).is_err());
 let task=store.save_automation("example",&config,at).unwrap()["id"].as_str().unwrap().to_owned();store.control_automation("example",&task,true,at).unwrap();let capture=store.run_automation("example",&task,at).unwrap()["id"].as_str().unwrap().to_owned();store.claim(&client,"example",at).unwrap();
 let id=uuid::Uuid::new_v4().to_string();let data=json!({"download_id":id,"id":"123","source":"https://www.tiktok.com/embed/v2/123","title":"Kitten","capture_job":capture,"capture_client":client});store.enqueue_video_caption("example",&data,false,at).unwrap();store.finish_video_capture(&capture,&client,None,at).unwrap();store.claim_rewrite(at).unwrap();
 let ready=json!({"status":"ready","text":"A playful kitten. #Cats","processing":{"verified":true}});store.finish_video_caption(&id,Ok(&ready),true,at).unwrap();
 let pub_id=store.enqueue_video_publication(&id,"example",true,at).unwrap()["id"].as_str().unwrap().to_owned();assert_eq!(store.claim(&client,"example",at).unwrap()["id"],pub_id);
 store.control_automation("example",&task,false,at).unwrap();assert!(store.video_upload_context(&pub_id,&client,at).is_err());assert!(store.begin_publish(&pub_id,&client,at).is_err());
}

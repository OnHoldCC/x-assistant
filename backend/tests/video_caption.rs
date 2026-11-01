#![cfg(unix)]
use onhold_backend::{models::{ModelConfig,Runtime},store::{Store,now},video};
use serde_json::{json,Value};
use std::{sync::Arc,path::Path,os::unix::fs::PermissionsExt};

fn setup(title:&str)->(tempfile::TempDir,Arc<Store>,Value){
 let dir=tempfile::tempdir().unwrap();let store=Arc::new(Store::open(dir.path().join("db")).unwrap());
 store.ingest(serde_json::from_value(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),now()).unwrap();
 let id=uuid::Uuid::new_v4().to_string();let folder=dir.path().join("media/tiktok").join(&id);std::fs::create_dir_all(&folder).unwrap();
 assert!(std::process::Command::new("ffmpeg").args(["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","color=c=blue:s=64x64:d=3","-c:v","libx264","-pix_fmt","yuv420p"]).arg(folder.join("source.mp4")).status().unwrap().success());
 // The fake CLI checks attachment arguments; FFmpeg processes an actual synthetic clip.
 std::fs::write(folder.join("caption-preview.jpg"),[255,216,0,0,255,217]).unwrap();
 let value=json!({"download_id":id,"id":"123","author":"creator","title":title,"source":"https://www.tiktok.com/@creator/video/123","filename":folder.join("source.mp4"),"caption_account":"example","requires_review":true,"published":false});
 video::persist(dir.path(),&id,&value).unwrap();
 let exe=dir.path().join("fake-codex");
 std::fs::write(&exe,r#"#!/bin/sh
folder=$(dirname "$0")
printf x >> "$folder/calls"
printf '%s\n' "$@" > "$folder/args"
while [ "$#" -gt 0 ]; do
 if [ "$1" = '--output-last-message' ]; then shift; output="$1"; fi
 if [ "$1" = '--image' ]; then shift; test -f "$1" || exit 2; fi
 if [ "$1" = '--output-schema' ]; then shift; schema="$1"; fi
 shift
done
cat >/dev/null
if grep -q download_id "$schema"; then cat "$folder/screening.json" > "$output"; else cat "$folder/response.json" > "$output"; fi
printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":60,"output_tokens":20}}'
"#).unwrap();std::fs::set_permissions(&exe,std::fs::Permissions::from_mode(0o700)).unwrap();
 let config=ModelConfig{cli_path:exe.to_string_lossy().into_owned(),..Default::default()};
 std::fs::write(dir.path().join("model-settings.json"),json!({"config":config,"keys":{}}).to_string()).unwrap();
 (dir,store,value)
}
fn response(home:&Path,value:&Value){std::fs::write(home.join("response.json"),value.to_string()).unwrap();}
async fn finished(store:&Store,id:&str)->Value{
 tokio::time::timeout(std::time::Duration::from_secs(8),async{loop{let job=store.video_caption_job(id).unwrap();if ["completed","failed"].contains(&job["state"].as_str().unwrap()){break job;}tokio::time::sleep(std::time::Duration::from_millis(30)).await;}}).await.unwrap()
}
#[tokio::test]
async fn captions_use_visual_input_never_publish_and_count_usage(){
 let (dir,store,data)=setup("A kitten and a confetti balloon");let id=data["download_id"].as_str().unwrap();
 response(dir.path(),&json!({"schema_version":1,"status":"ready","text":"One piece of confetti decided gravity was optional. #Cats #FunnyPets","reason":"","editing":{"regions":[],"trim_end_seconds":0}}));
 store.enqueue_video_caption("example",&data,false,now()).unwrap();store.enqueue_video_caption("example",&data,true,now()).unwrap();
 assert!(store.enqueue_video_caption("other",&data,false,now()).is_err());
 let client=uuid::Uuid::new_v4().to_string();store.session_status(&client,"example","logged_in","",now()).unwrap();store.set_automation_support(&client,true).unwrap();store.set_extension_version(&client,serde_json::from_str::<Value>(include_str!("../../extension/manifest.json")).unwrap()["version"].as_str().unwrap()).unwrap();
 assert!(store.claim(&client,"example",now()).unwrap().is_null(),"browser workers never claim caption jobs");
 let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.clone().run_rewrite_queue());
 let job=finished(&store,id).await;assert_eq!(job["state"],"completed");assert_eq!(job["result"]["sent"],false);assert!(job["result"]["url"].is_null());
 assert_eq!(job["input"]["telemetry"]["generations"][0]["usage"]["total_tokens"],120);
 let status=runtime.call("video_caption_status",json!({"download_id":id})).await.unwrap();assert_eq!(status["caption_status"],"ready");assert!(status["requires_review"].as_bool().unwrap());
 assert_eq!(std::fs::read_to_string(video::folder(dir.path(),id).unwrap().join("caption.txt")).unwrap(),job["result"]["text"].as_str().unwrap());
 let args=std::fs::read_to_string(dir.path().join("args")).unwrap();for required in ["--image","--output-schema","shell_tool","unified_exec","web_search=\"disabled\""]{assert!(args.contains(required),"{required}");}
 let stats=store.dashboard(Some("example"),7,now()).unwrap();let row=stats["task_stats"].as_array().unwrap().iter().find(|r|r["action"]=="video_caption").unwrap();assert_eq!(row["tokens"],120);assert_eq!(row["completed"],1);
 runtime.call("retry_video_caption",json!({"download_id":id})).await.unwrap();assert_eq!(std::fs::read_to_string(dir.path().join("calls")).unwrap(),"x","completed captions never spend tokens again");
 assert!(std::fs::read(data["filename"].as_str().unwrap()).unwrap().len()>1000);worker.abort();
}
#[tokio::test]
async fn forbidden_titles_skip_the_model_and_failed_attempts_retry_without_redownloading(){
 let (dir,store,data)=setup("Election debate with the president");let id=data["download_id"].as_str().unwrap();
 store.enqueue_video_caption("example",&data,false,now()).unwrap();let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.run_rewrite_queue());
 let job=finished(&store,id).await;assert_eq!(job["result"]["status"],"rejected");assert_eq!(job["input"]["model_not_called"],true);assert!(!dir.path().join("calls").exists());worker.abort();
 let (dir,store,data)=setup("A kitten playing");let id=data["download_id"].as_str().unwrap();response(dir.path(),&json!({"invalid":"response"}));
 store.enqueue_video_caption("example",&data,false,now()).unwrap();let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.clone().run_rewrite_queue());
 assert_eq!(finished(&store,id).await["state"],"failed");
 response(dir.path(),&json!({"schema_version":1,"status":"ready","text":"A tiny moment of kitten chaos. #Cats","reason":"","editing":{"regions":[],"trim_end_seconds":0}}));
 runtime.call("retry_video_caption",json!({"download_id":id})).await.unwrap();runtime.call("retry_video_caption",json!({"download_id":id})).await.unwrap();
 let job=finished(&store,id).await;assert_eq!(job["state"],"completed");assert_eq!(job["input"]["telemetry"]["generations"].as_array().unwrap().len(),2);assert_eq!(std::fs::read_to_string(dir.path().join("calls")).unwrap(),"xx");
 assert!(runtime.call("video_caption_status",json!({"download_id":"../../secrets"})).await.is_err());worker.abort();
}
#[test]
fn caption_validation_never_returns_copy_for_rejected_or_uncertain_content(){
 for status in ["rejected","needs_review"]{assert!(video::validate_caption(&json!({"schema_version":1,"status":status,"text":"Share this.","reason":"不允许"})).is_err());assert!(video::validate_caption(&json!({"schema_version":1,"status":status,"text":"","reason":"不允许"})).is_ok());}
 assert_eq!(video::validate_caption(&json!({"schema_version":1,"status":"ready","text":"President gives a speech.","reason":""})).unwrap()["status"],"rejected");
 for text in ["访问这个视频","Hello https://evil.example","Follow @person","A kitten #Cats #Pets #Funny",""]{assert!(video::validate_caption(&json!({"schema_version":1,"status":"ready","text":text,"reason":""})).is_err());}
}

#[tokio::test]
async fn chinese_page_context_is_filtered_before_network_download_or_model_calls(){
 let (dir,store,_)=setup("A kitten plays");let runtime=Runtime::new(dir.path().to_path_buf(),store.clone());
 let before=std::fs::read_dir(dir.path().join("media/tiktok")).unwrap().count();
 let result=tokio::time::timeout(std::time::Duration::from_millis(500),runtime.call("download_tiktok_video",json!({"account":"example","url":"https://www.tiktok.com/embed/v2/987654321","source_text":"A Chinese celebrity in Shanghai"}))).await.unwrap().unwrap();
 assert_eq!(result["skipped"],true);assert_eq!(result["caption_status"],"rejected");assert!(result["caption_reason"].as_str().unwrap().contains("中国"));assert_eq!(std::fs::read_dir(dir.path().join("media/tiktok")).unwrap().count(),before);assert!(!dir.path().join("calls").exists());assert!(store.jobs().unwrap().as_array().unwrap().is_empty());
}

#[tokio::test]
#[ignore = "requires an explicitly supplied public TikTok URL and network access; never invokes a model or publishes"]
async fn live_video_download_without_model_or_publication(){
 let url=std::env::var("ONHOLD_TIKTOK_TEST_URL").expect("set ONHOLD_TIKTOK_TEST_URL explicitly");let dir=tempfile::tempdir().unwrap();
 let value=video::download(dir.path(),&url).await.unwrap();
 let bytes=std::fs::read(value["filename"].as_str().unwrap()).unwrap();assert_eq!(&bytes[4..8],b"ftyp");assert!(bytes.len()>1000);assert_eq!(value["published"],false);assert_eq!(value["source"],url);
}

#[test]
fn video_captions_require_related_tag_slots_without_allowing_mentions_or_tag_spam(){
 for text in ["A playful kitten. #Cats","A playful kitten. #Cats #Pets"]{assert_eq!(video::validate_caption(&json!({"schema_version":1,"status":"ready","text":text,"reason":""})).unwrap()["status"],"ready");}
 for text in ["A playful kitten.","A playful kitten. #Cats #cats","A playful kitten. #Cats #Pets #Funny","A playful kitten. #Pets123","#Cats #Pets"]{assert!(video::validate_caption(&json!({"schema_version":1,"status":"ready","text":text,"reason":""})).is_err(),"{text}");}
 assert_eq!(video::validate_caption(&json!({"schema_version":1,"status":"ready","text":"A walking tour. #ChinaTravel","reason":""})).unwrap()["status"],"rejected");
}

#[tokio::test]
async fn processed_videos_require_owned_upload_media_and_confirmed_receipts(){
 let (dir,store,data)=setup("A calm blue scene");let id=data["download_id"].as_str().unwrap();let original=std::fs::read(data["filename"].as_str().unwrap()).unwrap();
 assert!(onhold_backend::video_processing::prepare(dir.path(),id,&json!({"regions":[{"x":990,"y":20,"width":5,"height":100}],"trim_end_seconds":0})).await.is_err(),"near-edge boxes on tiny clips must reject instead of underflowing");
 response(dir.path(),&json!({"schema_version":1,"status":"ready","text":"A quiet blue moment. #Video","reason":"","editing":{"regions":[],"trim_end_seconds":0}}));
 store.enqueue_video_caption("example",&data,false,now()).unwrap();
 let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.clone().run_rewrite_queue());
 let job=finished(&store,id).await;assert_eq!(job["state"],"completed","{job}");assert_eq!(job["result"]["processing"]["verified"],true);
 assert_eq!(std::fs::read(data["filename"].as_str().unwrap()).unwrap(),original);assert!(video::folder(dir.path(),id).unwrap().join("processed.mp4").is_file());
 assert!(store.video_publication(id).unwrap().is_null(),"review is the default and must not create a publishing job");
 assert!(store.enqueue_video_publication(id,"other",false,now()).is_err());
 let publication=store.enqueue_video_publication(id,"example",false,now()).unwrap();let pid=publication["id"].as_str().unwrap();assert_eq!(store.enqueue_video_publication(id,"example",false,now()).unwrap()["queued"],false);
 let client=uuid::Uuid::new_v4().to_string();store.session_status(&client,"example","logged_in","",now()).unwrap();store.set_automation_support(&client,true).unwrap();store.set_extension_version(&client,"1.5.28").unwrap();assert!(store.claim(&client,"example",now()).unwrap().is_null(),"old plugins must never post a text-only substitute");
 store.set_extension_version(&client,"1.5.29").unwrap();assert_eq!(store.claim(&client,"example",now()).unwrap()["id"],pid);
 assert!(runtime.call("video_upload_chunk",json!({"id":pid,"client":"wrong","offset":0})).await.is_err());
 assert!(runtime.call("video_upload_chunk",json!({"id":pid,"client":client,"offset":999999999})).await.is_err());
 let chunk=runtime.call("video_upload_chunk",json!({"id":pid,"client":client,"offset":0})).await.unwrap();assert_eq!(chunk["offset"],0);assert!(chunk["bytes"].as_array().unwrap().len()>1000);
 assert!(store.begin_publish(pid,&client,now()).is_err());assert!(store.bind_video_media(pid,&client,"bad-media",now()).is_err());store.bind_video_media(pid,&client,"456",now()).unwrap();assert!(store.bind_video_media(pid,&client,"789",now()).is_err());
 store.begin_publish(pid,&client,now()).unwrap();assert!(runtime.call("video_upload_chunk",json!({"id":pid,"client":client,"offset":0})).await.is_err());
 let receipt=json!({"url":"https://x.com/example/status/987","media_id":"456"});assert!(store.finish_publication(pid,&client,&json!({"url":"https://x.com/example/status/987"}),None,now()).is_err());store.finish_publication(pid,&client,&receipt,None,now()).unwrap();
 assert_eq!(runtime.call("video_caption_status",json!({"download_id":id})).await.unwrap()["published"],true);
 assert!(store.prepare_existing_video(id,"example",now()).is_err(),"never change a file after queuing publication");
 let stats=store.dashboard(Some("example"),7,now()).unwrap();assert!(stats["task_stats"].as_array().unwrap().iter().any(|r|r["input"]["mode"]=="video"&&r["completed"]==1&&r["missing_usage"]==0));worker.abort();
}

#[tokio::test]
async fn unsafe_or_unresolved_watermarks_stop_after_one_verification_and_keep_both_call_costs(){
 let (dir,store,data)=setup("A calm blue scene");let id=data["download_id"].as_str().unwrap();
 std::fs::write(video::folder(dir.path(),id).unwrap().join("processed-preview.jpg"),[255,216,0,0,255,217]).unwrap();
 response(dir.path(),&json!({"schema_version":1,"status":"ready","text":"A quiet blue moment. #Video","reason":"","editing":{"regions":[{"x":40,"y":40,"width":100,"height":100}],"trim_end_seconds":0}}));
 store.enqueue_video_caption("example",&data,false,now()).unwrap();let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.run_rewrite_queue());
 let job=finished(&store,id).await;assert_eq!(job["state"],"completed","{job}");assert_eq!(job["result"]["status"],"needs_review");assert_eq!(job["result"]["text"],"");assert_eq!(job["result"]["processing"]["verified"],false);assert!(std::fs::metadata(video::folder(dir.path(),id).unwrap().join("processed-preview.jpg")).unwrap().len()>100,"reprocessing must replace a stale cached preview before model review");
 assert_eq!(job["input"]["telemetry"]["generations"].as_array().unwrap().len(),2);assert_eq!(std::fs::read_to_string(dir.path().join("calls")).unwrap(),"xx");assert!(store.enqueue_video_publication(id,"example",false,now()).is_err());worker.abort();
}

#[tokio::test]
async fn new_model_results_cannot_stop_silently_at_a_legacy_caption_without_video_checks(){
 let (dir,store,data)=setup("A kitten plays");let id=data["download_id"].as_str().unwrap();
 response(dir.path(),&json!({"schema_version":1,"status":"ready","text":"A playful kitten. #Cats","reason":""}));
 store.enqueue_video_caption("example",&data,false,now()).unwrap();let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.run_rewrite_queue());
 let job=finished(&store,id).await;assert_eq!(job["state"],"failed");assert!(job["error"].as_str().unwrap().contains("未返回水印和片尾检查方案"));assert!(store.video_publication(id).unwrap().is_null());assert_eq!(std::fs::read_to_string(dir.path().join("calls")).unwrap(),"x");worker.abort();
}

#[tokio::test]
async fn batch_screening_retries_reuse_files_and_only_allowed_clips_generate_captions(){
 let (dir,store,base)=setup("An ordinary scene");let client=uuid::Uuid::new_v4().to_string();let at=now();
 store.session_status(&client,"example","logged_in","",at).unwrap();store.set_automation_support(&client,true).unwrap();store.set_extension_version(&client,"1.5.30").unwrap();
 let task=store.save_automation("example",&json!({"action":"auto_video","interval_minutes":1,"limit":5,"source_urls":["https://www.tiktok.com/"]}),at).unwrap()["id"].as_str().unwrap().to_owned();store.control_automation("example",&task,true,at).unwrap();let capture=store.run_automation("example",&task,at).unwrap()["id"].as_str().unwrap().to_owned();store.claim(&client,"example",at).unwrap();
 let mut ids=Vec::new();
 for number in 0..3 {
  let mut data=base.clone();let id=if number==0{base["download_id"].as_str().unwrap().to_owned()}else{uuid::Uuid::new_v4().to_string()};let folder=dir.path().join("media/tiktok").join(&id);std::fs::create_dir_all(&folder).unwrap();
  if number>0{std::fs::copy(base["filename"].as_str().unwrap(),folder.join("source.mp4")).unwrap();}
  data["download_id"]=json!(id);data["id"]=json!(format!("12{number}"));data["source"]=json!(format!("https://www.tiktok.com/embed/v2/12{number}"));data["filename"]=json!(folder.join("source.mp4"));data["capture_job"]=json!(capture);data["capture_client"]=json!(client);data["screen_first"]=json!(true);video::persist(dir.path(),&id,&data).unwrap();
  store.enqueue_video_caption("example",&data,false,now()).unwrap();ids.push(id);
 }
 assert!(store.claim_rewrite(now()).unwrap().is_null(),"caption generation waits for the completed batch");
 store.finish_video_capture(&capture,&client,None,now()).unwrap();let screen=format!("screen-{capture}");assert!(store.claim(&client,"example",now()).unwrap().is_null(),"browser workers cannot claim model screening");
 response(dir.path(),&json!({"schema_version":1,"status":"ready","text":"A quiet blue scene. #Video","reason":"","editing":{"regions":[],"trim_end_seconds":0}}));
 let verdict=json!({"schema_version":1,"items":[{"download_id":ids[0],"status":"allowed","reason":"普通生活"},{"download_id":ids[1],"status":"needs_review","reason":"敏感主题无法确定"},{"download_id":ids[2],"status":"excluded","reason":"血腥内容"}]});
 std::fs::write(dir.path().join("screening.json"),json!({"schema_version":1,"items":[]}).to_string()).unwrap();let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.clone().run_rewrite_queue());
 assert_eq!(finished(&store,&ids[0]).await["state"],"failed");assert!(runtime.call("retry_video_caption",json!({"download_id":ids[0]})).await.is_err());assert!(store.retry_video_screening("other",&screen,now()).is_err());
 std::fs::write(dir.path().join("screening.json"),verdict.to_string()).unwrap();store.retry_video_screening("example",&screen,now()).unwrap();
 let ready=finished(&store,&ids[0]).await;assert_eq!(ready["state"],"completed","{ready}");assert_eq!(ready["result"]["processing"]["verified"],true);
 for (index,status) in [(1,"needs_review"),(2,"rejected")]{let job=store.video_caption_job(&ids[index]).unwrap();assert_eq!(job["result"]["status"],status);assert_eq!(job["input"]["model_not_called"],true);assert!(job["input"]["telemetry"]["generations"].is_null());assert!(!video::folder(dir.path(),&ids[index]).unwrap().join("caption.txt").exists());assert!(store.prepare_existing_video(&ids[index],"example",now()).is_err());}
 let records=store.job_records("example",&json!({"task_type":"video_screening"})).unwrap();assert_eq!(records["items"][0]["id"],screen);assert_eq!(records["items"][0]["result"]["allowed"],1);assert_eq!(records["items"][0]["result"]["excluded"],1);assert_eq!(records["items"][0]["result"]["needs_review"],1);
 assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["last_job"]["id"],ids[0],"plan progress follows the child that actually finished last, not the earlier batch container");
 assert_eq!(std::fs::read_to_string(dir.path().join("calls")).unwrap(),"xxx","one failed batch, one explicit retry and one allowed caption, without downloading again");worker.abort();
}

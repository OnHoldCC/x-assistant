#![cfg(unix)]
use onhold_backend::{models::{ModelConfig,Runtime},store::{Store,now},video};
use serde_json::{json,Value};
use std::{sync::Arc,path::Path,os::unix::fs::PermissionsExt};

fn setup(title:&str)->(tempfile::TempDir,Arc<Store>,Value){
 let dir=tempfile::tempdir().unwrap();let store=Arc::new(Store::open(dir.path().join("db")).unwrap());
 store.ingest(serde_json::from_value(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),now()).unwrap();
 let id=uuid::Uuid::new_v4().to_string();let folder=dir.path().join("media/tiktok").join(&id);std::fs::create_dir_all(&folder).unwrap();
 std::fs::write(folder.join("source.mp4"),b"fixture video remains unchanged").unwrap();
 // The fake CLI only checks attachment arguments; live decoding is verified separately.
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
 shift
done
cat >/dev/null
cat "$folder/response.json" > "$output"
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
 response(dir.path(),&json!({"schema_version":1,"status":"ready","text":"One piece of confetti decided gravity was optional. #Cats #FunnyPets","reason":""}));
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
 assert_eq!(std::fs::read(data["filename"].as_str().unwrap()).unwrap(),b"fixture video remains unchanged");worker.abort();
}
#[tokio::test]
async fn forbidden_titles_skip_the_model_and_failed_attempts_retry_without_redownloading(){
 let (dir,store,data)=setup("Election debate with the president");let id=data["download_id"].as_str().unwrap();
 store.enqueue_video_caption("example",&data,false,now()).unwrap();let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.run_rewrite_queue());
 let job=finished(&store,id).await;assert_eq!(job["result"]["status"],"rejected");assert_eq!(job["input"]["model_not_called"],true);assert!(!dir.path().join("calls").exists());worker.abort();
 let (dir,store,data)=setup("A kitten playing");let id=data["download_id"].as_str().unwrap();response(dir.path(),&json!({"invalid":"response"}));
 store.enqueue_video_caption("example",&data,false,now()).unwrap();let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));let worker=tokio::spawn(runtime.clone().run_rewrite_queue());
 assert_eq!(finished(&store,id).await["state"],"failed");
 response(dir.path(),&json!({"schema_version":1,"status":"ready","text":"A tiny moment of kitten chaos. #Cats","reason":""}));
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

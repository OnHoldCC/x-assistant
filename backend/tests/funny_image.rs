use onhold_backend::store::{Store,Snapshot,now};
use serde_json::{json,Value};
fn setup()->(tempfile::TempDir,Store,String,String,i64){
    let dir=tempfile::tempdir().unwrap();let store=Store::open(dir.path().join("db")).unwrap();let at=now();
    store.ingest(serde_json::from_value::<Snapshot>(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
    let client=uuid::Uuid::new_v4().to_string();store.session_status(&client,"example","logged_in","",at).unwrap();store.set_automation_support(&client,true).unwrap();store.set_extension_version(&client,"1.5.31").unwrap();
    let task=store.save_automation("example",&json!({"action":"auto_image","interval_seconds":90,"limit":2}),at).unwrap()["id"].as_str().unwrap().to_owned();
    assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["enabled"],false);store.control_automation("example",&task,true,at).unwrap();
    (dir,store,client,task,at)
}
#[test]
fn original_images_skip_browser_collection_and_require_exact_media_receipts(){
    let (_dir,store,client,task,at)=setup();
    let queued=store.run_automation("example",&task,at).unwrap();assert_eq!(queued["job_ids"].as_array().unwrap().len(),2);
    assert!(store.claim(&client,"example",at).unwrap().is_null(),"backend generations never go to the browser");
    assert!(store.jobs().unwrap().as_array().unwrap().iter().all(|j|j["input"]["source"]["kind"]=="ai_generated"&&j["action"]=="rewrite_publish"));
    assert!(store.queue_funny_images("old-job",&client,&json!([]),at).is_err());
    let first=store.claim_rewrite(at).unwrap();let first=first["id"].as_str().unwrap();
    store.finish_funny_image(first,Ok(&json!({"schema_version":1,"image_type":"photo","status":"rejected","text":"","reason":"普通照片，没有清晰笑点"})),true,at).unwrap();
    let second=store.claim_rewrite(at+1).unwrap();let second=second["id"].as_str().unwrap();
    store.finish_funny_image(second,Ok(&ready()),true,at+1).unwrap();
    let job=store.claim(&client,"example",at+1).unwrap();assert_eq!(job["id"],second);assert_eq!(job["input"]["image_policy"],"cartoon_scene_v3");
    assert!(store.begin_publish(second,&client,at+2).is_err());
    assert!(store.bind_image_media(second,&client,"invalid",at+2).is_err());store.bind_image_media(second,&client,"456",at+2).unwrap();
    store.begin_publish(second,&client,at+3).unwrap();
    assert!(store.finish_publication(second,&client,&json!({"url":"https://x.com/example/status/999","media_id":"other"}),None,at+4).is_err());
    store.finish_publication(second,&client,&json!({"url":"https://x.com/example/status/999","media_id":"456"}),None,at+4).unwrap();
    assert!(store.retry_rewrite("example",second,at+5).is_err());
    assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["state"],"waiting");
    let records=store.job_records("example",&json!({"task_type":"image","state":"skipped"})).unwrap();assert_eq!(records["total"],1);
}
fn ready()->Value{json!({"schema_version":1,"image_type":"puzzle","status":"ready","text":"AI-made cartoon puzzle. Can you spot at least 10 changes? #SpotTheDifference","reason":"右下角蓝色伞下有一只猫，可辨识双耳、眼睛和尾巴"})}
#[test]
fn reviewed_memes_are_single_publications_require_both_reviews_and_exact_media(){
    let (_dir,store,client,_task,at)=setup();
    let review=json!({"source_url":"https://tieba.baidu.com/p/123","source_title":"动画反应图","pre_edit_review":{"decision":"pass","political_content":false,"political_figures_or_symbols":false,"political_innuendo":false,"private_information":false,"reason":"普通动画反应图，无政治内容"},"post_edit_review":{"decision":"pass","political_content":false,"watermark_remaining":false,"reason":"水印已移除，表情和画面保留"}});
    let caption="What are you wishing for today? #Memes";
    let id=uuid::Uuid::new_v4().to_string();
    for key in ["political_content","political_figures_or_symbols","political_innuendo"] {let mut bad=review.clone();bad["pre_edit_review"][key]=json!(true);assert!(store.enqueue_reviewed_meme("example",&id,&bad,caption,at).is_err());}
    let mut bad=review.clone();bad["post_edit_review"]["watermark_remaining"]=json!(true);assert!(store.enqueue_reviewed_meme("example",&id,&bad,caption,at).is_err());
    bad=review.clone();bad["source_url"]=json!("https://tieba.baidu.com.evil.example/p/123");assert!(store.enqueue_reviewed_meme("example",&id,&bad,caption,at).is_err());
    assert_eq!(store.enqueue_reviewed_meme("example",&id,&review,caption,at).unwrap()["id"],id);
    assert_eq!(store.enqueue_reviewed_meme("example",&uuid::Uuid::new_v4().to_string(),&review,caption,at).unwrap()["duplicate"],true);
    assert_eq!(store.claim(&client,"example",at).unwrap()["id"],id);
    assert!(store.begin_publish(&id,&client,at).is_err());store.bind_image_media(&id,&client,"456",at).unwrap();store.begin_publish(&id,&client,at).unwrap();
    assert!(store.finish_publication(&id,&client,&json!({"url":"https://x.com/example/status/789","media_id":"wrong"}),None,at).is_err());
    store.finish_publication(&id,&client,&json!({"url":"https://x.com/example/status/789","media_id":"456"}),None,at).unwrap();
}
#[test]
fn old_extension_and_paused_plans_cannot_publish_images(){
    let (_dir,store,client,task,at)=setup();
    store.set_extension_version(&client,"1.5.30").unwrap();assert!(store.run_automation("example",&task,at).is_err());store.set_extension_version(&client,"1.5.31").unwrap();
    store.run_automation("example",&task,at).unwrap();
    let job=store.claim_rewrite(at).unwrap();let id=job["id"].as_str().unwrap();store.finish_funny_image(id,Ok(&ready()),true,at).unwrap();
    let claimed=store.claim(&client,"example",at).unwrap();assert_eq!(claimed["id"],id);
    store.control_automation("example",&task,false,at+1).unwrap();
    assert!(store.bind_image_media(id,&client,"456",at+1).is_err());assert!(store.run_automation("example",&task,at+1).is_err());
}

#[tokio::test]
async fn images_api_generates_jpeg_retains_provenance_and_never_repeats_a_paid_request(){
    use base64::{Engine,engine::general_purpose::STANDARD};
    use onhold_backend::funny_image::{ImageConfig,generate};
    use std::sync::{Arc,atomic::{AtomicUsize,Ordering}};
    let dir=tempfile::tempdir().unwrap();let fixture=dir.path().join("fixture.jpg");
    assert!(std::process::Command::new("ffmpeg").args(["-hide_banner","-loglevel","error","-f","lavfi","-i","color=c=yellow:s=96x96","-frames:v","1"]).arg(&fixture).status().unwrap().success());
    let encoded=STANDARD.encode(std::fs::read(fixture).unwrap());let calls=Arc::new(AtomicUsize::new(0));let observed=calls.clone();
    let app=axum::Router::new().route("/v1/images/generations",axum::routing::post(move |headers:axum::http::HeaderMap,axum::Json(body):axum::Json<Value>|{
        let encoded=encoded.clone();let calls=observed.clone();async move {
            assert_eq!(headers["authorization"],"Bearer fixture-private-key");
            assert_eq!(body["model"],"gpt-image-2");assert_eq!(body["n"],1);assert_eq!(body["output_format"],"jpeg");assert_eq!(body["size"],"1024x1024");assert_eq!(body["quality"],"medium");
            calls.fetch_add(1,Ordering::SeqCst);
            if body["prompt"]=="external url" {axum::Json(json!({"data":[{"url":"http://127.0.0.1/private"}]}))}
            else {axum::Json(json!({"data":[{"b64_json":encoded}]}))}
        }
    }));
    let listener=tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();let address=listener.local_addr().unwrap();
    let server=tokio::spawn(async move {axum::serve(listener,app).await.unwrap();});
    let config=ImageConfig{endpoint:format!("http://{address}/v1"),..Default::default()};let id=uuid::Uuid::new_v4().to_string();
    let path=generate(dir.path(),&id,&config,"fixture-private-key","original image").await.unwrap();assert!(path.exists());
    let provenance=std::fs::read_to_string(path.parent().unwrap().join("generation.json")).unwrap();assert!(provenance.contains("original image"));assert!(!provenance.contains("fixture-private-key"));
    assert_eq!(generate(dir.path(),&id,&config,"fixture-private-key","original image").await.unwrap(),path);assert_eq!(calls.load(Ordering::SeqCst),1);
    let bad=uuid::Uuid::new_v4().to_string();assert!(generate(dir.path(),&bad,&config,"fixture-private-key","external url").await.unwrap_err().contains("不支持外部图片URL"));
    assert!(generate(dir.path(),&bad,&config,"fixture-private-key","external url").await.unwrap_err().contains("不重复付费"));assert_eq!(calls.load(Ordering::SeqCst),2);
    server.abort();
}

#[test]
fn legacy_reposted_images_cannot_pass_review_or_upload_even_with_an_old_ready_marker(){
    let (dir,store,client,task,at)=setup();let id=uuid::Uuid::new_v4().to_string();
    let old=json!({"task_id":task,"mode":"image","stage":"rewrite","source":{"id":"123","author":"writer","url":"https://x.com/writer/status/123","text":"old repost","image_url":"https://pbs.twimg.com/media/old"}});
    let db=rusqlite::Connection::open(dir.path().join("db")).unwrap();
    db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,'example','rewrite_publish','rewriting',?,?,?)",rusqlite::params![id,at,at,old.to_string()]).unwrap();
    assert!(store.finish_funny_image(&id,Ok(&ready()),true,at).unwrap_err().contains("转载图片任务已停用"));
    let mut old=old;old["stage"]=json!("ready");old["image_ready"]=json!(true);old["image_policy"]=json!("visual_humor_v2");old["text"]=ready()["text"].clone();old["publish_at"]=json!(at);
    db.execute("UPDATE jobs SET state='queued',input=?,result=? WHERE id=?",rusqlite::params![old.to_string(),ready().to_string(),id]).unwrap();
    assert_eq!(store.claim(&client,"example",at).unwrap()["id"],id);
    assert!(store.bind_image_media(&id,&client,"456",at).is_err());assert!(store.begin_publish(&id,&client,at).is_err());
}

#[test]
fn rejected_and_failed_images_release_the_plan_after_the_last_queued_image(){
    let (_dir,store,_client,task,at)=setup();
    store.run_automation("example",&task,at).unwrap();
    let first=store.claim_rewrite(at).unwrap();store.finish_funny_image(first["id"].as_str().unwrap(),Err("fixture failure"),false,at).unwrap();
    assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["state"],"queued");
    let second=store.claim_rewrite(at).unwrap();store.finish_funny_image(second["id"].as_str().unwrap(),Ok(&json!({"schema_version":1,"image_type":"puzzle","status":"needs_review","text":"","reason":"无法确认三处差异，未发布"})),true,at).unwrap();
    assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["state"],"waiting");
    store.run_automation("example",&task,at+1).unwrap();
    for _ in 0..2 {let job=store.claim_rewrite(at+1).unwrap();store.finish_funny_image(job["id"].as_str().unwrap(),Err("fixture failure"),false,at+1).unwrap();}
    assert_eq!(store.automation_state("example").unwrap()["tasks"][0]["state"],"error");
}

#[tokio::test]
async fn dense_puzzles_keep_zoomable_detail_without_upscaling_small_images(){
    use onhold_backend::funny_image::{begin,prepare};
    let dir=tempfile::tempdir().unwrap();
    for (size,expected) in [(96,96),(1600,1600),(2560,2048)] {
        let id=uuid::Uuid::new_v4().to_string();begin(dir.path(),&id,"fixture","dense puzzle").unwrap();
        let original=dir.path().join(format!("fixture-{size}.png"));
        assert!(std::process::Command::new("ffmpeg").args(["-hide_banner","-loglevel","error","-f","lavfi","-i",&format!("color=c=blue:s={size}x{size}"),"-frames:v","1"]).arg(&original).status().unwrap().success());
        let image=prepare(dir.path(),&id,&original,"dense puzzle","fixture").await.unwrap();
        let output=std::process::Command::new("ffprobe").args(["-v","error","-select_streams","v:0","-show_entries","stream=width,height","-of","json"]).arg(image).output().unwrap();
        let info:Value=serde_json::from_slice(&output.stdout).unwrap();assert_eq!(info["streams"][0]["width"],expected);assert_eq!(info["streams"][0]["height"],expected);
    }
}

#[tokio::test]
async fn scene_review_pairs_the_same_quadrants_and_leaves_other_images_whole(){
    let dir=tempfile::tempdir().unwrap();let id=uuid::Uuid::new_v4().to_string();let image=onhold_backend::funny_image::path(dir.path(),&id).unwrap();std::fs::create_dir_all(image.parent().unwrap()).unwrap();
    let filter="drawbox=x=0:y=0:w=200:h=400:color=red:t=fill,drawbox=x=200:y=0:w=200:h=400:color=blue:t=fill,drawbox=x=0:y=400:w=200:h=400:color=yellow:t=fill,drawbox=x=400:y=0:w=200:h=400:color=red:t=fill,drawbox=x=600:y=0:w=200:h=400:color=blue:t=fill,drawbox=x=400:y=400:w=200:h=400:color=yellow:t=fill";
    assert!(std::process::Command::new("ffmpeg").args(["-v","error","-f","lavfi","-i","color=c=green:s=800x800","-vf",filter,"-frames:v","1"]).arg(&image).status().unwrap().success());
    let views=onhold_backend::funny_image::review_images(dir.path(),&id,"spot_difference").await.unwrap();assert_eq!(views.len(),5);
    for (view,color) in views.iter().skip(1).zip([[255i16,0,0],[0,0,255],[255,255,0],[0,128,0]]) {
        let output=std::process::Command::new("ffmpeg").args(["-v","error","-i"]).arg(view).args(["-vf","scale=2:1","-frames:v","1","-f","rawvideo","-pix_fmt","rgb24","pipe:1"]).output().unwrap();
        assert_eq!(output.stdout.len(),6);for pixel in output.stdout.chunks_exact(3){assert!(pixel.iter().zip(color).all(|(a,b)|(*a as i16-b).abs()<20));}
    }
    assert_eq!(onhold_backend::funny_image::review_images(dir.path(),&id,"humor").await.unwrap(),vec![image]);
}

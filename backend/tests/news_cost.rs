use onhold_backend::{models::{ModelConfig,Runtime},store::{Store,now}};
use serde_json::json;
use std::sync::Arc;

#[tokio::test]
async fn web_news_without_explicit_permission_never_invokes_the_cli() {
    let dir=tempfile::tempdir().unwrap();
    let path=dir.path().join("db");
    let store=Arc::new(Store::open(&path).unwrap());
    let config=ModelConfig{cli_path:dir.path().join("must-not-launch-any-model").to_string_lossy().into_owned(),..Default::default()};
    std::fs::write(dir.path().join("model-settings.json"),serde_json::to_vec(&json!({"config":config,"keys":{}})).unwrap()).unwrap();
    let db=rusqlite::Connection::open(&path).unwrap();
    for (id,permission) in [("legacy",None),("disabled",Some(false))] {
        let mut input=json!({"mode":"news","stage":"rewrite","news_source":"web","query":"current entertainment"});
        if let Some(value)=permission {input["allow_news_search"]=json!(value);}
        db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,'example','rewrite_publish','queued',?,?,?)",
            rusqlite::params![id,now(),now(),input.to_string()]).unwrap();
    }
    let runtime=Arc::new(Runtime::new(dir.path().to_path_buf(),store.clone()));
    let worker=tokio::spawn(runtime.run_rewrite_queue());
    let result=tokio::time::timeout(std::time::Duration::from_secs(8),async {
        loop {
            let jobs=store.jobs().unwrap();
            let rows=jobs.as_array().unwrap();
            assert!(rows.iter().all(|job|job["state"]!="failed"),"a denied search must not reach even the missing test CLI");
            if rows.iter().all(|job|job["state"]=="completed") {
                for job in rows {
                    assert_eq!(job["input"]["stage"],"skipped");
                    assert_eq!(job["input"]["model_not_called"],true);
                    assert!(job["input"]["telemetry"]["generations"].is_null());
                    assert!(job["result"]["skip_reason"].as_str().unwrap().contains("未调用模型"));
                }
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }).await;
    worker.abort();
    result.unwrap();
}

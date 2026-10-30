use onhold_backend::{
    http,
    models::Runtime,
    store::{now, Snapshot, Store},
};
use serde_json::{json, Value};
use std::sync::Arc;

#[tokio::test]
async fn web_model_auth_settings_review_and_api_rewrite_work_without_desktop() {
    let directory = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::open(directory.path().join("data.sqlite3")).unwrap());
    store.ingest(serde_json::from_value::<Snapshot>(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),now()).unwrap();
    let client_id = uuid::Uuid::new_v4().to_string();
    store
        .session_status(&client_id, "example", "logged_in", "", now())
        .unwrap();
    store.set_automation_support(&client_id, true).unwrap();
    let manifest: Value =
        serde_json::from_str(include_str!("../../extension/manifest.json")).unwrap();
    store
        .set_extension_version(&client_id, manifest["version"].as_str().unwrap())
        .unwrap();
    let runtime = Arc::new(Runtime::new(directory.path().to_path_buf(), store.clone()));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let provider_port = listener.local_addr().unwrap().port();
    let provider = tokio::spawn(async move {
        let app=axum::Router::new().route("/v1/responses",axum::routing::post(|headers:axum::http::HeaderMap,axum::Json(body):axum::Json<Value>|async move {
            assert_eq!(headers["authorization"],"Bearer fixture-secret");
            assert_eq!(body["store"],false);assert_eq!(body["tools"],json!([]));
            let text=if body["instructions"].as_str().unwrap().contains("账号运营复盘助手") {"本次已验证复盘。"} else {"{\"text\":\"For 12 people: start with a clear idea, then explain it.\"}"};
            axum::Json(json!({"output":[{"type":"message","content":[{"type":"output_text","text":text}]}]}))
        }));
        axum::serve(listener, app).await.unwrap();
    });
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let router = http::router_with_models(
        store.clone(),
        directory.path().to_path_buf(),
        port,
        Some(runtime.clone()),
    )
    .unwrap();
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{port}/api/admin");
    let token = store.token().unwrap();
    assert_eq!(
        client
            .post(&url)
            .json(&json!({"operation":"model_config"}))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    let config = json!({"provider":"responses_api","model":"fixture","endpoint":format!("http://127.0.0.1:{provider_port}/v1"),"cli_path":"","api_style":"responses","key_saved":false});
    let saved=client.post(&url).bearer_auth(&token).json(&json!({"operation":"save_model_config","input":{"config":config,"apiKey":"fixture-secret"}})).send().await.unwrap().error_for_status().unwrap().json::<Value>().await.unwrap();
    assert_eq!(saved["key_saved"], true);
    assert!(!saved.to_string().contains("fixture-secret"));
    let context = json!({"account":"example"});
    let review=client.post(&url).bearer_auth(&token).json(&json!({"operation":"analyze_memory","input":{"account":"example","question":"复盘","context":context,"expectedConfig":saved}})).send().await.unwrap().error_for_status().unwrap().json::<Value>().await.unwrap();
    assert!(!review.is_null());
    let source = json!({"id":"123","author":"writer","url":"https://x.com/writer/status/123","text":"A clear idea for 12 people."});
    let queued = store.enqueue_rewrite("example", &source, now()).unwrap();
    let worker = tokio::spawn(runtime.run_rewrite_queue());
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let jobs = store.jobs().unwrap();
            let job = jobs
                .as_array()
                .unwrap()
                .iter()
                .find(|job| job["id"] == queued["id"])
                .unwrap();
            if job["input"]["stage"] == "ready" {
                assert_eq!(job["state"], "queued");
                assert!(job["input"]["publish_at"].is_null());
                break;
            }
            assert_ne!(job["state"], "failed", "{job}");
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    })
    .await
    .unwrap();
    worker.abort();
    server.abort();
    provider.abort();
}

#[cfg(unix)]
#[tokio::test]
async fn cli_worker_persists_actual_event_usage_separately_from_generated_json() {
    use std::os::unix::fs::PermissionsExt;
    let directory = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::open(directory.path().join("data.sqlite3")).unwrap());
    let at = now();
    store.ingest(serde_json::from_value::<Snapshot>(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
    let client = uuid::Uuid::new_v4().to_string();
    store
        .session_status(&client, "example", "logged_in", "", at)
        .unwrap();
    store.set_automation_support(&client, true).unwrap();
    let manifest: Value =
        serde_json::from_str(include_str!("../../extension/manifest.json")).unwrap();
    store
        .set_extension_version(&client, manifest["version"].as_str().unwrap())
        .unwrap();
    let executable = directory.path().join("fixture-codex");
    std::fs::write(&executable,r#"#!/bin/sh
while [ "$#" -gt 0 ]; do
 if [ "$1" = '--output-last-message' ]; then shift; output="$1"; fi
 shift
done
cat >/dev/null
printf '%s' '{"text":"For 12 people: a clear idea."}' > "$output"
printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":60,"output_tokens":20}}'
"#).unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
    let config = onhold_backend::models::ModelConfig {
        cli_path: executable.to_string_lossy().into_owned(),
        ..Default::default()
    };
    std::fs::write(
        directory.path().join("model-settings.json"),
        json!({"config":config,"keys":{}}).to_string(),
    )
    .unwrap();
    let queued=store.enqueue_rewrite("example",&json!({"id":"123","author":"writer","url":"https://x.com/writer/status/123","text":"A clear idea for 12 people."}),at).unwrap();
    let runtime = Arc::new(Runtime::new(directory.path().to_path_buf(), store.clone()));
    let worker = tokio::spawn(runtime.run_rewrite_queue());
    tokio::time::timeout(std::time::Duration::from_secs(5), async {
        loop {
            let jobs = store.jobs().unwrap();
            let job = jobs
                .as_array()
                .unwrap()
                .iter()
                .find(|job| job["id"] == queued["id"])
                .unwrap();
            if job["input"]["stage"] == "ready" {
                let runs = &job["input"]["telemetry"]["generations"];
                assert_eq!(runs.as_array().unwrap().len(), 1);
                assert_eq!(runs[0]["usage"]["total_tokens"], 120);
                assert_eq!(runs[0]["usage"]["cached_input_tokens"], 60);
                break;
            }
            assert_ne!(job["state"], "failed", "{job}");
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    })
    .await
    .unwrap();
    worker.abort();
}
#[tokio::test]
#[ignore = "uses a logged-in Codex account and live web search; never publishes"]
async fn live_news_search_without_publication() {
    use onhold_backend::models::{call_codex,writing_instructions,ModelConfig};
    let job=serde_json::json!({"input":{"mode":"news"}});
    let prompt=serde_json::json!({"query":"AI、科技与互联网最新新闻，优先官方公告","current_time":chrono::Utc::now().to_rfc3339(),"excluded_urls":[]}).to_string();
    let mut usage=None;
    let response=call_codex(&ModelConfig::default(),writing_instructions(&job),&prompt,&mut usage).await.unwrap();
    let value:serde_json::Value=serde_json::from_str(&response).unwrap();
    assert_eq!(value["schema_version"],1);
    assert!(usage.as_ref().is_some_and(|usage|usage["total_tokens"].as_u64().unwrap_or(0)>0));
    eprintln!("Live news search: source={}, title={}, usage={}",value["news"]["url"],value["news"]["title"],usage.unwrap());
}

use onhold_backend::{
    http,
    models::Runtime,
    store::{now, Snapshot, Store},
};
use serde_json::{json, Value};
use std::sync::Arc;

#[tokio::test]
#[ignore = "requires logged-in Codex CLI and Playwright; synthetic account and intercepted X only"]
async fn real_codex_to_browser_receipt_and_database() {
    run_fixture(false).await;
}

#[tokio::test]
#[ignore = "requires logged-in Codex CLI and Playwright; synthetic For You and intercepted replies only"]
async fn real_codex_for_you_reply_chain() {
    run_fixture(true).await;
}

async fn run_fixture(reply: bool) {
    let directory = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::open(directory.path().join("fixture.sqlite3")).unwrap());
    store.ingest(serde_json::from_value::<Snapshot>(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),now()).unwrap();
    let client = uuid::Uuid::new_v4().to_string();
    store
        .session_status(&client, "example", "logged_in", "", now())
        .unwrap();
    store.set_automation_support(&client, true).unwrap();
    let manifest: Value =
        serde_json::from_str(include_str!("../../extension/manifest.json")).unwrap();
    store
        .set_extension_version(&client, manifest["version"].as_str().unwrap())
        .unwrap();
    let runtime = Arc::new(Runtime::new(directory.path().to_path_buf(), store.clone()));
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
    let worker = tokio::spawn(runtime.run_rewrite_queue());
    let mut command = tokio::process::Command::new("node");
    command
        .arg(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(if reply {
                "../test/for-you-browser.mjs"
            } else {
                "../test/publication-browser.mjs"
            }),
        )
        .env("ONHOLD_E2E_ENDPOINT", format!("http://127.0.0.1:{port}"))
        .env("ONHOLD_E2E_TOKEN", store.token().unwrap())
        .env("ONHOLD_E2E_CLIENT", client)
        .kill_on_drop(true);
    let output = tokio::time::timeout(std::time::Duration::from_secs(180), command.output())
        .await
        .unwrap()
        .unwrap();
    worker.abort();
    server.abort();
    assert!(
        output.status.success(),
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let jobs = store.jobs().unwrap();
    assert_eq!(jobs[0]["state"], "completed");
    if reply {
        assert_eq!(
            jobs.as_array()
                .unwrap()
                .iter()
                .filter(|job| job["input"]["mode"] == "reply" && job["state"] == "completed")
                .count(),
            2
        );
    } else {
        assert!(jobs[0]["input"]["analysis"].is_object());
    }
    println!("{}", String::from_utf8_lossy(&output.stdout));
}

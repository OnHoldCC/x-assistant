use onhold_backend::{http, store::Store};
use std::{path::PathBuf, sync::Arc};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let option = |name: &str| {
        args.iter()
            .position(|arg| arg == name)
            .and_then(|at| args.get(at + 1))
            .cloned()
    };
    let home = option("--home")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("data"));
    let assets = option("--assets")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../app/dist"));
    let port: u16 = option("--port")
        .unwrap_or_else(|| onhold_backend::DEFAULT_PORT.to_string())
        .parse()?;
    if args.iter().any(|arg| arg == "--health-check") {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(4))
            .build()?
            .get(format!("http://127.0.0.1:{port}/health"))
            .send()
            .await?
            .error_for_status()?;
        return Ok(());
    }
    if let Some(file) = std::env::var_os("ONHOLD_MODEL_KEY_FILE") {
        use std::io::Write;
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&file) {
            Ok(mut file) => file.write_all(
                format!(
                    "{}{}",
                    uuid::Uuid::new_v4().simple(),
                    uuid::Uuid::new_v4().simple()
                )
                .as_bytes(),
            )?,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
        let key = std::fs::read_to_string(file)?;
        if key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("模型内部密钥无效，已保留原文件，请检查安装数据".into());
        }
    }
    let store = Arc::new(Store::open(home.join("onhold-admin.sqlite3"))?);
    let bind = option("--bind").unwrap_or_else(|| "127.0.0.1".into());
    let listener = tokio::net::TcpListener::bind((bind.as_str(), port)).await?;
    let models = Arc::new(onhold_backend::models::Runtime::new(home, store.clone()));
    tokio::spawn(models.clone().run_rewrite_queue());
    tokio::spawn(onhold_backend::store::run_x_sync(store.clone()));
    println!("OnHold Rust 后台：http://127.0.0.1:{port}");
    axum::serve(
        listener,
        http::router_with_models(store, assets, port, Some(models))?,
    )
    .with_graceful_shutdown(async {
        #[cfg(unix)]
        {
            let mut term =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("SIGTERM handler");
            tokio::select! { _=term.recv()=>{}, _=tokio::signal::ctrl_c()=>{} }
        }
        #[cfg(not(unix))]
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}

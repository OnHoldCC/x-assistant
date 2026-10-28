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
    let store = Arc::new(Store::open(home.join("onhold-admin.sqlite3"))?);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    println!("OnHold Rust 后台：http://127.0.0.1:{port}");
    axum::serve(listener, http::router(store, assets, port)?)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

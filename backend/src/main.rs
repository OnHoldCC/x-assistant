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
    if let Some(file)=option("--queue-reviewed-meme") {
        let file=PathBuf::from(file).canonicalize()?;
        if std::fs::metadata(&file)?.len()>16000 {return Err("图片审核记录过大".into());}
        let review:serde_json::Value=serde_json::from_slice(&std::fs::read(&file)?)?;
        let directory=file.parent().ok_or("缺少审核目录")?;
        let account=option("--account").ok_or("缺少发布账号")?;
        let text=option("--caption").ok_or("缺少图片配文")?;
        let id=uuid::Uuid::new_v4().to_string();
        let target=onhold_backend::funny_image::path(&home,&id)?;
        std::fs::create_dir_all(target.parent().ok_or("图片目录无效")?)?;
        for key in ["original","edited"] {
            let source=directory.join(review[key].as_str().ok_or("缺少图片文件名")?).canonicalize()?;
            if !source.starts_with(directory)||std::fs::metadata(&source)?.len()>5_000_000 {return Err("图片不在审核目录或超过5MB".into());}
            let bytes=std::fs::read(&source)?;
            let extension=if bytes.starts_with(b"\x89PNG\r\n\x1a\n"){"png"}else if bytes.starts_with(&[255,216])&&bytes.ends_with(&[255,217]){"jpg"}else{return Err("图片必须是完整PNG或JPEG".into());};
            let saved=target.parent().unwrap().join(format!("source-{key}.{extension}"));std::fs::write(&saved,bytes)?;
            if key=="edited" {onhold_backend::funny_image::prepare(&home,&id,&saved,"仅清理平台界面与水印，保留梗图内容","operator-reviewed-meme").await?;}
        }
        std::fs::write(target.parent().unwrap().join("generation.json"),serde_json::json!({"kind":"tieba_meme","review":review,"created_at":onhold_backend::store::now()}).to_string())?;
        println!("{}",store.enqueue_reviewed_meme(&account,&id,&review,&text,onhold_backend::store::now())?);
        return Ok(());
    }
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

mod browser_extension;
mod models;
use onhold_backend::{dispatch, store::Store, DEFAULT_PORT};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
struct HostInfo {
    extension: String,
    bridge_error: Arc<Mutex<Option<String>>>,
}

#[tauri::command]
fn open_extension_directory(app: tauri::AppHandle) -> Result<(), String> {
    let directory = std::path::PathBuf::from(&app.state::<HostInfo>().extension);
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open")
        .arg("-R")
        .arg(directory)
        .spawn();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer.exe")
        .arg("/select,")
        .arg(directory)
        .spawn();
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    return result.map(|_| ()).map_err(|e| e.to_string());
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = directory;
        Err("请在电脑端安装配套浏览器插件".into())
    }
}

#[tauri::command]
fn open_browser_connection() -> Result<(), String> {
    let url = format!("http://127.0.0.1:{DEFAULT_PORT}/#connect");
    open_in_browser(&url)
}

fn open_in_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        for browser in ["Google Chrome", "Microsoft Edge"] {
            if std::process::Command::new("open")
                .args(["-a", browser, browser_url(browser == "Microsoft Edge", url)])
                .status()
                .is_ok_and(|status| status.success())
            {
                return Ok(());
            }
        }
        Err("请先安装 Chrome 或 Edge 浏览器".into())
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let roots = ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]
            .into_iter()
            .filter_map(std::env::var_os)
            .map(std::path::PathBuf::from);
        for executable in windows_browsers(roots) {
            let edge = executable
                .file_name()
                .is_some_and(|name| name == "msedge.exe");
            if executable.is_file()
                && std::process::Command::new(&executable)
                    .arg(browser_url(edge, url))
                    .creation_flags(0x08000000)
                    .spawn()
                    .is_ok()
            {
                return Ok(());
            }
        }
        Err("请先安装 Chrome 或 Edge 浏览器".into())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = url;
        Err("请在电脑端连接 X 助手，手机端使用远程后台".into())
    }
}

fn browser_url(edge: bool, url: &str) -> &str {
    if edge && url == "chrome://extensions/" {
        "edge://extensions/"
    } else {
        url
    }
}

#[cfg(any(target_os = "windows", test))]
fn windows_browsers(
    roots: impl IntoIterator<Item = std::path::PathBuf>,
) -> Vec<std::path::PathBuf> {
    roots
        .into_iter()
        .flat_map(|root| {
            [
                root.join("Google/Chrome/Application/chrome.exe"),
                root.join("Microsoft/Edge/Application/msedge.exe"),
            ]
        })
        .collect()
}

fn validate_x_post(value: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "帖子链接无效")?;
    let parts: Vec<_> = url.path().split('/').collect();
    if url.scheme() != "https"
        || !matches!(url.host_str(), Some("x.com" | "twitter.com"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || parts.len() != 4
        || onhold_backend::store::handle(parts[1]).is_err()
        || parts[2] != "status"
        || parts[3].is_empty()
        || parts[3].len() > 25
        || !parts[3].bytes().all(|c| c.is_ascii_digit())
    {
        return Err("仅支持 X 原帖链接".into());
    }
    Ok(url.to_string())
}

#[tauri::command]
fn open_x_page(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = validate_x_post(&url)?;
    #[cfg(mobile)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|e| e.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = app;
        open_in_browser(&url)
    }
}

#[tauri::command]
fn open_extension_installation(app: tauri::AppHandle) -> Result<(), String> {
    open_in_browser("chrome://extensions/")?;
    open_extension_directory(app)
}

#[tauri::command]
async fn admin(
    app: tauri::AppHandle,
    store: tauri::State<'_, Arc<Store>>,
    operation: String,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let store = store.inner().clone();
    let pairing = operation == "pairing";
    let mut value =
        tauri::async_runtime::spawn_blocking(move || dispatch(&store, &operation, input))
            .await
            .map_err(|e| e.to_string())??;
    if pairing {
        let info = app.state::<HostInfo>();
        value["extension"] = serde_json::json!(info.extension);
        value["mobile"] = serde_json::json!(cfg!(mobile));
        value["error"] =
            serde_json::json!(*info.bridge_error.lock().map_err(|_| "连接状态不可用")?);
    }
    Ok(value)
}
#[tauri::command]
async fn remote_admin(
    client: tauri::State<'_, reqwest::Client>,
    endpoint: String,
    token: String,
    operation: String,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let url = reqwest::Url::parse(&endpoint).map_err(|_| "后台地址无效")?;
    if !(url.scheme() == "https"
        || url.scheme() == "http" && matches!(url.host_str(), Some("localhost" | "127.0.0.1")))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || token.len() != 64
        || !token.bytes().all(|c| c.is_ascii_hexdigit())
    {
        return Err("请使用 HTTPS 后台地址与配对密钥".into());
    }
    let response = client
        .post(url.join("api/admin").map_err(|e| e.to_string())?)
        .bearer_auth(token)
        .json(&serde_json::json!({"operation":operation,"input":input}))
        .send()
        .await
        .map_err(|_| "后台连接失败，请检查地址和网络")?;
    let ok = response.status().is_success();
    let value: serde_json::Value = response.json().await.map_err(|_| "后台返回格式无效")?;
    if !ok {
        return Err(value["error"].as_str().unwrap_or("远程后台请求失败").into());
    }
    Ok(value)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_opener::init());
    builder
        .setup(|app| {
            app.manage(reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(std::time::Duration::from_secs(15))
                .build()?);
            let store = Arc::new(Store::open(
                app.path().app_data_dir()?.join("onhold-admin.sqlite3"),
            )?);
            app.manage(store.clone());
            #[cfg(desktop)]
            tauri::async_runtime::spawn(onhold_backend::store::run_x_sync(store.clone()));
            app.manage(models::ModelGate(Arc::new(tokio::sync::Semaphore::new(1))));
            let mut events=store.subscribe_logs();let app_handle=app.handle().clone();
            tauri::async_runtime::spawn(async move {loop {match events.recv().await {Ok(event)=>{let _=app_handle.emit("system-log",event);},Err(tokio::sync::broadcast::error::RecvError::Lagged(_))=>continue,Err(_)=>break}}});
            let _=store.record_event("info","startup",None,"OnHold 已启动");
            let bridge_error = Arc::new(Mutex::new(None));
            #[cfg(desktop)]
            let extension = browser_extension::export(&app.path().resource_dir()?.join("extension"), &app.path().app_data_dir()?)?;
            #[cfg(not(desktop))]
            let extension = std::path::PathBuf::new();
            app.manage(HostInfo {
                extension: extension.display().to_string(),
                bridge_error: bridge_error.clone(),
            });
            #[cfg(desktop)]
            {
                let assets = app.path().resource_dir()?.join("web");
                tauri::async_runtime::spawn(async move {
                    match tokio::net::TcpListener::bind(("127.0.0.1", DEFAULT_PORT)).await {
                        Ok(listener) => match onhold_backend::http::router(store, assets, DEFAULT_PORT) {
                            Ok(router) => {
                                let _ = axum_serve(listener, router).await;
                            }
                            Err(error) => {
                                *bridge_error.lock().unwrap() = Some(error);
                            }
                        },
                        Err(error) => {
                            *bridge_error.lock().unwrap() = Some(format!(
                                "浏览器连接服务未启动：端口 {DEFAULT_PORT} 被占用（{error}）。请关闭重复运行的 OnHold 后台后重试。"
                            ));
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![models::model_config, models::save_model_config, models::inspect_model, models::analyze_memory, models::export_memory, admin, remote_admin, open_extension_directory, open_browser_connection, open_x_page, open_extension_installation])
        .run(tauri::generate_context!())
        .expect("OnHold 后台启动失败");
}
#[cfg(desktop)]
async fn axum_serve(
    listener: tokio::net::TcpListener,
    router: axum::Router,
) -> Result<(), std::io::Error> {
    axum::serve(listener, router).await
}

#[cfg(test)]
mod tests {
    use super::{browser_url, validate_x_post, windows_browsers};
    #[test]
    fn extension_installation_uses_the_selected_browser() {
        assert_eq!(
            browser_url(false, "chrome://extensions/"),
            "chrome://extensions/"
        );
        assert_eq!(
            browser_url(true, "chrome://extensions/"),
            "edge://extensions/"
        );
        assert_eq!(
            browser_url(true, "http://127.0.0.1:18431/#connect"),
            "http://127.0.0.1:18431/#connect"
        );
        let paths = windows_browsers([
            std::path::PathBuf::from("local"),
            std::path::PathBuf::from("system"),
        ]);
        assert_eq!(paths.len(), 4);
        assert_eq!(
            paths[0],
            std::path::PathBuf::from("local/Google/Chrome/Application/chrome.exe")
        );
        assert_eq!(
            paths[3],
            std::path::PathBuf::from("system/Microsoft/Edge/Application/msedge.exe")
        );
    }
    #[test]
    fn original_posts_open_only_as_validated_x_links() {
        assert!(validate_x_post("https://x.com/OnHoldCC/status/123").is_ok());
        for value in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "https://x.com.evil.test/a/status/1",
            "https://user:password@x.com/a/status/1",
            "https://x.com:1234/a/status/1",
            "https://x.com/a/status/x",
            "https://x.com/a/status/1?redirect=evil",
            "https://x.com/",
        ] {
            assert!(validate_x_post(value).is_err(), "{value}");
        }
    }
}

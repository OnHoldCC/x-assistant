use crate::{dispatch, store::Store};
use axum::{
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Request, State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Arc};

#[derive(Clone)]
struct Api {
    store: Arc<Store>,
    assets: PathBuf,
    port: u16,
    token: String,
    models: Option<Arc<crate::models::Runtime>>,
}
const EXTENSIONS: [&str; 2] = [
    "chrome-extension://efnelpfiicmcfahpkoidcegnebndoiad",
    "chrome-extension://hffgfbgnlpclaibfceoihghioflhecmj",
];
fn allowed(origin: &str, port: u16) -> bool {
    EXTENSIONS.contains(&origin)
        || origin == format!("http://127.0.0.1:{port}")
        || origin == format!("http://localhost:{port}")
        || [
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
            "http://127.0.0.1:1420",
        ]
        .contains(&origin)
}
async fn guard(State(api): State<Api>, req: Request, next: Next) -> Response {
    let host = req
        .headers()
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let origin = req
        .headers()
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    if ![
        format!("127.0.0.1:{}", api.port),
        format!("localhost:{}", api.port),
    ]
    .contains(&host.to_owned())
        || (!origin.is_empty() && !allowed(&origin, api.port))
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error":"不允许此来源访问后台"})),
        )
            .into_response();
    }
    let mut response = if req.method() == "OPTIONS" {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(req).await
    };
    let headers = response.headers_mut();
    for (key,value) in [("cache-control","no-store"),("x-content-type-options","nosniff"),("referrer-policy","no-referrer"),("content-security-policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")]{headers.insert(key,value.parse().unwrap());}
    if !origin.is_empty() {
        headers.insert("access-control-allow-origin", origin.parse().unwrap());
        headers.insert("vary", "Origin".parse().unwrap());
        headers.insert(
            "access-control-allow-headers",
            "Content-Type,Authorization".parse().unwrap(),
        );
        headers.insert(
            "access-control-allow-methods",
            "GET,POST,OPTIONS".parse().unwrap(),
        );
    }
    response
}
#[derive(Deserialize)]
struct Call {
    operation: String,
    #[serde(default)]
    input: Value,
}
async fn call(State(api): State<Api>, headers: HeaderMap, body: Bytes) -> Response {
    if headers.get("authorization").and_then(|v| v.to_str().ok())
        != Some(format!("Bearer {}", api.token).as_str())
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error":"连接密钥无效，请在插件中重新配对"})),
        )
            .into_response();
    }
    if headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        != Some("application/json")
    {
        return (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Json(json!({"error":"请使用 JSON"})),
        )
            .into_response();
    }
    let request: Call = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"请求格式无效"})),
            )
                .into_response()
        }
    };
    let pairing = request.operation == "pairing";
    let port = api.port;
    let result = if let Some(models) = api
        .models
        .as_ref()
        .filter(|_| crate::models::is_operation(&request.operation))
    {
        Ok(models.call(&request.operation, request.input).await)
    } else {
        tokio::task::spawn_blocking(move || dispatch(&api.store, &request.operation, request.input))
            .await
    };
    match result {
        Ok(Ok(mut value)) => {
            if pairing {
                value["endpoint"] = json!(format!("http://127.0.0.1:{port}"));
            }
            Json(value).into_response()
        }
        Ok(Err(error)) => (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({"error":error})),
        )
            .into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":"后台暂时无法处理此操作"})),
        )
            .into_response(),
    }
}
async fn websocket(State(api): State<Api>, headers: HeaderMap, ws: WebSocketUpgrade) -> Response {
    if !headers
        .get("origin")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|origin| EXTENSIONS.contains(&origin))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.max_message_size(8192)
        .max_frame_size(8192)
        .on_upgrade(move |socket| crate::ws::serve(socket, api.store, api.token))
        .into_response()
}
async fn asset(State(api): State<Api>, req: Request) -> Response {
    let raw = req.uri().path();
    let relative = if raw == "/" {
        "index.html"
    } else {
        raw.trim_start_matches('/')
    };
    if relative
        .split('/')
        .any(|part| part == ".." || part.contains('\\') || part.contains('%'))
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    let file = api.assets.join(relative);
    let bytes = match std::fs::read(&file) {
        Ok(bytes) => bytes,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let kind = match file.extension().and_then(|v| v.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript",
        Some("css") => "text/css",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        _ => "application/octet-stream",
    };
    let bytes = if relative == "index.html" {
        String::from_utf8_lossy(&bytes)
            .replace("__ONHOLD_TOKEN__", &api.token)
            .into_bytes()
    } else {
        bytes
    };
    Response::builder()
        .header("content-type", kind)
        .body(Body::from(bytes))
        .unwrap()
}
pub fn router(store: Arc<Store>, assets: PathBuf, port: u16) -> Result<Router, String> {
    router_with_models(store, assets, port, None)
}
pub fn router_with_models(
    store: Arc<Store>,
    assets: PathBuf,
    port: u16,
    models: Option<Arc<crate::models::Runtime>>,
) -> Result<Router, String> {
    let state = Api {
        token: store.token()?,
        store,
        assets,
        port,
        models,
    };
    Ok(Router::new()
        .route(
            "/health",
            get(|| async {
                let extension: Value = serde_json::from_str(include_str!("../../extension/manifest.json")).expect("valid bundled extension manifest");
                Json(json!({"service":"onhold-admin","version":env!("CARGO_PKG_VERSION"),"protocol":1,"schema_version":crate::store::SCHEMA_VERSION,"source_commit":option_env!("ONHOLD_SOURCE_COMMIT").unwrap_or("workspace"),"extension_version":extension["version"]}))
            }),
        )
        .route("/api/admin", post(call))
        .route("/ws", get(websocket))
        .fallback(asset)
        .layer(DefaultBodyLimit::max(512 * 1024))
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state))
}

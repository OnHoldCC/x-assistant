use crate::store::{now, Store};
use axum::extract::ws::{Message, WebSocket};
use serde::Deserialize;
use uuid::Uuid;
use serde_json::{json, Value};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Auth {
    token: String,
    client: String,
    account: String,
    #[serde(default)]
    analytics_supported: bool,
}

async fn send(socket: &mut WebSocket, value: Value) -> Result<(), String> {
    tokio::time::timeout(
        Duration::from_secs(5),
        socket.send(Message::Text(value.to_string().into())),
    )
    .await
    .map_err(|_| "连接超时".to_string())?
    .map_err(|e| e.to_string())
}

pub async fn serve(mut socket: WebSocket, store: Arc<Store>, token: String) {
    let auth = match tokio::time::timeout(Duration::from_secs(5), socket.recv()).await {
        Ok(Some(Ok(Message::Text(text)))) => serde_json::from_str::<Auth>(&text).ok(),
        _ => None,
    };
    let Some(auth) = auth.filter(|auth| auth.token == token) else {
        let _ = send(
            &mut socket,
            json!({"type":"error","error":"连接密钥无效，请重新配对"}),
        )
        .await;
        let _ = socket.send(Message::Close(None)).await;
        return;
    };
    let Ok(connection) = store.connect_browser(&auth.client, &auth.account, auth.analytics_supported, now()) else {
        let _ = socket.send(Message::Close(None)).await;
        return;
    };
    let _ = store.record_event("info", "browser.connected", Some(&auth.account), "X 助手 WebSocket 已连接");
    let outcome = run(&mut socket, &store, &auth, &connection).await;
    let reason = outcome.err().unwrap_or_else(|| if store.browser_connection_current(&auth.client, &connection) { "WebSocket 已关闭".into() } else { "连接已被新连接替换".into() });
    let _ = store.record_event("info", "browser.disconnected", Some(&auth.account), &reason);
    let _ = store.disconnect_browser(&auth.client, &connection);
    let _ = socket.send(Message::Close(None)).await;
}

async fn run(socket: &mut WebSocket, store: &Store, auth: &Auth, connection: &Uuid) -> Result<(), String> {
    send(
        socket,
        json!({"type":"ready","capture_interval_seconds":300}),
    )
    .await?;
    let mut tick = tokio::time::interval(Duration::from_secs(2));
    let mut last = Instant::now();
    let mut logged_in = true;
    loop {
        tokio::select! {
            message=socket.recv()=>{
                match message {
                    Some(Ok(Message::Text(text)))=>{
                        let value:Value=serde_json::from_str(&text).map_err(|_|"连接消息无效")?;
                        if value["type"]!="heartbeat" { return Err("不支持此消息".into()); }
                        let state=value["state"].as_str().ok_or("缺少登录状态")?;
                        store.browser_heartbeat(&auth.client,connection,&auth.account,&value,now())?;
                        logged_in=state=="logged_in";last=Instant::now();
                        send(socket,json!({"type":"heartbeat"})).await?;
                    },
                    Some(Ok(Message::Ping(_)|Message::Pong(_)))=>{},
                    _=>return Ok(()),
                }
            },
            _=tick.tick()=>{
                if !store.browser_connection_current(&auth.client, connection) { return Ok(()); }
                if last.elapsed()>Duration::from_secs(60) { return Err("浏览器心跳超时".into()); }
                if logged_in {
                    let _=store.schedule_automation(&auth.account,now());
                    let _=store.schedule_capture(&auth.account,now());
                    let queued=store.browser_work_due(&auth.account,now())?;
                    if queued { send(socket,json!({"type":"capture"})).await?; }
                }
            }
        }
    }
}

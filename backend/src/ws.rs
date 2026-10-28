use crate::store::{now, Store};
use axum::extract::ws::{Message, WebSocket};
use serde::Deserialize;
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
    if store
        .session_status(&auth.client, &auth.account, "logged_in", "", now())
        .is_err()
    {
        let _ = socket.send(Message::Close(None)).await;
        return;
    }
    if store
        .set_analytics_support(&auth.client, auth.analytics_supported)
        .is_err()
    {
        return;
    }
    let _ = store.set_automation_support(&auth.client, false);
    let _ = store.set_extension_version(&auth.client, "");
    let _ = run(&mut socket, &store, &auth).await;
    let _ = store.session_disconnected(&auth.client);
    let _ = socket.send(Message::Close(None)).await;
}

async fn run(socket: &mut WebSocket, store: &Store, auth: &Auth) -> Result<(), String> {
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
                        store.session_status(&auth.client,&auth.account,state,value["error"].as_str().unwrap_or(""),now())?;
                        store.set_automation_support(&auth.client,value["automation_supported"].as_bool().unwrap_or(false))?;
                        store.set_extension_version(&auth.client,value["extension_version"].as_str().unwrap_or(""))?;
                        logged_in=state=="logged_in";last=Instant::now();
                        send(socket,json!({"type":"heartbeat"})).await?;
                    },
                    Some(Ok(Message::Ping(_)|Message::Pong(_)))=>{},
                    _=>return Ok(()),
                }
            },
            _=tick.tick()=>{
                if last.elapsed()>Duration::from_secs(60) { return Err("浏览器心跳超时".into()); }
                if logged_in {
                    let _=store.schedule_automation(&auth.account,now());
                    let _=store.schedule_capture(&auth.account,now());
                    let backend=store.has_x_session(&auth.account)?;
                    let queued=store.jobs()?.as_array().is_some_and(|jobs|jobs.iter().any(|job|job["account"]==auth.account&&job["state"]=="queued"&&(!backend||!matches!(job["action"].as_str(),Some("capture"|"capture_analytics")))));
                    if queued { send(socket,json!({"type":"capture"})).await?; }
                }
            }
        }
    }
}

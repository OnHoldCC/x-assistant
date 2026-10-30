use super::*;

impl Store {
    pub(crate) fn connect_browser(&self, client: &str, account: &str, analytics: bool, at: i64) -> Result<Uuid, String> {
        let mut connections = self.browser_connections.lock().map_err(|_| "连接状态暂不可用")?;
        self.session_status(client, account, "logged_in", "", at)?;
        self.set_analytics_support(client, analytics)?;
        self.set_automation_support(client, false)?;
        self.set_extension_version(client, "")?;
        let connection = Uuid::new_v4();
        connections.insert(client.to_owned(), connection);
        Ok(connection)
    }
    pub(crate) fn browser_connection_current(&self, client: &str, connection: &Uuid) -> bool {
        self.browser_connections.lock().is_ok_and(|connections| connections.get(client) == Some(connection))
    }
    pub(crate) fn browser_heartbeat(&self, client: &str, connection: &Uuid, account: &str, value: &Value, at: i64) -> Result<(), String> {
        let connections = self.browser_connections.lock().map_err(|_| "连接状态暂不可用")?;
        if connections.get(client) != Some(connection) { return Err("连接已被替换".into()); }
        self.session_status(client, account, value["state"].as_str().ok_or("缺少登录状态")?, value["error"].as_str().unwrap_or(""), at)?;
        self.set_automation_support(client, value["automation_supported"].as_bool().unwrap_or(false))?;
        self.set_extension_version(client, value["extension_version"].as_str().unwrap_or(""))
    }
    pub(crate) fn disconnect_browser(&self, client: &str, connection: &Uuid) -> Result<(), String> {
        let mut connections = self.browser_connections.lock().map_err(|_| "连接状态暂不可用")?;
        if connections.get(client) == Some(connection) {
            self.session_disconnected(client)?;
            connections.remove(client);
        }
        Ok(())
    }
    pub fn heartbeat(&self, client: &str, account: &str, at: i64) -> Result<Value, String> {
        if Uuid::parse_str(client).is_err() {
            return Err("连接标识无效".into());
        }
        let account = handle(account)?;
        self.lock()?.execute("INSERT INTO clients VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET account=excluded.account,last_seen=excluded.last_seen",params![client,account,at]).map_err(|e|e.to_string())?;
        Ok(json!({"connected":true}))
    }
    pub fn connections(&self, at: i64) -> Result<Value, String> {
        let db = self.lock()?;
        let mut stmt = db
            .prepare("SELECT c.id,c.account,c.last_seen,s.state,s.error,s.connected,s.analytics_supported,s.extension_version FROM clients c LEFT JOIN browser_sessions s ON s.client=c.id ORDER BY c.last_seen DESC LIMIT 100")
            .map_err(|e| e.to_string())?;
        let clients=stmt.query_map([],|r|{let last:i64=r.get(2)?;let connected=r.get::<_,Option<bool>>(5)?;Ok(json!({"id":r.get::<_,String>(0)?,"account":r.get::<_,String>(1)?,"last_seen":last,"online":at-last<60_000&&connected.unwrap_or(true),"transport":if connected.is_some(){"websocket"}else{"http"},"login_state":r.get::<_,Option<String>>(3)?.unwrap_or_else(||"unknown".into()),"error":r.get::<_,Option<String>>(4)?.unwrap_or_default(),"capture_interval_seconds":300,"analytics_supported":r.get::<_,Option<bool>>(6)?.unwrap_or(false),"extension_version":r.get::<_,Option<String>>(7)?.unwrap_or_default()}))}).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        drop(stmt);
        let mut clients = clients;
        let mut stmt=db.prepare("SELECT s.owner_uid,a.handle,s.last_poll,s.state,s.error,EXISTS(SELECT 1 FROM request_templates t WHERE t.owner_uid=s.owner_uid AND t.operation='analytics') FROM x_sessions s JOIN accounts a ON a.uid=s.owner_uid ORDER BY a.handle").map_err(|e|e.to_string())?;
        let backend=stmt.query_map([],|r|Ok(json!({"id":format!("backend:{}",r.get::<_,String>(0)?),"account":r.get::<_,String>(1)?,"last_seen":r.get::<_,Option<i64>>(2)?.unwrap_or(0),"online":true,"transport":"backend","login_state":if matches!(r.get::<_,String>(3)?.as_str(),"active"|"limited"){"logged_in"}else{"logged_out"},"error":r.get::<_,String>(4)?,"capture_interval_seconds":300,"analytics_supported":r.get::<_,bool>(5)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        for session in backend {
            clients.insert(0, session);
        }
        Ok(json!(clients))
    }
    pub fn session_status(
        &self,
        client: &str,
        account: &str,
        state: &str,
        error: &str,
        at: i64,
    ) -> Result<(), String> {
        if ![
            "logged_in",
            "logged_out",
            "account_changed",
            "page_unavailable",
        ]
        .contains(&state)
            || error.chars().count() > 500
        {
            return Err("登录状态无效".into());
        }
        self.heartbeat(client, account, at)?;
        if ["logged_out", "account_changed"].contains(&state) {
            self.forget_x_session(account, at)?;
        }
        self.lock()?.execute("INSERT INTO browser_sessions(client,state,error,connected) VALUES(?,?,?,1) ON CONFLICT(client) DO UPDATE SET state=excluded.state,error=excluded.error,connected=1",params![client,state,error]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn set_analytics_support(&self, client: &str, supported: bool) -> Result<(), String> {
        self.lock()?
            .execute(
                "UPDATE browser_sessions SET analytics_supported=? WHERE client=?",
                params![supported, client],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn set_extension_version(&self, client: &str, version: &str) -> Result<(), String> {
        if !version.is_empty()
            && (version.len() > 23
                || version.split('.').count() > 4
                || !version.split('.').all(|part| {
                    !part.is_empty()
                        && part.bytes().all(|b| b.is_ascii_digit())
                        && part.parse::<u16>().is_ok()
                }))
        {
            return Err("插件版本无效".into());
        }
        self.lock()?
            .execute(
                "UPDATE browser_sessions SET extension_version=? WHERE client=?",
                params![version, client],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn session_disconnected(&self, client: &str) -> Result<(), String> {
        self.lock()?
            .execute(
                "UPDATE browser_sessions SET connected=0 WHERE client=?",
                [client],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod connection_tests {
    use super::*;

    #[test]
    fn superseded_socket_cannot_invalidate_a_running_collection() {
        let directory = tempfile::tempdir().unwrap();
        let store = Store::open(directory.path().join("db")).unwrap();
        let at = now();
        store.ingest(serde_json::from_value::<Snapshot>(json!({"uid":"123","handle":"fixture","source":"https://x.com/fixture","profile":{},"posts":[]})).unwrap(), at).unwrap();
        let client = Uuid::new_v4().to_string();
        let heartbeat = json!({"state":"logged_in","automation_supported":true,"extension_version":"1.5.13"});
        let old = store.connect_browser(&client, "fixture", true, at).unwrap();
        store.browser_heartbeat(&client, &old, "fixture", &heartbeat, at).unwrap();
        let task = store.save_automation("fixture", &json!({"action":"auto_reply","interval_minutes":1,"limit":1}), at).unwrap()["id"].as_str().unwrap().to_owned();
        store.control_automation("fixture", &task, true, at).unwrap();
        let job = store.run_automation("fixture", &task, at).unwrap()["id"].as_str().unwrap().to_owned();
        assert_eq!(store.claim(&client, "fixture", at).unwrap()["id"], job);

        let current = store.connect_browser(&client, "fixture", true, at + 1).unwrap();
        store.browser_heartbeat(&client, &current, "fixture", &heartbeat, at + 1).unwrap();
        assert!(!store.browser_connection_current(&client, &old));
        assert!(store.browser_connection_current(&client, &current));
        assert!(store.browser_heartbeat(&client, &old, "fixture", &json!({"state":"account_changed"}), at + 2).is_err());
        store.disconnect_browser(&client, &old).unwrap();
        assert_eq!(store.connections(at + 2).unwrap()[0]["online"], true);
        let posts = json!([{"id":"999","author":"writer","url":"https://x.com/writer/status/999","text":"This is a useful improvement for the workflow.","complete":true}]);
        assert_eq!(store.queue_feed_replies(&job, &client, &posts, at + 3).unwrap()["queued"], 1);

        store.disconnect_browser(&client, &current).unwrap();
        assert_eq!(store.connections(at + 4).unwrap()[0]["online"], false);
        assert!(store.queue_feed_replies(&job, &client, &posts, at + 4).is_err());
    }
}

use super::*;

impl Store {
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
            .prepare("SELECT c.id,c.account,c.last_seen,s.state,s.error,s.connected,s.analytics_supported FROM clients c LEFT JOIN browser_sessions s ON s.client=c.id ORDER BY c.last_seen DESC LIMIT 100")
            .map_err(|e| e.to_string())?;
        let clients=stmt.query_map([],|r|{let last:i64=r.get(2)?;let connected=r.get::<_,Option<bool>>(5)?;Ok(json!({"id":r.get::<_,String>(0)?,"account":r.get::<_,String>(1)?,"last_seen":last,"online":at-last<60_000&&connected.unwrap_or(true),"transport":if connected.is_some(){"websocket"}else{"http"},"login_state":r.get::<_,Option<String>>(3)?.unwrap_or_else(||"unknown".into()),"error":r.get::<_,Option<String>>(4)?.unwrap_or_default(),"capture_interval_seconds":300,"analytics_supported":r.get::<_,Option<bool>>(6)?.unwrap_or(false)}))}).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
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

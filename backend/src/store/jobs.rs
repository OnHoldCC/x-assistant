use super::*;

impl Store {
    pub fn schedule_capture(&self, account: &str, at: i64) -> Result<bool, String> {
        let account = handle(account)?;
        let last: i64=self.lock()?.query_row("SELECT MAX(COALESCE((SELECT last_seen FROM accounts WHERE handle=?),0),COALESCE((SELECT MAX(created_at) FROM jobs WHERE account=?),0))",params![account,account],|r|r.get(0)).map_err(|e|e.to_string())?;
        if at - last >= 300_000 {
            self.enqueue(&account, at)?;
            return Ok(true);
        }
        Ok(false)
    }
    pub fn enqueue(&self, account: &str, at: i64) -> Result<Value, String> {
        self.enqueue_action(account, "capture", at)
    }
    pub fn enqueue_action(&self, account: &str, action: &str, at: i64) -> Result<Value, String> {
        if !["capture", "capture_analytics"].contains(&action) {
            return Err("采集任务类型无效".into());
        }
        let account = handle(account)?;
        let db = self.lock()?;
        db.execute("UPDATE jobs SET state='failed',error='浏览器连接中断，请重新采集',updated_at=? WHERE state='running' AND updated_at<?",params![at,at-120_000]).map_err(|e|e.to_string())?;
        if db
            .query_row(
                "SELECT 1 FROM clients c LEFT JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND (s.client IS NULL OR (s.connected=1 AND s.state='logged_in')) AND (?='capture' OR s.analytics_supported=1)",
                params![account, at - 90_000, action],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_none()
        {
            return Err(if action == "capture_analytics" { "请重载新版 X 助手并重新连接，再采集官方分析" } else { "此账号的 CDP 插件未连接，请先在浏览器连接" }.into());
        }
        if db
            .query_row(
                "SELECT 1 FROM jobs WHERE account=? AND state IN ('queued','running')",
                [&account],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_some()
        {
            return Err("此账号已有采集任务，请等待完成".into());
        }
        let id = Uuid::new_v4().to_string();
        db.execute(
            "INSERT INTO jobs(id,account,action,state,client,created_at,updated_at,error,result) VALUES(?,?,?,'queued',NULL,?,?,NULL,NULL)",
            params![id, account, action, at, at],
        )
        .map_err(|e| e.to_string())?;
        Ok(json!({"id":id}))
    }
    pub fn jobs(&self) -> Result<Value, String> {
        let db = self.lock()?;
        let mut stmt=db.prepare("SELECT id,account,action,state,created_at,updated_at,error FROM jobs ORDER BY created_at DESC LIMIT 100").map_err(|e|e.to_string())?;
        let rows=stmt.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"account":r.get::<_,String>(1)?,"action":r.get::<_,String>(2)?,"state":r.get::<_,String>(3)?,"created_at":r.get::<_,i64>(4)?,"updated_at":r.get::<_,i64>(5)?,"error":r.get::<_,Option<String>>(6)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(json!(rows))
    }
    pub fn claim(&self, client: &str, account: &str, at: i64) -> Result<Value, String> {
        self.heartbeat(client, account, at)?;
        let account = handle(account)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE jobs SET state='failed',error='浏览器连接中断，请重新采集',updated_at=? WHERE state='running' AND updated_at<?",params![at,at-120_000]).map_err(|e|e.to_string())?;
        let job:Option<(String,String,String)>=tx.query_row("SELECT id,action,input FROM jobs WHERE account=? AND state='queued' AND (action='capture' OR EXISTS(SELECT 1 FROM browser_sessions WHERE client=? AND analytics_supported=1 AND connected=1 AND state='logged_in')) AND (action NOT IN ('follow_back','unfollow') OR EXISTS(SELECT 1 FROM browser_sessions WHERE client=? AND automation_supported=1)) ORDER BY created_at LIMIT 1",params![account,client,client],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
        if let Some((id, action, input)) = job {
            tx.execute("UPDATE jobs SET state='running',client=?,updated_at=? WHERE id=? AND state='queued'",params![client,at,id]).map_err(|e|e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(
                json!({"id":id,"action":action,"account":account,"input":serde_json::from_str::<Value>(&input).map_err(|_|"任务参数无效")?}),
            )
        } else {
            Ok(Value::Null)
        }
    }
    pub fn finish(
        &self,
        id: &str,
        client: &str,
        error: Option<&str>,
        at: i64,
    ) -> Result<Value, String> {
        if error.is_some_and(|e| e.chars().count() > 2000) {
            return Err("错误信息过长".into());
        }
        let changed=self.lock()?.execute("UPDATE jobs SET state=?,error=?,updated_at=? WHERE id=? AND client=? AND state='running'",params![if error.is_some(){"failed"}else{"completed"},error,at,id,client]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("任务不属于当前连接或已结束".into());
        }
        Ok(json!({"saved":true}))
    }
}

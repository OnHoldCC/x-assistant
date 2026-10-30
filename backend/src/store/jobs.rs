use super::*;

impl Store {
    pub fn schedule_capture(&self, account: &str, at: i64) -> Result<bool, String> {
        let account = handle(account)?;
        if self.has_x_session(&account)? {
            return Ok(false);
        }
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
        if !["capture", "capture_analytics", "capture_creator"].contains(&action) {
            return Err("采集任务类型无效".into());
        }
        let account = handle(account)?;
        let session = self.has_x_session(&account)?;
        let db = self.lock()?;
        let backend = action != "capture_creator" && session && (action == "capture" || db.query_row("SELECT EXISTS(SELECT 1 FROM request_templates WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?) AND operation='analytics')", [&account], |r| r.get::<_, bool>(0)).map_err(|e|e.to_string())?);
        db.execute("UPDATE jobs SET state='failed',error=CASE WHEN action='rewrite_publish' THEN '发布中断，请到 X 核对结果；不会自动重发' ELSE '浏览器连接中断，请重新采集' END,updated_at=? WHERE state='running' AND updated_at<?",params![at,at-120_000]).map_err(|e|e.to_string())?;
        if session {
            let (active, limited): (bool, bool) = db.query_row("SELECT state IN ('active','limited'),state='limited' AND next_poll>? FROM x_sessions WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?)",params![at,account],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|e|e.to_string())?;
            if !active {
                return Err("X 登录态已失效，请在浏览器重新连接".into());
            }
            if !backend && limited {
                return Err("X 请求限流，请等待后重试".into());
            }
        }
        if !backend && db
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
        if action=="capture_creator" {
            let supported:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.analytics_supported=1 AND extension_compatible(s.extension_version))",params![account,at-90000],|row|row.get(0)).map_err(|e|e.to_string())?;
            if !supported {return Err("请重载新版 X 助手并重新连接，再独立采集创作者资格".into());}
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
            "INSERT INTO jobs(id,account,action,state,client,created_at,updated_at,error,result,input) VALUES(?,?,?,'queued',NULL,?,?,NULL,NULL,?)",
            params![id, account, action, at, at, if backend { "{}" } else { "{\"executor\":\"browser\"}" }],
        )
        .map_err(|e| e.to_string())?;
        if backend {
            db.execute("UPDATE x_sessions SET next_poll=CASE WHEN state='limited' THEN next_poll ELSE MIN(next_poll,?) END WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?)",params![at,account]).map_err(|e|e.to_string())?;
        }
        Ok(json!({"id":id}))
    }
    pub fn jobs(&self) -> Result<Value, String> {
        let db = self.lock()?;
        let mut stmt=db.prepare("SELECT id,account,action,state,created_at,updated_at,error,input,result FROM jobs WHERE coalesce(json_extract(input,'$.hidden'),0)=0 ORDER BY CASE WHEN state IN ('queued','rewriting','running') THEN 0 ELSE 1 END,CASE WHEN state IN ('queued','rewriting','running') THEN COALESCE(json_extract(input,'$.publish_at'),created_at) ELSE -created_at END,id LIMIT 100").map_err(|e|e.to_string())?;
        Ok(json!(read_jobs(&db, &mut stmt, [])?))
    }
    pub fn job_records(&self, account: &str, input: &Value) -> Result<Value, String> {
        let account = handle(account)?;
        let offset = input.get("offset").map_or(Some(0), Value::as_i64).filter(|n| *n >= 0).ok_or("任务页码无效")?;
        let state = input.get("state").and_then(Value::as_str).unwrap_or("all");
        if !["all", "queued", "rewriting", "running", "completed", "failed"].contains(&state) { return Err("任务状态无效".into()); }
        let search = input.get("search").and_then(Value::as_str).unwrap_or("").trim();
        let source = input.get("source").and_then(Value::as_str).unwrap_or("all");
        if !["all", "automation", "other"].contains(&source) { return Err("任务来源无效".into()); }
        let db = self.lock()?;
        let condition = "FROM jobs WHERE account=?1 AND coalesce(json_extract(input,'$.hidden'),0)=0 AND (?2='all' OR state=?2) AND (?4='all' OR (?4='automation' AND json_extract(input,'$.task_id') IS NOT NULL) OR (?4='other' AND json_extract(input,'$.task_id') IS NULL)) AND instr(lower(id||' '||action||' '||coalesce(error,'')||' '||coalesce(json_extract(input,'$.text'),'')||' '||coalesce(json_extract(input,'$.source.url'),'')||' '||coalesce(json_extract(input,'$.source.text'),'')||' '||CASE WHEN json_extract(input,'$.mode')='news' THEN '新闻发文' WHEN json_extract(input,'$.mode')='reply' THEN CASE WHEN json_extract(input,'$.scope')='notifications' THEN '自动回复' ELSE '自动评论' END WHEN json_extract(input,'$.mode')='replicate' THEN '发同款' WHEN json_extract(input,'$.mode')='similar' THEN '生成同类文章' ELSE CASE action WHEN 'capture' THEN '采集账号与帖子' WHEN 'capture_analytics' THEN '采集官方分析' WHEN 'capture_creator' THEN '采集创作者资格' WHEN 'capture_relationships' THEN '同步关系名单' WHEN 'capture_for_you' THEN '读取 For You 帖子' WHEN 'capture_notifications' THEN CASE WHEN json_extract(input,'$.publication_mode')='follow_back' THEN '识别新关注通知' ELSE '读取通知回复' END WHEN 'follow_back' THEN '定时回关' WHEN 'unfollow' THEN '定时取消关注' ELSE '改写并定时发布' END END),lower(?3))>0";
        let total: i64 = db.query_row(&format!("SELECT COUNT(*) {condition}"), params![account,state,search,source], |r| r.get(0)).map_err(|e|e.to_string())?;
        let offset = offset.min((total.saturating_sub(1)/20)*20);
        let mut statement = db.prepare(&format!("SELECT id,account,action,state,created_at,updated_at,error,input,result {condition} ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?5")).map_err(|e|e.to_string())?;
        let rows = read_jobs(&db, &mut statement, params![account,state,search,source,offset])?;
        Ok(json!({"items":rows,"total":total,"offset":offset}))
    }
    pub fn delete_job(&self, account: &str, id: &str, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let raw: String = tx.query_row("SELECT input FROM jobs WHERE account=? AND id=? AND state IN ('queued','completed','failed') AND coalesce(json_extract(input,'$.hidden'),0)=0",params![account,id],|r|r.get(0)).map_err(|_|"找不到任务或任务正在执行，不能删除")?;
        let input: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        tx.execute("UPDATE jobs SET state=CASE WHEN state='queued' THEN 'failed' ELSE state END,error=CASE WHEN state='queued' THEN '任务已删除' ELSE error END,input=json_set(input,'$.hidden',json('true')),updated_at=? WHERE id=?",params![at,id]).map_err(|e|e.to_string())?;
        if let Some(task) = input["task_id"].as_str() {
            tx.execute("UPDATE automation_tasks SET state=CASE WHEN enabled=1 THEN 'waiting' ELSE 'paused' END WHERE account=? AND id=?",params![account,task]).map_err(|e|e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"saved":true}))
    }
    pub fn cancel_job(&self, account: &str, id: &str, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        let changed = self.lock()?.execute("UPDATE jobs SET state='failed',error='用户已取消待执行任务，未发送',updated_at=? WHERE account=? AND id=? AND state='queued' AND coalesce(json_extract(input,'$.stage'),'')<>'sending'",params![at,account,id]).map_err(|e|e.to_string())?;
        if changed != 1 { return Err("仅可取消尚未开始执行的任务".into()); }
        Ok(json!({"saved":true}))
    }
    pub fn update_job(
        &self,
        account: &str,
        id: &str,
        input: &Value,
        at: i64,
    ) -> Result<Value, String> {
        let account = handle(account)?;
        let db = self.lock()?;
        let (action,raw): (String,String) = db.query_row("SELECT action,input FROM jobs WHERE account=? AND id=? AND state='queued' AND coalesce(json_extract(input,'$.hidden'),0)=0",params![account,id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"仅可编辑当前账号等待执行的任务")?;
        let mut payload: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let action = if action == "rewrite_publish" && payload["stage"] == "ready" {
            if payload["mode"] == "reply" || payload["mode"] == "news" {
                return Err("自动化正文由 Codex 生成，请通过自动化计划控制".into());
            }
            let text = input["text"].as_str().ok_or("缺少正文")?.trim();
            super::publications::validate_rewrite(
                payload["source"]["text"].as_str().unwrap_or(""),
                text,
            )?;
            let duplicate: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND id<>? AND action='rewrite_publish' AND json_extract(input,'$.text')=? AND (state IN ('queued','running','completed') OR json_extract(input,'$.stage')='sending'))",params![account,id,text],|r|r.get(0)).map_err(|e|e.to_string())?;
            if duplicate {
                return Err("相同正文已有发布任务".into());
            }
            payload["text"] = json!(text);
            "rewrite_publish"
        } else if ["capture", "capture_analytics"].contains(&action.as_str()) {
            input["action"]
                .as_str()
                .filter(|value| ["capture", "capture_analytics"].contains(value))
                .ok_or("采集任务类型无效")?
        } else {
            return Err("当前任务不支持编辑，请等待正文生成或到自动化编辑计划".into());
        };
        if ["capture", "capture_analytics"].contains(&action) {
            let backend: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM x_sessions s JOIN accounts a ON a.uid=s.owner_uid WHERE a.handle=? AND (?='capture' OR EXISTS(SELECT 1 FROM request_templates t WHERE t.owner_uid=s.owner_uid AND t.operation='analytics')))", params![account,action], |r|r.get(0)).map_err(|e|e.to_string())?;
            if backend {
                payload.as_object_mut().unwrap().remove("executor");
            } else {
                payload["executor"] = json!("browser");
            }
        }
        db.execute(
            "UPDATE jobs SET action=?,input=?,updated_at=? WHERE account=? AND id=?",
            params![action, payload.to_string(), at, account, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(json!({"saved":true}))
    }
    pub fn browser_work_due(&self, account: &str, at: i64) -> Result<bool, String> {
        let account=handle(account)?;
        let db=self.lock()?;
        // Interrupted reads must expire even when they prevent the next task from being queued.
        db.execute("UPDATE jobs SET state='failed',error='浏览器读取超时，已结束本次采集',updated_at=? WHERE account=? AND state='running' AND coalesce(client,'')<>'backend' AND action IN ('capture','capture_analytics','capture_creator','capture_relationships','capture_for_you','capture_notifications') AND updated_at<?",params![at,account,at-120_000]).map_err(|e|e.to_string())?;
        db.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND state='queued' AND (json_extract(input,'$.executor')='browser' OR action NOT IN ('capture','capture_analytics') OR NOT EXISTS(SELECT 1 FROM x_sessions s JOIN accounts a ON a.uid=s.owner_uid WHERE a.handle=jobs.account)) AND (action NOT IN ('capture_for_you','capture_notifications') OR (EXISTS(SELECT 1 FROM automation_tasks t WHERE t.id=json_extract(jobs.input,'$.task_id') AND t.account=jobs.account AND t.enabled=1) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||jobs.account))) AND (action<>'rewrite_publish' OR (json_extract(input,'$.stage')='ready' AND json_extract(input,'$.publish_at')<=?)))",params![account,at],|r|r.get(0)).map_err(|e|e.to_string())
    }
    pub fn claim(&self, client: &str, account: &str, at: i64) -> Result<Value, String> {
        self.expire_automation(at)?;
        self.heartbeat(client, account, at)?;
        let account = handle(account)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE jobs SET state='failed',error=CASE WHEN action='rewrite_publish' THEN '发布中断，请到 X 核对结果；不会自动重发' ELSE '浏览器连接中断，请重新采集' END,updated_at=? WHERE state='running' AND updated_at<?",params![at,at-120_000]).map_err(|e|e.to_string())?;
        let job:Option<(String,String,String)>=tx.query_row("SELECT id,action,input FROM jobs WHERE account=? AND state='queued' AND (json_extract(input,'$.executor')='browser' OR action NOT IN ('capture','capture_analytics') OR NOT EXISTS(SELECT 1 FROM x_sessions s JOIN accounts a ON a.uid=s.owner_uid WHERE a.handle=jobs.account)) AND (action NOT IN ('capture_analytics','capture_creator') OR EXISTS(SELECT 1 FROM browser_sessions WHERE client=? AND analytics_supported=1 AND connected=1 AND state='logged_in')) AND (action<>'capture_notifications' OR coalesce(json_extract(input,'$.publication_mode'),'')<>'follow_back' OR EXISTS(SELECT 1 FROM browser_sessions WHERE client=? AND extension_notification_follows(extension_version))) AND (action NOT IN ('capture_relationships','capture_for_you','capture_notifications','capture_creator') OR EXISTS(SELECT 1 FROM browser_sessions WHERE client=? AND extension_compatible(extension_version))) AND (action NOT IN ('follow_back','unfollow','capture_for_you','capture_notifications') OR EXISTS(SELECT 1 FROM browser_sessions WHERE client=? AND automation_supported=1)) AND (action NOT IN ('capture_for_you','capture_notifications') OR (EXISTS(SELECT 1 FROM automation_tasks t WHERE t.id=json_extract(jobs.input,'$.task_id') AND t.account=jobs.account AND t.enabled=1) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||jobs.account))) AND (action<>'rewrite_publish' OR (json_extract(input,'$.stage')='ready' AND json_extract(input,'$.publish_at')<=? AND (json_extract(input,'$.task_id') IS NULL OR EXISTS(SELECT 1 FROM automation_tasks t WHERE t.id=json_extract(jobs.input,'$.task_id') AND t.account=jobs.account AND t.enabled=1)) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||jobs.account) AND EXISTS(SELECT 1 FROM browser_sessions WHERE client=? AND automation_supported=1 AND extension_compatible(extension_version)) AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.account=jobs.account AND j.state='running'))) ORDER BY COALESCE(json_extract(input,'$.publish_at'),created_at),created_at LIMIT 1",params![account,client,client,client,client,at,client],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
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
        let changed=self.lock()?.execute("UPDATE jobs SET state=?,error=?,updated_at=? WHERE id=? AND client=? AND state='running' AND action<>'rewrite_publish'",params![if error.is_some(){"failed"}else{"completed"},error,at,id,client]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("任务不属于当前连接或已结束".into());
        }
        Ok(json!({"saved":true}))
    }
}

fn read_jobs(db: &rusqlite::Connection, statement: &mut rusqlite::Statement<'_>, parameters: impl rusqlite::Params) -> Result<Vec<Value>, String> {
        let mut rows=statement.query_map(parameters,|r|Ok(json!({"id":r.get::<_,String>(0)?,"account":r.get::<_,String>(1)?,"action":r.get::<_,String>(2)?,"state":r.get::<_,String>(3)?,"created_at":r.get::<_,i64>(4)?,"updated_at":r.get::<_,i64>(5)?,"error":r.get::<_,Option<String>>(6)?,"input":serde_json::from_str::<Value>(&r.get::<_,String>(7)?).unwrap_or(Value::Null),"result":r.get::<_,Option<String>>(8)?.and_then(|s|serde_json::from_str::<Value>(&s).ok())}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        for job in &mut rows {
            if ["capture_for_you", "capture_notifications"]
                .iter()
                .any(|action| job["action"] == *action)
            {
                let progress = super::for_you::reply_progress(
                    &db,
                    job["account"].as_str().unwrap_or(""),
                    job["id"].as_str().unwrap_or(""),
                )?;
                job["result"]["reply_progress"] = progress;
            }
        }
    Ok(rows)
}

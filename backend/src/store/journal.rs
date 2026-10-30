use super::*;
impl Store {
    pub fn job_logs(&self, account: &str, id: &str, input: &Value) -> Result<Value, String> {
        let account = handle(account)?;
        let offset = input.get("offset").map_or(Some(0), Value::as_i64).filter(|n| *n >= 0).ok_or("日志页码无效")?;
        let db = self.lock()?;
        let exists: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE id=? AND account=?)",params![id,account],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !exists { return Err("找不到当前账号的任务".into()); }
        let total: i64 = db.query_row("SELECT COUNT(*) FROM job_log WHERE job_id=?",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
        let offset = offset.min((total.saturating_sub(1)/20)*20);
        let mut statement = db.prepare("SELECT id,at,stage,message FROM job_log WHERE job_id=? ORDER BY id LIMIT 20 OFFSET ?").map_err(|e|e.to_string())?;
        let rows = statement.query_map(params![id,offset],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"at":r.get::<_,i64>(1)?,"stage":r.get::<_,String>(2)?,"message":r.get::<_,String>(3)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(json!({"items":rows,"total":total,"offset":offset}))
    }
    pub fn export_account(&self, account: &str) -> Result<Value, String> {
        let account = handle(account)?;
        let db = self.lock()?;
        let mut output = serde_json::Map::new();
        output.insert("account".into(), json!(account));
        output.insert("exported_at".into(), json!(now()));
        for (name,sql) in [("observations","SELECT json_object('post_id',post_id,'metric',metric,'at',at,'value',value,'approximate',approximate,'raw',raw) FROM observations WHERE handle=? ORDER BY at"),("posts","SELECT json_object('id',id,'text',text,'created_at',created_at,'first_seen',first_seen,'last_seen',last_seen) FROM posts WHERE handle=?"),("analytics","SELECT value FROM analytics WHERE handle=? ORDER BY at"),("bookmarks","SELECT json_object('post',json(value),'tags',json(tags),'saved_at',saved_at) FROM bookmarks WHERE owner=?"),("reviews","SELECT json_object('id',id,'at',at,'provider',provider,'question',question,'content',content,'adopted',adopted) FROM reviews WHERE account=?"),("preferences","SELECT value FROM settings WHERE key='memory:'||?"),("earnings_calibration","SELECT value FROM settings WHERE key='earnings-calibration:'||?")] {
            let mut statement=db.prepare(sql).map_err(|e|e.to_string())?;let rows=statement.query_map([&account],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?.map(|row|serde_json::from_str::<Value>(&row.map_err(|e|e.to_string())?).map_err(|e|e.to_string())).collect::<Result<Vec<_>,_>>()?;output.insert(name.into(),json!(rows));
        }
        Ok(Value::Object(output))
    }
    pub fn record_event(
        &self,
        level: &str,
        kind: &str,
        account: Option<&str>,
        message: &str,
    ) -> Result<Value, String> {
        let account = account.and_then(|value| handle(value).ok());
        let at = now();
        let id = {
            let db = self.lock()?;
            db.execute(
                "INSERT INTO event_log(at,level,kind,account,message) VALUES(?,?,?,?,?)",
                params![at, level, kind, account, message],
            )
            .map_err(|e| e.to_string())?;
            let id = db.last_insert_rowid();
            db.execute(
                "DELETE FROM event_log WHERE id<(SELECT MAX(id)-10000 FROM event_log)",
                [],
            )
            .map_err(|e| e.to_string())?;
            id
        };
        let event =
            json!({"id":id,"at":at,"level":level,"kind":kind,"account":account,"message":message});
        let _ = self.events.send(event.clone());
        Ok(event)
    }
    pub fn subscribe_logs(&self) -> tokio::sync::broadcast::Receiver<Value> {
        self.events.subscribe()
    }
    pub fn logs(&self, after: i64) -> Result<Value, String> {
        if after < 0 {
            return Err("日志游标无效".into());
        }
        let db = self.lock()?;
        let mut statement=db.prepare("SELECT id,at,level,kind,account,message FROM (SELECT * FROM event_log WHERE id>? ORDER BY id DESC LIMIT 200) ORDER BY id").map_err(|e|e.to_string())?;
        let rows=statement.query_map([after],|r|Ok(json!({"id":r.get::<_,i64>(0)?,"at":r.get::<_,i64>(1)?,"level":r.get::<_,String>(2)?,"kind":r.get::<_,String>(3)?,"account":r.get::<_,Option<String>>(4)?,"message":r.get::<_,String>(5)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(json!(rows))
    }
    pub fn save_memory_notes(&self, account: &str, notes: &str) -> Result<Value, String> {
        let account = handle(account)?;
        if notes.chars().count() > 4000 {
            return Err("运营偏好最多4000字".into());
        }
        self.lock()?.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("memory:{account}"),json!({"notes":notes,"updated_at":now()}).to_string()]).map_err(|e|e.to_string())?;
        Ok(json!({"saved":true}))
    }
    pub fn memory_context(&self, account: &str) -> Result<Value, String> {
        let account = handle(account)?;
        let dashboard = self.dashboard(Some(&account), 7, now())?;
        if dashboard["account"].as_str() != Some(account.as_str()) {
            return Err("请先采集当前账号".into());
        }
        let posts=dashboard["posts"].as_array().unwrap().iter().take(10).map(|p|json!({"id":p["id"],"text":p["text"].as_str().unwrap_or("").chars().take(800).collect::<String>(),"url":p["url"],"metrics":p["metrics"],"observed_at":p["last_seen"]})).collect::<Vec<_>>();
        let bookmarks=self.bookmarks(&account,0,"","")?["items"].as_array().unwrap().iter().take(10).map(|item|json!({"text":item["post"]["text"].as_str().unwrap_or("").chars().take(800).collect::<String>(),"url":item["post"]["url"],"tags":item["tags"]})).collect::<Vec<_>>();
        let reviews = self.reviews(&account)?;
        let db = self.lock()?;
        let notes: Option<String> = db
            .query_row(
                "SELECT value FROM settings WHERE key=?",
                [format!("memory:{account}")],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let official = dashboard["analytics_periods"]
            .get("7d")
            .cloned()
            .unwrap_or(Value::Null);
        Ok(
            json!({"account":account,"period":"7d","official_metrics":official["data"]["metrics"],"official_dates":official["data"]["series"].as_array().map(|s|s.iter().rev().take(14).cloned().collect::<Vec<_>>()),"observed_at":official["observed_at"],"observed_post_metrics":dashboard["metrics"],"posts":posts,"bookmarks":bookmarks,"preferences":notes.and_then(|raw|serde_json::from_str::<Value>(&raw).ok()),"previous_reviews":reviews.as_array().map(|items|items.iter().take(5).map(|v|json!({"id":v["id"],"at":v["at"],"adopted":v["adopted"],"question":v["question"],"content":v["content"].as_str().unwrap_or("").chars().take(1000).collect::<String>()})).collect::<Vec<_>>())}),
        )
    }
    pub fn reviews(&self, account: &str) -> Result<Value, String> {
        let account = handle(account)?;
        let db = self.lock()?;
        let mut statement=db.prepare("SELECT id,at,provider,question,content,adopted FROM reviews WHERE account=? ORDER BY at DESC LIMIT 30").map_err(|e|e.to_string())?;
        let rows=statement.query_map([account],|r|Ok(json!({"id":r.get::<_,String>(0)?,"at":r.get::<_,i64>(1)?,"provider":r.get::<_,String>(2)?,"question":r.get::<_,String>(3)?,"content":r.get::<_,String>(4)?,"adopted":r.get::<_,bool>(5)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(json!(rows))
    }
    pub fn save_review(
        &self,
        account: &str,
        provider: &str,
        question: &str,
        content: &str,
    ) -> Result<Value, String> {
        let account = handle(account)?;
        if !["codex_cli", "responses_api"].contains(&provider)
            || question.len() > 8000
            || content.trim().is_empty()
            || content.len() > 64000
        {
            return Err("复盘结果无效".into());
        }
        let id = Uuid::new_v4().to_string();
        self.lock()?
            .execute(
                "INSERT INTO reviews VALUES(?,?,?,?,?,?,0)",
                params![id, account, now(), provider, question, content],
            )
            .map_err(|e| e.to_string())?;
        Ok(json!({"id":id,"account":account,"content":content}))
    }
    pub fn adopt_review(&self, account: &str, id: &str, adopted: bool) -> Result<Value, String> {
        let account = handle(account)?;
        let changed = self
            .lock()?
            .execute(
                "UPDATE reviews SET adopted=? WHERE account=? AND id=?",
                params![adopted, account, id],
            )
            .map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err("找不到当前账号的复盘".into());
        }
        Ok(json!({"saved":true}))
    }
}

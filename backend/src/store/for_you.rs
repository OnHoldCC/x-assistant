use super::*;

impl Store {
    pub fn record_for_you_snapshot(&self,id:&str,client:&str,value:&Value,at:i64)->Result<Value,String>{
        let fields=[("ads","广告"),("truncated","未展开"),("source","来源缺失"),("text","正文不可用"),("own","自己的帖子"),("language","非英文原文"),("translated","已翻译内容")];
        let scanned=value["scanned"].as_i64().filter(|n|(0..=10000).contains(n)).ok_or("采集数量无效")?;
        let eligible=value["eligible"].as_i64().filter(|n|(0..=50).contains(n)).ok_or("候选数量无效")?;
        let filtered=value["filtered"].as_object().filter(|v|v.len()==fields.len()).ok_or("过滤统计无效")?;
        let mut skipped=0;let mut labels=Vec::new();
        for (key,label) in fields {
            let n=filtered.get(key).and_then(Value::as_i64).filter(|n|(0..=10000).contains(n)).ok_or("过滤统计无效")?;
            skipped+=n;if n>0 {labels.push(format!("{label} {n}"));}
        }
        if eligible+skipped!=scanned {return Err("采集与过滤数量不一致".into());}
        let snapshot=json!({"scanned":scanned,"eligible":eligible,"filtered":filtered});
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let changed=tx.execute("UPDATE jobs SET input=json_set(input,'$.capture_summary',json(?)),updated_at=? WHERE id=? AND client=? AND state='running' AND action='capture_for_you'",params![snapshot.to_string(),at,id,client]).map_err(|e|e.to_string())?;
        if changed!=1 {return Err("采集任务不属于当前连接或已结束".into());}
        let mut message=format!("已读取 {scanned} 条帖子 · 可用候选 {eligible} 条");
        if !labels.is_empty(){message.push_str(&format!(" · 过滤：{}",labels.join("，")));}
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'progress',?)",params![id,at,message]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(json!({"saved":true}))
    }
    pub fn run_for_you(&self, account: &str, task: &str, at: i64) -> Result<Value, String> {
        self.expire_automation(at)?;
        let account = handle(account)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let raw: String = tx
            .query_row(
                "SELECT value FROM automation_tasks WHERE id=? AND account=? AND enabled=1",
                params![task, account],
                |r| r.get(0),
            )
            .map_err(|_| "请先启用自动回复计划")?;
        let config: Value = serde_json::from_str(&raw).map_err(|_| "自动回复配置无效")?;
        let follow_back = config["action"] == "follow_back" && config["scope"] == "notifications";
        let notifications = config["action"] == "reply_notifications" || follow_back;
        let publishing = config["action"] == "auto_post";
        let mode = if follow_back { "follow_back" } else { "reply" };
        let scope = if notifications {
            "notifications"
        } else if publishing {
            "news"
        } else {
            "for_you"
        };
        if (!notifications && !publishing && config["action"] != "auto_reply")
            || config["scope"] != scope
        {
            return Err("自动评论或回复计划的范围无效".into());
        }
        if tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM settings WHERE key=?)",
                [format!("automation_block:{account}")],
                |r| r.get::<_, bool>(0),
            )
            .map_err(|e| e.to_string())?
        {
            return Err("账号操作已暂停".into());
        }
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND state IN ('queued','rewriting','running'))",[&account],|r|r.get::<_,bool>(0)).map_err(|e|e.to_string())?{return Err("账号已有任务执行中".into());}
        let online:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_compatible(s.extension_version))",params![account,at-60_000],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !online {
            return Err("请连接支持自动回复的新版 X 助手".into());
        }
        if follow_back {
            let supported: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_notification_follows(s.extension_version))", params![account, at-60_000], |r|r.get(0)).map_err(|e|e.to_string())?;
            if !supported { return Err("通知回关需要重载并连接 1.5.14 或更新的 X 助手".into()); }
        }
        if publishing {
            let query=config["query"].as_str().filter(|query|!query.trim().is_empty()).ok_or("请编辑自动发文计划，填写新闻搜索主题")?;
            let id=Uuid::new_v4().to_string();
            let mut payload=json!({"task_id":task,"language":config["language"],"mode":"news","scope":"news","stage":"rewrite","query":query,"news_source":config["news_source"].as_str().unwrap_or("web"),"publish_at":at,"discovered_from":"news"});
            if let Some(value)=config.get("include_source_link") {payload["include_source_link"]=value.clone();}
            tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,'rewrite_publish','queued',?,?,?)",params![id,account,at,at,payload.to_string()]).map_err(|e|e.to_string())?;
            tx.execute("UPDATE automation_tasks SET state='queued',last_run=?,next_run=? WHERE id=?",params![at,at+super::automation::interval_ms(&config),task]).map_err(|e|e.to_string())?;
            tx.commit().map_err(|e|e.to_string())?;
            return Ok(json!({"id":id,"job_ids":[id],"queued":true}));
        }
        let known = {
            let mut query=tx.prepare("SELECT json_extract(input,'$.source.id') FROM jobs WHERE account=? AND action='rewrite_publish' AND json_extract(input,'$.mode')=? AND json_extract(input,'$.source.id') IS NOT NULL ORDER BY created_at DESC LIMIT 1000").map_err(|e|e.to_string())?;
            let rows = query
                .query_map(params![account, mode], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            rows
        };
        let uid: String = tx
            .query_row("SELECT uid FROM accounts WHERE handle=?", [&account], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        if notifications && (uid.is_empty() || !uid.bytes().all(|b| b.is_ascii_digit())) {
            return Err("请重新连接 X，确认当前账号的用户 ID 后再识别通知回复".into());
        }
        let id = Uuid::new_v4().to_string();
        let payload = json!({"task_id":task,"language":config["language"],"limit":config["limit"],"known_ids":known,"scope":scope,"owner_uid":uid,"publication_mode":mode});
        tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,?,'queued',?,?,?)",params![id,account,if notifications{"capture_notifications"}else{"capture_for_you"},at,at,payload.to_string()]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE automation_tasks SET state='queued',last_run=?,next_run=? WHERE id=? AND account=?",params![at,at+super::automation::interval_ms(&config),task,account]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"id":id,"queued":true}))
    }
    pub fn queue_feed_replies(
        &self,
        id: &str,
        client: &str,
        posts: &Value,
        at: i64,
    ) -> Result<Value, String> {
        self.expire_automation(at)?;
        let posts = posts
            .as_array()
            .filter(|posts| posts.len() <= 20)
            .ok_or("每批最多20条帖子")?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let (account,raw):(String,String)=tx.query_row("SELECT j.account,j.input FROM jobs j JOIN clients c ON c.id=j.client JOIN browser_sessions s ON s.client=c.id WHERE j.id=? AND j.client=? AND j.action IN ('capture_for_you','capture_notifications') AND j.state='running' AND c.account=j.account AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||j.account)",params![id,client,at-60_000],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"采集任务不属于当前有效连接")?;
        let input: Value = serde_json::from_str(&raw).map_err(|_| "采集任务无效")?;
        if input["publication_mode"] == "follow_back" { return Err("关注通知不能创建回复任务".into()); }
        let task = input["task_id"].as_str().ok_or("缺少回复计划")?;
        let enabled:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM automation_tasks WHERE id=? AND account=? AND enabled=1 AND json_extract(value,'$.action') IN ('auto_reply','reply_notifications','auto_post'))",params![task,account],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !enabled {
            return Err("自动回复已暂停，未创建新任务".into());
        }
        if input["publication_mode"] == "replicate" { return Err("旧的评分发文任务已停用，请改用新闻搜索".into()); }
        let mode = "reply";
        let limit = input["limit"]
            .as_u64()
            .filter(|n| (1..=20).contains(n))
            .ok_or("回复数量无效")? as usize;
        let existing_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM jobs WHERE json_extract(input,'$.discovery_job')=?",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut ids = Vec::new();
        let mut skipped = 0;
        for source in posts {
            let author = handle(source["author"].as_str().ok_or("原帖作者无效")?)?;
            let post = source["id"]
                .as_str()
                .filter(|id| {
                    !id.is_empty() && id.len() <= 30 && id.bytes().all(|b| b.is_ascii_digit())
                })
                .ok_or("原帖 ID 无效")?;
            let url = format!("https://x.com/{author}/status/{post}");
            if source["url"].as_str() != Some(url.as_str()) || source["complete"] != true {
                return Err("原帖来源无效或正文不完整".into());
            }
            let text = source["text"]
                .as_str()
                .filter(|text| !text.trim().is_empty() && text.chars().count() <= 24000)
                .ok_or("原帖正文无效")?;
            if author == account {
                skipped += 1;
                continue;
            }
            let duplicate:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND json_extract(input,'$.mode')=? AND json_extract(input,'$.source.id')=?)",params![account,mode,post],|r|r.get(0)).map_err(|e|e.to_string())?;
            if duplicate {
                skipped += 1;
                continue;
            }
            if existing_count as usize + ids.len() >= limit {
                return Err("已达到本轮回复数量，未创建多余任务".into());
            }
            if input["scope"] == "notifications" {
                if source["in_reply_to_user_id"] != input["owner_uid"]
                    || !source["in_reply_to_status_id"].as_str().is_some_and(|id| {
                        !id.is_empty() && id.len() <= 30 && id.bytes().all(|b| b.is_ascii_digit())
                    })
                {
                    return Err("通知不是对当前账号帖子的回复，未创建任务".into());
                }
            }
            let child = Uuid::new_v4().to_string();
            let payload = json!({"mode":mode,"language":input["language"],"scope":input["scope"].as_str().unwrap_or("for_you"),"stage":"rewrite","task_id":task,"discovery_job":id,"publish_at":at,"source":{"author":author,"id":post,"url":url,"text":text.trim()}});
            let mut payload = payload;
            payload["discovered_from"] = json!(input["scope"].as_str().unwrap_or("for_you"));
            if input["scope"] == "notifications" {
                payload["source"]["in_reply_to_user_id"] = source["in_reply_to_user_id"].clone();
                payload["source"]["in_reply_to_status_id"] =
                    source["in_reply_to_status_id"].clone();
            }
            tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,'rewrite_publish','queued',?,?,?)",params![child,account,at,at,payload.to_string()]).map_err(|e|e.to_string())?;
            ids.push(child);
        }
        let result = json!({"queued":ids.len(),"skipped":skipped,"scanned":posts.len()});
        tx.execute(
            "UPDATE jobs SET result=?,updated_at=? WHERE id=?",
            params![result.to_string(), at, id],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"job_ids":ids,"queued":ids.len(),"skipped":skipped}))
    }
    pub fn finish_for_you(
        &self,
        id: &str,
        client: &str,
        error: Option<&str>,
        at: i64,
    ) -> Result<Option<Value>, String> {
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let row:Option<(String,String)>=tx.query_row("SELECT account,input FROM jobs WHERE id=? AND client=? AND action IN ('capture_for_you','capture_notifications') AND state='running'",params![id,client],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
        let Some((account, raw)) = row else {
            return Ok(None);
        };
        let input: Value = serde_json::from_str(&raw).map_err(|_| "任务无效")?;
        if error.is_some_and(|error| error.chars().count() > 2000) {
            return Err("错误信息过长".into());
        }
        tx.execute(
            "UPDATE jobs SET state=?,error=?,updated_at=? WHERE id=?",
            params![
                if error.is_some() {
                    "failed"
                } else {
                    "completed"
                },
                error,
                at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE automation_tasks SET state=? WHERE id=? AND account=?",
            params![
                if error.is_some() { "error" } else { "waiting" },
                input["task_id"].as_str().unwrap_or(""),
                account
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        drop(db);
        if input["scope"]=="notifications" && error.is_some_and(|message|message.contains("HTTP 429")) {
            self.block_automation(&account,"操作过于频繁",at)?;
        }
        Ok(Some(json!({"saved":true})))
    }
}

pub(super) fn reply_progress(db: &Connection, account: &str, id: &str) -> Result<Value, String> {
    let (total,completed,failed):(i64,i64,i64)=db.query_row("SELECT COUNT(*),coalesce(SUM(state='completed'),0),coalesce(SUM(state='failed'),0) FROM jobs WHERE account=? AND json_extract(input,'$.discovery_job')=?",params![account,id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|e|e.to_string())?;
    Ok(json!({"total":total,"completed":completed,"failed":failed}))
}

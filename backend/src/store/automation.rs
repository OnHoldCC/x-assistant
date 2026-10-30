use super::*;

pub(super) fn interval_ms(config:&Value)->i64 {
    if config["action"]=="reply_notifications" && config["interval_seconds"]==25 {25_000}
    else {config["interval_minutes"].as_i64().unwrap_or(60)*60_000}
}
impl Store {
    pub fn expire_automation(&self, at: i64) -> Result<(), String> {
        self.lock()?.execute("UPDATE automation_tasks SET enabled=0,state='paused' WHERE enabled=1 AND json_extract(value,'$.stop_at') IS NOT NULL AND json_extract(value,'$.stop_at')<=?",[at]).map_err(|e|e.to_string())?;
        Ok(())
    }

    pub fn automation_state(&self, account: &str) -> Result<Value, String> {
        let account = handle(account)?;
        let db = self.lock()?;
        let read = |key: String| -> Option<Value> {
            db.query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .ok()
            .flatten()
            .and_then(|s| serde_json::from_str(&s).ok())
        };
        let blocked = read(format!("automation_block:{account}"));
        let resumed = read(format!("automation_resumed:{account}"));
        let mut statement=db.prepare("SELECT a.id,a.value,a.enabled,a.state,a.next_run,a.last_run,j.id,j.action,j.state,j.created_at,j.updated_at,j.error,j.input,j.result FROM automation_tasks a LEFT JOIN jobs j ON j.id=(SELECT id FROM jobs WHERE account=a.account AND json_extract(input,'$.task_id')=a.id AND (json_extract(a.value,'$.action') NOT IN ('auto_reply','reply_notifications') OR action IN ('capture_for_you','capture_notifications')) ORDER BY created_at DESC,id DESC LIMIT 1) WHERE a.account=? ORDER BY a.next_run,a.id").map_err(|e|e.to_string())?;
        let mut tasks=statement.query_map([&account],|r|{
            let last_id:Option<String>=r.get(6)?;
            let last_job=if let Some(id)=last_id {json!({"id":id,"account":account,"action":r.get::<_,String>(7)?,"state":r.get::<_,String>(8)?,"created_at":r.get::<_,i64>(9)?,"updated_at":r.get::<_,i64>(10)?,"error":r.get::<_,Option<String>>(11)?,"input":serde_json::from_str::<Value>(&r.get::<_,String>(12)?).unwrap_or(Value::Null),"result":r.get::<_,Option<String>>(13)?.and_then(|value|serde_json::from_str::<Value>(&value).ok())})}else{Value::Null};
            Ok(json!({"id":r.get::<_,String>(0)?,"config":serde_json::from_str::<Value>(&r.get::<_,String>(1)?).unwrap_or(Value::Null),"enabled":r.get::<_,bool>(2)?,"state":r.get::<_,String>(3)?,"next_run":r.get::<_,i64>(4)?,"last_run":r.get::<_,Option<i64>>(5)?,"last_job":last_job}))
        }).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        for task in &mut tasks {
            if task["config"]["action"]=="auto_post" && !task["last_job"].is_null() {
                task["state"]=json!(match task["last_job"]["state"].as_str().unwrap_or("") {"completed"=>"waiting","failed"=>"error","rewriting"|"running"=>"running",_=>"queued"});
            }
            if ["auto_reply", "reply_notifications"]
                .iter()
                .any(|action| task["config"]["action"] == *action)
            {
                if let Some(id) = task["last_job"]["id"].as_str().map(str::to_owned) {
                    let progress = super::for_you::reply_progress(&db, &account, &id)?;
                    let total = progress["total"].as_i64().unwrap_or(0);
                    let completed = progress["completed"].as_i64().unwrap_or(0);
                    let failed = progress["failed"].as_i64().unwrap_or(0);
                    task["last_job"]["result"]["reply_progress"] = progress;
                    if total > completed + failed {
                        task["state"] = json!("running");
                    } else if failed > 0 {
                        task["state"] = json!("error");
                    }
                }
            }
        }
        Ok(
            json!({"account":account,"block":blocked,"resumed_at":resumed.and_then(|v|v.as_i64()),"tasks":tasks}),
        )
    }
    pub fn save_automation(&self, account: &str, input: &Value, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        let action = input["action"].as_str().ok_or("选择自动化类型")?;
        if ![
            "follow_back",
            "unfollow",
            "auto_reply",
            "reply_notifications",
            "auto_post",
        ]
        .contains(&action)
        {
            return Err("自动化类型无效".into());
        }
        let seconds=input.get("interval_seconds").map(|value| {
            value.as_i64().filter(|value|*value==25&&action=="reply_notifications").ok_or("25秒间隔仅用于通知回复")
        }).transpose()?;
        let interval = if input.get("interval_minutes").is_some() {input["interval_minutes"].as_i64()} else {seconds.map(|_|1)}
            .filter(|n| (1..=10080).contains(n))
            .ok_or("执行间隔应为1–10080分钟")?;
        let limit = input["limit"]
            .as_u64()
            .filter(|n| (1..=20).contains(n))
            .ok_or("每次执行1–20个目标")?;
        let days = if ["auto_reply", "reply_notifications", "auto_post"].contains(&action) {
            7
        } else {
            input["after_days"]
                .as_u64()
                .filter(|n| (1..=365).contains(n))
                .ok_or("到期天数应为1–365天")?
        };
        let scope = if ["auto_reply", "reply_notifications", "auto_post"].contains(&action) {
            if action == "reply_notifications" {
                "notifications"
            } else if action == "auto_post" {
                "news"
            } else {
                "for_you"
            }
        } else {
            input["scope"]
                .as_str()
                .filter(|s| ["automation_owned", "manual"].contains(s) || action == "follow_back" && *s == "notifications")
                .ok_or("自动化范围无效")?
        };
        let empty = Vec::new();
        let targets = if ["auto_reply", "reply_notifications", "auto_post"].contains(&action) {
            &empty
        } else {
            input["targets"].as_array().ok_or("目标名单无效")?
        };
        if targets.len() > 50 {
            return Err("单个名单最多50人".into());
        }
        let mut ordered = Vec::new();
        for value in targets {
            let target = handle(value.as_str().ok_or("目标账号无效")?)?;
            if !ordered.contains(&target) {
                ordered.push(target);
            }
        }
        let targets = ordered;
        if targets.contains(&account) || scope == "manual" && targets.is_empty() {
            return Err("填写目标账号，并排除自己".into());
        }
        let stop_at = if input["stop_at"].is_null() {
            None
        } else {
            Some(
                input["stop_at"]
                    .as_i64()
                    .filter(|time| *time > at && *time <= at + 365 * 86400000)
                    .ok_or("停止时间应在未来一年内")?,
            )
        };
        let query = if action == "auto_post" {
            Some(input["query"].as_str().filter(|text| !text.trim().is_empty() && text.chars().count()<=500 && !text.chars().any(char::is_control)).ok_or("请填写新闻搜索主题（1–500字符）")?.trim())
        } else { None };
        let language = input.get("language").and_then(Value::as_str).unwrap_or("auto");
        if !["auto", "en"].contains(&language) { return Err("内容语言无效".into()); }
        let mut config = json!({"language":language,"query":query,"stop_at":stop_at,"action":action,"interval_minutes":interval,"limit":limit,"after_days":days,"scope":scope,"targets":targets});
        if let Some(seconds)=seconds {config["interval_seconds"]=json!(seconds);}
        let language = match input.get("language") { None => "auto", Some(value) => value.as_str().ok_or("内容语言无效")? };
        if !["auto", "en"].contains(&language) { return Err("内容语言无效".into()); }
        config["language"] = json!(language);
        if action == "auto_post" {
            let source = match input.get("news_source") { None => "web", Some(value) => value.as_str().ok_or("新闻来源无效")? };
            if !["web", "weibo", "rednote", "hot_topics", "international", "mixed"].contains(&source) { return Err("新闻来源无效".into()); }
            config["news_source"] = json!(source);
            if let Some(value)=input.get("include_source_link") { config["include_source_link"]=json!(value.as_bool().ok_or("来源链接设置无效")?); }
        }
        let editing = input
            .get("id")
            .map(|value| {
                value
                    .as_str()
                    .filter(|id| !id.is_empty() && id.len() <= 100)
                    .ok_or("自动化标识无效")
            })
            .transpose()?;
        let id = editing
            .map(str::to_owned)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        if editing.is_some() {
            let current: Option<String> = self
                .lock()?
                .query_row(
                    "SELECT value FROM automation_tasks WHERE id=? AND account=?",
                    params![id, account],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            let mut old: Value = current
                .and_then(|raw| serde_json::from_str(&raw).ok())
                .unwrap_or(Value::Null);
            if old.get("language").is_none() { old["language"] = json!("auto"); }
            let mut changed_config = config.clone();
            for field in ["interval_minutes", "interval_seconds", "stop_at", "min_score", "query"] {
                if let Some(object) = old.as_object_mut() {
                    object.remove(field);
                }
                changed_config.as_object_mut().unwrap().remove(field);
            }
            let schedule_only = ["auto_reply","reply_notifications"].contains(&action) && old == changed_config;
            let changed = self.lock()?.execute("UPDATE automation_tasks SET value=?,enabled=0,state='paused',next_run=? WHERE id=? AND account=? AND (NOT EXISTS(SELECT 1 FROM jobs WHERE account=? AND json_extract(input,'$.task_id')=? AND state IN ('queued','rewriting','running')) OR (? AND NOT EXISTS(SELECT 1 FROM jobs WHERE account=? AND json_extract(input,'$.task_id')=? AND state IN ('rewriting','running'))))",params![config.to_string(),at,id,account,account,id,schedule_only,account,id]).map_err(|e|e.to_string())?;
            if changed != 1 {
                return Err("找不到任务或任务正在执行，请等待结束后编辑".into());
            }
        } else {
            self.lock()?
                .execute(
                    "INSERT INTO automation_tasks VALUES(?,?,?,0,'paused',?,NULL)",
                    params![id, account, config.to_string(), at],
                )
                .map_err(|e| e.to_string())?;
        }
        let _ = self.record_event(
            "info",
            "automation.created",
            Some(&account),
            "自动化任务已保存，保持暂停",
        );
        Ok(json!({"id":id}))
    }
    pub fn delete_automation(&self, account: &str, id: &str) -> Result<Value, String> {
        let account = handle(account)?;
        let changed = self.lock()?.execute("DELETE FROM automation_tasks WHERE account=? AND id=? AND NOT EXISTS(SELECT 1 FROM jobs WHERE account=? AND json_extract(input,'$.task_id')=? AND state IN ('queued','rewriting','running'))",params![account,id,account,id]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("找不到任务或任务正在执行，请等待结束后删除".into());
        }
        Ok(json!({"saved":true}))
    }
    pub fn control_automation(
        &self,
        account: &str,
        id: &str,
        enabled: bool,
        at: i64,
    ) -> Result<Value, String> {
        let account = handle(account)?;
        let changed = self
            .lock()?
            .execute(
                "UPDATE automation_tasks SET enabled=?,state=?,next_run=MAX(?,coalesce((SELECT MAX(j.updated_at)+automation_interval_ms(automation_tasks.value) FROM jobs j WHERE j.account=automation_tasks.account AND json_extract(j.input,'$.task_id')=automation_tasks.id AND j.action='rewrite_publish' AND j.state='completed'),0)) WHERE id=? AND account=? AND (?=0 OR json_extract(value,'$.stop_at') IS NULL OR json_extract(value,'$.stop_at')>?)",
                params![
                    enabled,
                    if enabled { "waiting" } else { "paused" },
                    at,
                    id,
                    account,enabled,at
                ],
            )
            .map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err("找不到任务或已到停止时间，请先编辑停止时间".into());
        }
        let _ = self.record_event(
            "info",
            "automation.control",
            Some(&account),
            if enabled {
                "自动化已启用"
            } else {
                "自动化已暂停"
            },
        );
        self.automation_state(&account)
    }
    pub fn block_automation(&self, account: &str, reason: &str, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        if !["关注受限", "操作过于频繁", "账号需要验证", "操作结果不确定"].contains(&reason)
        {
            return Err("限制原因无效".into());
        }
        {
            let db = self.lock()?;
            db.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("automation_block:{account}"),json!({"reason":reason,"at":at}).to_string()]).map_err(|e|e.to_string())?;
            db.execute(
                "UPDATE automation_tasks SET state='limited' WHERE account=? AND enabled=1",
                [&account],
            )
            .map_err(|e| e.to_string())?;
            db.execute("UPDATE jobs SET state='failed',error='账号操作受限，自动化已暂停',updated_at=? WHERE account=? AND action IN ('follow_back','unfollow') AND state='queued'",params![at,account]).map_err(|e|e.to_string())?;
        }
        let _ = self.record_event("error", "automation.limited", Some(&account), reason);
        self.automation_state(&account)
    }
    pub fn resume_automation(&self, account: &str, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        {
            let db = self.lock()?;
            db.execute(
                "DELETE FROM settings WHERE key=?",
                [format!("automation_block:{account}")],
            )
            .map_err(|e| e.to_string())?;
            db.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("automation_resumed:{account}"),json!(at).to_string()]).map_err(|e|e.to_string())?;
            db.execute("UPDATE automation_tasks SET state='waiting',next_run=? WHERE account=? AND enabled=1",params![at+60_000,account]).map_err(|e|e.to_string())?;
        }
        let _ = self.record_event(
            "info",
            "automation.resumed",
            Some(&account),
            "用户确认限制解除，已恢复自动化",
        );
        self.automation_state(&account)
    }
    pub fn automation_can_run(&self, account: &str, task: &str) -> Result<Value, String> {
        self.expire_automation(now())?;
        let state = self.automation_state(account)?;
        let enabled = state["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .any(|v| v["id"].as_str() == Some(task) && v["enabled"] == true);
        Ok(
            json!({"allowed":state["block"].is_null()&&enabled,"block":state["block"],"resumed_at":state["resumed_at"]}),
        )
    }
    pub fn run_automation(&self, account: &str, id: &str, at: i64) -> Result<Value, String> {
        self.expire_automation(at)?;
        let account = handle(account)?;
        let state = self.automation_state(&account)?;
        if !state["block"].is_null() {
            return Err("账号操作受限，需确认解除后手动恢复".into());
        }
        let task = state["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["id"].as_str() == Some(id) && t["enabled"] == true)
            .ok_or("请先启用当前账号的任务")?;
        let config = &task["config"];
        if ["auto_reply", "reply_notifications", "auto_post"]
            .iter()
            .any(|action| config["action"] == *action) || config["action"] == "follow_back" && config["scope"] == "notifications"
        {
            return self.run_for_you(&account, id, at);
        }
        let mut payload = config.clone();
        payload["task_id"] = json!(id);
        let db = self.lock()?;
        let current: Option<String> = db
            .query_row(
                "SELECT value FROM automation_tasks WHERE account=? AND id=? AND enabled=1",
                params![account, id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if current
            .as_deref()
            .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
            .as_ref()
            != Some(config)
        {
            return Err("自动化设置已变化，请重新执行".into());
        }
        let online=db.query_row("SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1",params![account,at-60_000],|_|Ok(())).optional().map_err(|e|e.to_string())?.is_some();
        if !online {
            return Err("请连接支持自动化的新版 X 助手".into());
        }
        if db
            .query_row(
                "SELECT 1 FROM jobs WHERE account=? AND state IN ('queued','rewriting','running')",
                [&account],
                |_| Ok(()),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .is_some()
        {
            return Err("账号已有任务执行中".into());
        }
        if config["action"] == "follow_back" && config["scope"] == "automation_owned" {
            let synced:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM relationship_runs WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?) AND kind='followers')",[&account],|r|r.get(0)).map_err(|e|e.to_string())?;
            if !synced {
                return Err("请先同步关注和粉丝名单，再执行自动回关".into());
            }
            let mut statement=db.prepare("SELECT handle FROM relationships WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?) AND followed_by=1 AND following=0 ORDER BY updated_at DESC,handle LIMIT ?").map_err(|e|e.to_string())?;
            let targets = statement
                .query_map(params![account, config["limit"].as_i64().unwrap()], |r| {
                    r.get::<_, String>(0)
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            payload["targets"] = json!(targets);
        }
        if config["action"] == "unfollow" && config["scope"] == "automation_owned" {
            let mut statement=db.prepare("SELECT target FROM automation_follows WHERE account=? AND following=1 AND followed_at<=? ORDER BY followed_at LIMIT ?").map_err(|e|e.to_string())?;
            let targets = statement
                .query_map(
                    params![
                        account,
                        at - config["after_days"].as_i64().unwrap() * 86400000,
                        config["limit"].as_i64().unwrap()
                    ],
                    |r| r.get::<_, String>(0),
                )
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            payload["targets"] = json!(targets);
        }
        let next = at + interval_ms(config);
        if payload["targets"].as_array().is_none_or(|v| v.is_empty()) {
            db.execute(
                "UPDATE automation_tasks SET next_run=?,state='waiting' WHERE id=?",
                params![next, id],
            )
            .map_err(|e| e.to_string())?;
            return Ok(json!({"queued":false,"message":"暂无符合条件的已同步目标"}));
        }
        let job = Uuid::new_v4().to_string();
        db.execute("INSERT INTO jobs(id,account,action,state,client,created_at,updated_at,error,result,input) VALUES(?,?,?,'queued',NULL,?,?,NULL,NULL,?)",params![job,account,config["action"].as_str().unwrap(),at,at,payload.to_string()]).map_err(|e|e.to_string())?;
        db.execute(
            "UPDATE automation_tasks SET next_run=?,last_run=?,state='queued' WHERE id=?",
            params![next, at, id],
        )
        .map_err(|e| e.to_string())?;
        drop(db);
        let _ = self.record_event(
            "info",
            "automation.queued",
            Some(&account),
            "自动化任务已排队",
        );
        Ok(json!({"id":job,"queued":true}))
    }
    pub fn schedule_automation(&self, account: &str, at: i64) -> Result<(), String> {
        self.expire_automation(at)?;
        let state = self.automation_state(account)?;
        if !state["block"].is_null() {
            return Ok(());
        }
        for task in state["tasks"].as_array().unwrap() {
            if task["enabled"] == true && task["next_run"].as_i64().is_some_and(|t| t <= at) {
                let _ = self.run_automation(account, task["id"].as_str().unwrap(), at);
                break;
            }
        }
        Ok(())
    }
    pub fn set_automation_support(&self, client: &str, supported: bool) -> Result<(), String> {
        self.lock()?
            .execute(
                "UPDATE browser_sessions SET automation_supported=? WHERE client=?",
                params![supported, client],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn automation_progress(
        &self,
        id: &str,
        client: &str,
        target: &str,
        at: i64,
    ) -> Result<Value, String> {
        let target = handle(target)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let job:(String,String,String,Option<String>)=tx.query_row("SELECT account,action,input,result FROM jobs WHERE id=? AND client=? AND state='running' AND action IN ('follow_back','unfollow')",params![id,client],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|_|"自动化任务不属于当前连接")?;
        let (account, action, input, previous) = job;
        let input: Value = serde_json::from_str(&input).map_err(|_| "任务参数无效")?;
        if account == target
            || (action == "unfollow" || input["targets"].is_array())
                && !input["targets"]
                    .as_array()
                    .is_some_and(|items| items.iter().any(|v| v.as_str() == Some(target.as_str())))
        {
            return Err("任务目标不匹配".into());
        }
        let mut result: Value = previous
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or(json!({"completed":[]}));
        let completed = result["completed"].as_array_mut().ok_or("任务结果无效")?;
        if !completed
            .iter()
            .any(|v| v.as_str() == Some(target.as_str()))
        {
            if completed.len() >= input["limit"].as_u64().unwrap_or(0) as usize {
                return Err("任务已达到配置数量".into());
            }
            completed.push(json!(target));
            tx.execute("UPDATE relationships SET following=?,updated_at=? WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?) AND handle=?",params![action=="follow_back",at,account,target]).map_err(|e|e.to_string())?;
            if action == "follow_back" {
                tx.execute("INSERT INTO automation_follows VALUES(?,?,?,1) ON CONFLICT(account,target) DO UPDATE SET followed_at=excluded.followed_at,following=1",params![account,target,at]).map_err(|e|e.to_string())?;
            } else {
                tx.execute(
                    "UPDATE automation_follows SET following=0 WHERE account=? AND target=?",
                    params![account, target],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        tx.execute(
            "UPDATE jobs SET result=?,updated_at=? WHERE id=?",
            params![result.to_string(), at, id],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE automation_tasks SET state='running' WHERE id=?",
            [input["task_id"].as_str().unwrap_or("")],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        drop(db);
        let _ = self.record_event(
            "info",
            "automation.progress",
            Some(&account),
            &format!(
                "{} @{}",
                if action == "follow_back" {
                    "已回关"
                } else {
                    "已取消关注"
                },
                target
            ),
        );
        Ok(result)
    }
    pub fn finish_automation(
        &self,
        id: &str,
        client: &str,
        result: &Value,
        error: Option<&str>,
        at: i64,
    ) -> Result<Option<Value>, String> {
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let job:Option<(String,String,String,Option<String>)>=tx.query_row("SELECT account,action,input,result FROM jobs WHERE id=? AND client=? AND state='running' AND action IN ('follow_back','unfollow')",params![id,client],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|e|e.to_string())?;
        let Some((account, action, raw, previous)) = job else {
            return Ok(None);
        };
        let input: Value = serde_json::from_str(&raw).map_err(|_| "任务参数无效")?;
        if result.to_string().len() > 8000 {
            return Err("任务结果过长".into());
        }
        let mut outcome = if result.is_object() {
            result.clone()
        } else {
            json!({})
        };
        let prior = previous
            .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
            .unwrap_or(json!({}));
        let completed = prior["completed"]
            .as_array()
            .into_iter()
            .flatten()
            .chain(result["completed"].as_array().into_iter().flatten())
            .map(|v| handle(v.as_str().ok_or("任务结果账号无效")?))
            .collect::<Result<std::collections::BTreeSet<_>, String>>()?;
        let completed = completed.into_iter().map(Value::String).collect::<Vec<_>>();
        outcome["completed"] = json!(completed);
        if outcome["blocked"] == true
            && !["关注受限", "操作过于频繁", "账号需要验证", "操作结果不确定"]
                .contains(&outcome["reason"].as_str().unwrap_or(""))
        {
            return Err("限制原因无效".into());
        }
        if completed.len() > input["limit"].as_u64().unwrap_or(0) as usize {
            return Err("任务结果超出配置数量".into());
        }
        let targets = completed
            .iter()
            .map(|value| handle(value.as_str().ok_or("任务结果账号无效")?))
            .collect::<Result<std::collections::BTreeSet<_>, String>>()?;
        for target in targets {
            if (action == "unfollow" || input["targets"].is_array())
                && !input["targets"]
                    .as_array()
                    .is_some_and(|items| items.iter().any(|v| v.as_str() == Some(target.as_str())))
            {
                return Err("任务结果目标不匹配".into());
            }
            tx.execute("UPDATE relationships SET following=?,updated_at=? WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?) AND handle=?",params![action=="follow_back",at,account,target]).map_err(|e|e.to_string())?;
            if action == "follow_back" {
                tx.execute("INSERT INTO automation_follows VALUES(?,?,?,1) ON CONFLICT(account,target) DO UPDATE SET followed_at=excluded.followed_at,following=1",params![account,target,at]).map_err(|e|e.to_string())?;
            } else {
                tx.execute(
                    "UPDATE automation_follows SET following=0 WHERE account=? AND target=?",
                    params![account, target],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        let failed = error.is_some() || result["blocked"] == true;
        tx.execute(
            "UPDATE jobs SET state=?,error=?,result=?,updated_at=? WHERE id=?",
            params![
                if failed { "failed" } else { "completed" },
                error,
                outcome.to_string(),
                at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE automation_tasks SET state=? WHERE id=? AND account=?",
            params![
                if result["blocked"] == true {
                    "limited"
                } else if failed {
                    "error"
                } else {
                    "waiting"
                },
                input["task_id"].as_str().unwrap_or(""),
                account
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        drop(db);
        if result["blocked"] == true {
            let reason = result["reason"].as_str().unwrap_or("操作结果不确定");
            self.block_automation(&account, reason, at)?;
        }
        let _ = self.record_event(
            if failed { "error" } else { "info" },
            "automation.finished",
            Some(&account),
            &format!(
                "{}：完成 {} 人",
                if action == "follow_back" {
                    "回关"
                } else {
                    "取消关注"
                },
                completed.len()
            ),
        );
        Ok(Some(json!({"saved":true})))
    }
}

use super::*;
impl Store {
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
        let mut statement=db.prepare("SELECT id,value,enabled,state,next_run,last_run FROM automation_tasks WHERE account=? ORDER BY next_run,id").map_err(|e|e.to_string())?;
        let tasks=statement.query_map([&account],|r|Ok(json!({"id":r.get::<_,String>(0)?,"config":serde_json::from_str::<Value>(&r.get::<_,String>(1)?).unwrap_or(Value::Null),"enabled":r.get::<_,bool>(2)?,"state":r.get::<_,String>(3)?,"next_run":r.get::<_,i64>(4)?,"last_run":r.get::<_,Option<i64>>(5)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(
            json!({"account":account,"block":blocked,"resumed_at":resumed.and_then(|v|v.as_i64()),"tasks":tasks}),
        )
    }
    pub fn save_automation(&self, account: &str, input: &Value, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        let action = input["action"].as_str().ok_or("选择自动化类型")?;
        if !["follow_back", "unfollow"].contains(&action) {
            return Err("自动化类型无效".into());
        }
        let interval = input["interval_minutes"]
            .as_i64()
            .filter(|n| (5..=10080).contains(n))
            .ok_or("执行间隔应为5–10080分钟")?;
        let limit = input["limit"]
            .as_u64()
            .filter(|n| (1..=20).contains(n))
            .ok_or("每次执行1–20人")?;
        let days = input["after_days"]
            .as_u64()
            .filter(|n| (1..=365).contains(n))
            .ok_or("到期天数应为1–365天")?;
        let scope = input["scope"]
            .as_str()
            .filter(|s| ["automation_owned", "manual"].contains(s))
            .ok_or("自动化范围无效")?;
        let targets = input["targets"].as_array().ok_or("目标名单无效")?;
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
        let config = json!({"action":action,"interval_minutes":interval,"limit":limit,"after_days":days,"scope":scope,"targets":targets});
        let id = Uuid::new_v4().to_string();
        self.lock()?
            .execute(
                "INSERT INTO automation_tasks VALUES(?,?,?,0,'paused',?,NULL)",
                params![id, account, config.to_string(), at],
            )
            .map_err(|e| e.to_string())?;
        let _ = self.record_event(
            "info",
            "automation.created",
            Some(&account),
            "自动化任务已创建，默认未启用",
        );
        Ok(json!({"id":id}))
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
                "UPDATE automation_tasks SET enabled=?,state=?,next_run=? WHERE id=? AND account=?",
                params![
                    enabled,
                    if enabled { "waiting" } else { "paused" },
                    at,
                    id,
                    account
                ],
            )
            .map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err("找不到当前账号的任务".into());
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
        let mut payload = config.clone();
        payload["task_id"] = json!(id);
        let db = self.lock()?;
        let online=db.query_row("SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1",params![account,at-60_000],|_|Ok(())).optional().map_err(|e|e.to_string())?.is_some();
        if !online {
            return Err("请连接支持自动化的新版 X 助手".into());
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
            return Err("账号已有任务执行中".into());
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
        let next = at + config["interval_minutes"].as_i64().unwrap() * 60000;
        if config["action"] == "unfollow"
            && payload["targets"].as_array().is_none_or(|v| v.is_empty())
        {
            db.execute(
                "UPDATE automation_tasks SET next_run=?,state='waiting' WHERE id=?",
                params![next, id],
            )
            .map_err(|e| e.to_string())?;
            return Ok(json!({"queued":false,"message":"暂无到期目标"}));
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
            || action == "unfollow"
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
            if action == "unfollow"
                && !input["targets"]
                    .as_array()
                    .is_some_and(|items| items.iter().any(|v| v.as_str() == Some(target.as_str())))
            {
                return Err("任务结果目标不匹配".into());
            }
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

use super::*;

impl Store {
    pub fn queue_notification_follows(&self, id: &str, client: &str, targets: &Value, at: i64) -> Result<Value, String> {
        self.expire_automation(at)?;
        let targets = targets.as_array().filter(|items| items.len() <= 20).ok_or("每批最多20个关注通知")?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e|e.to_string())?;
        let (account, raw): (String, String) = tx.query_row("SELECT j.account,j.input FROM jobs j JOIN clients c ON c.id=j.client JOIN browser_sessions s ON s.client=c.id WHERE j.id=? AND j.client=? AND j.action='capture_notifications' AND j.state='running' AND c.account=j.account AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_notification_follows(s.extension_version) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||j.account)",params![id,client,at-60_000],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"通知采集任务不属于当前有效连接")?;
        let input: Value = serde_json::from_str(&raw).map_err(|_|"通知采集任务无效")?;
        if input["scope"] != "notifications" || input["publication_mode"] != "follow_back" { return Err("此通知任务不能创建回关任务".into()); }
        let task = input["task_id"].as_str().ok_or("缺少回关计划")?;
        let enabled: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM automation_tasks WHERE id=? AND account=? AND enabled=1 AND json_extract(value,'$.action')='follow_back' AND json_extract(value,'$.scope')='notifications')",params![task,account],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !enabled { return Err("通知回关已暂停，未创建新任务".into()); }
        let limit = input["limit"].as_u64().filter(|limit| (1..=20).contains(limit)).ok_or("回关数量无效")? as usize;
        let previous: i64 = tx.query_row("SELECT coalesce(SUM(json_array_length(input,'$.targets')),0) FROM jobs WHERE account=? AND action='follow_back' AND json_extract(input,'$.discovery_job')=?",params![account,id],|r|r.get(0)).map_err(|e|e.to_string())?;
        let mut selected = Vec::new();
        let mut skipped = 0;
        for target in targets {
            let target = handle(target.as_str().ok_or("通知关注账号无效")?)?;
            if target == account { return Err("不能回关当前账号".into()); }
            let known: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs j,json_each(j.input,'$.targets') t WHERE j.account=? AND j.action='follow_back' AND json_extract(j.input,'$.discovered_from')='notifications' AND t.value=?) OR EXISTS(SELECT 1 FROM automation_follows WHERE account=? AND target=? AND following=1) OR EXISTS(SELECT 1 FROM relationships WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?) AND handle=? AND following=1)",params![account,target,account,target,account,target],|r|r.get(0)).map_err(|e|e.to_string())?;
            if selected.contains(&target) || known { skipped += 1; continue; }
            if previous as usize + selected.len() >= limit { return Err("已达到本轮回关数量，未创建多余任务".into()); }
            selected.push(target);
        }
        let mut ids = Vec::new();
        if !selected.is_empty() {
            let child = Uuid::new_v4().to_string();
            let payload = json!({"task_id":task,"scope":"notifications","targets":selected,"limit":limit,"discovery_job":id,"discovered_from":"notifications"});
            tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,'follow_back','queued',?,?,?)",params![child,account,at,at,payload.to_string()]).map_err(|e|e.to_string())?;
            ids.push(child);
        }
        let result = json!({"queued":selected.len(),"skipped":skipped,"scanned":targets.len()});
        tx.execute("UPDATE jobs SET result=?,updated_at=? WHERE id=?",params![result.to_string(),at,id]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;
        Ok(json!({"job_ids":ids,"queued":selected.len(),"skipped":skipped}))
    }

    pub fn relationships(&self, account: &str, input: &Value) -> Result<Value, String> {
        let account = handle(account)?;
        let db = self.lock()?;
        let uid: String = db
            .query_row("SELECT uid FROM accounts WHERE handle=?", [&account], |r| {
                r.get(0)
            })
            .map_err(|_| "请先连接并采集账号")?;
        let filter = input["filter"].as_str().unwrap_or("following");
        let condition = match filter {
            "following" => "following=1",
            "followers" => "followed_by=1",
            "follow_back" => "followed_by=1 AND following=0",
            "not_following_back" => "following=1 AND followed_by=0",
            _ => return Err("关系筛选无效".into()),
        };
        let search = input["search"].as_str().unwrap_or("");
        if search.chars().count() > 100 {
            return Err("搜索内容过长".into());
        }
        let offset = input["offset"].as_u64().unwrap_or(0).min(1_000_000) as i64;
        let predicate = format!("owner_uid=? AND ({condition}) AND (instr(lower(handle),lower(?))>0 OR instr(lower(name),lower(?))>0)");
        let total: i64 = db
            .query_row(
                &format!("SELECT count(*) FROM relationships WHERE {predicate}"),
                params![uid, search, search],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut stmt=db.prepare(&format!("SELECT target_uid,handle,name,following,followed_by,updated_at FROM relationships WHERE {predicate} ORDER BY handle LIMIT 50 OFFSET ?")).map_err(|e|e.to_string())?;
        let items=stmt.query_map(params![uid,search,search,offset],|r|Ok(json!({"uid":r.get::<_,String>(0)?,"handle":r.get::<_,String>(1)?,"name":r.get::<_,String>(2)?,"following":r.get::<_,Option<bool>>(3)?,"followed_by":r.get::<_,Option<bool>>(4)?,"updated_at":r.get::<_,i64>(5)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        let mut stmt=db.prepare("SELECT kind,complete,updated_at FROM relationship_runs WHERE owner_uid=? ORDER BY kind").map_err(|e|e.to_string())?;
        let runs=stmt.query_map([&uid],|r|Ok(json!({"kind":r.get::<_,String>(0)?,"complete":r.get::<_,bool>(1)?,"updated_at":r.get::<_,i64>(2)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        let sync:Option<Value>=db.query_row("SELECT state,error FROM jobs WHERE account=? AND action='capture_relationships' ORDER BY created_at DESC LIMIT 1",[&account],|r|Ok(json!({"state":r.get::<_,String>(0)?,"error":r.get::<_,Option<String>>(1)?}))).optional().map_err(|e|e.to_string())?;
        Ok(
            json!({"account":account,"items":items,"runs":runs,"sync":sync,"total":total,"next_offset":if offset+50<total{Some(offset+50)}else{None}}),
        )
    }

    pub fn sync_relationships(
        &self,
        account: &str,
        input: &Value,
        at: i64,
    ) -> Result<Value, String> {
        let account = handle(account)?;
        let kind = input["kind"]
            .as_str()
            .filter(|s| ["followers", "following"].contains(s))
            .ok_or("关系名单类型无效")?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let uid: String = tx
            .query_row("SELECT uid FROM accounts WHERE handle=?", [&account], |r| {
                r.get(0)
            })
            .map_err(|_| "请先连接账号")?;
        identities::x_uid(&uid).map_err(|_| "请重新连接新版助手以识别账号 UID")?;
        let allowed:bool=tx.query_row("SELECT NOT EXISTS(SELECT 1 FROM x_sessions WHERE owner_uid=? AND (state NOT IN ('active','limited') OR (state='limited' AND next_poll>?)))",params![uid,at],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !allowed {
            return Err("账号登录态已失效或限流，请稍后重新连接".into());
        }
        let online:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND extension_compatible(s.extension_version))",params![account,at-60_000],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !online {
            return Err("请更新并连接 X 助手后同步名单".into());
        }
        if tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND state IN ('queued','running'))",[&account],|r|r.get::<_,bool>(0)).map_err(|e|e.to_string())? {return Err("当前账号有任务执行中，请稍后同步".into());}
        let previous:Option<(String,Option<String>,bool)>=tx.query_row("SELECT generation,cursor,complete FROM relationship_runs WHERE owner_uid=? AND kind=?",params![uid,kind],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
        let (generation, cursor) = match previous {
            Some((g, c, false)) => (g, c),
            _ => (Uuid::new_v4().to_string(), None),
        };
        tx.execute("INSERT INTO relationship_runs(owner_uid,kind,generation,cursor,complete,error,updated_at) VALUES(?,?,?,?,0,NULL,?) ON CONFLICT(owner_uid,kind) DO UPDATE SET generation=excluded.generation,cursor=excluded.cursor,complete=0,error=NULL,updated_at=excluded.updated_at",params![uid,kind,generation,cursor,at]).map_err(|e|e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let payload = json!({"executor":"browser","kind":kind,"owner_uid":uid,"generation":generation,"cursor":cursor});
        tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,'capture_relationships','queued',?,?,?)",params![id,account,at,at,payload.to_string()]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"id":id}))
    }

    pub fn save_relationship_page(
        &self,
        account: &str,
        input: &Value,
        at: i64,
    ) -> Result<Value, String> {
        let account = handle(account)?;
        let id = input["id"].as_str().ok_or("缺少同步任务")?;
        let client = input["client"].as_str().ok_or("缺少连接标识")?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let raw:String=tx.query_row("SELECT input FROM jobs WHERE id=? AND account=? AND client=? AND action='capture_relationships' AND state='running'",params![id,account,client],|r|r.get(0)).map_err(|_|"同步任务已失效或不属于当前连接")?;
        let job: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let uid = job["owner_uid"].as_str().ok_or("同步账号无效")?;
        let connected:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id JOIN accounts a ON a.handle=c.account WHERE c.id=? AND c.account=? AND a.uid=? AND s.connected=1 AND s.state='logged_in') AND NOT EXISTS(SELECT 1 FROM x_sessions WHERE owner_uid=? AND state NOT IN ('active','limited'))",params![client,account,uid,uid],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !connected {
            return Err("账号连接已改变，同步结果未保存".into());
        }
        let kind = job["kind"].as_str().ok_or("同步类型无效")?;
        let generation = job["generation"].as_str().ok_or("同步批次无效")?;
        let (current,cursor,done):(String,Option<String>,bool)=tx.query_row("SELECT generation,cursor,complete FROM relationship_runs WHERE owner_uid=? AND kind=?",params![uid,kind],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(|e|e.to_string())?;
        if done || current != generation || input["cursor"] != json!(cursor) {
            return Err("同步游标已改变，请重新读取名单".into());
        }
        let complete = input["complete"].as_bool().ok_or("缺少分页状态")?;
        let next = match &input["next_cursor"] {
            Value::Null => None,
            Value::String(s) if !s.is_empty() && s.len() <= 4096 => Some(s.as_str()),
            _ => return Err("下一页游标无效".into()),
        };
        if complete != next.is_none() || !complete && next == cursor.as_deref() {
            return Err("分页未推进，已停止同步".into());
        }
        let items = input["items"]
            .as_array()
            .filter(|v| v.len() <= 1000)
            .ok_or("名单页面过大")?;
        for item in items {
            let target = item["uid"].as_str().ok_or("名单用户 UID 无效")?;
            identities::x_uid(target)?;
            if target == uid {
                continue;
            }
            let name = handle(item["handle"].as_str().ok_or("名单账号无效")?)?;
            let display = item["name"]
                .as_str()
                .filter(|s| s.chars().count() <= 100)
                .ok_or("用户名称无效")?;
            let flag = |key: &str| -> Result<Option<bool>, String> {
                match &item[key] {
                    Value::Null => Ok(None),
                    Value::Bool(v) => Ok(Some(*v)),
                    _ => Err("关注状态无效".into()),
                }
            };
            let following = if kind == "following" {
                Some(true)
            } else {
                flag("following")?
            };
            let followed_by = if kind == "followers" {
                Some(true)
            } else {
                flag("followed_by")?
            };
            tx.execute("INSERT INTO relationships(owner_uid,target_uid,handle,name,following,followed_by,following_generation,followers_generation,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_uid,target_uid) DO UPDATE SET handle=excluded.handle,name=excluded.name,following=COALESCE(excluded.following,relationships.following),followed_by=COALESCE(excluded.followed_by,relationships.followed_by),following_generation=COALESCE(excluded.following_generation,relationships.following_generation),followers_generation=COALESCE(excluded.followers_generation,relationships.followers_generation),updated_at=excluded.updated_at",params![uid,target,name,display,following,followed_by,if kind=="following"{Some(generation)}else{None},if kind=="followers"{Some(generation)}else{None},at]).map_err(|e|e.to_string())?;
        }
        if complete {
            let (flag, generation_column) = if kind == "following" {
                ("following", "following_generation")
            } else {
                ("followed_by", "followers_generation")
            };
            tx.execute(&format!("UPDATE relationships SET {flag}=0 WHERE owner_uid=? AND COALESCE({generation_column},'')<>?"),params![uid,generation]).map_err(|e|e.to_string())?;
        }
        tx.execute("UPDATE relationship_runs SET cursor=?,complete=?,updated_at=? WHERE owner_uid=? AND kind=?",params![next,complete,at,uid,kind]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE jobs SET updated_at=? WHERE id=?", params![at, id])
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"saved":true}))
    }
}

use super::*;

impl Store {
    pub fn run_video_automation(&self,account:&str,task:&str,at:i64)->Result<Value,String>{
        let account=handle(account)?;let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let raw:String=tx.query_row("SELECT value FROM automation_tasks WHERE id=? AND account=? AND enabled=1 AND json_extract(value,'$.action')='auto_video'",params![task,account],|r|r.get(0)).map_err(|_|"请先启用视频配文计划")?;
        let config:Value=serde_json::from_str(&raw).map_err(|_|"视频计划无效")?;
        let active:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND state IN ('queued','running','rewriting')) OR EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||?)",params![account,account],|r|r.get(0)).map_err(|e|e.to_string())?;
        if active{return Err("账号已有任务执行中或已暂停操作".into());}
        let online:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_video_tasks(s.extension_version))",params![account,at-60_000],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !online{return Err("视频自动化需要重载并连接1.5.26或更新的助手".into());}
        let mut statement=tx.prepare("SELECT DISTINCT json_extract(input,'$.source.id') FROM jobs WHERE account=? AND action='video_caption' AND json_extract(input,'$.source.id') IS NOT NULL ORDER BY created_at DESC LIMIT 5000").map_err(|e|e.to_string())?;
        let known=statement.query_map([&account],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;drop(statement);
        let id=Uuid::new_v4().to_string();let input=json!({"task_id":task,"source_urls":config["source_urls"],"known_ids":known,"limit":1});
        tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,'capture_tiktok','queued',?,?,?)",params![id,account,at,at,input.to_string()]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'created','视频计划已排队，等待读取TikTok来源')",params![id,at]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE automation_tasks SET state='queued',last_run=?,next_run=? WHERE id=? AND account=?",params![at,at+super::automation::interval_ms(&config),task,account]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(json!({"id":id,"queued":true}))
    }
    pub fn video_capture_context(&self,id:&str,client:&str,url:&str,at:i64)->Result<Value,String>{
        let (_,video_id)=crate::video::video_page(url)?;let db=self.lock()?;
        let (account,task):(String,String)=db.query_row("SELECT j.account,t.id FROM jobs j JOIN automation_tasks t ON t.id=json_extract(j.input,'$.task_id') AND t.account=j.account JOIN clients c ON c.id=j.client AND c.account=j.account JOIN browser_sessions s ON s.client=c.id WHERE j.id=? AND j.client=? AND j.action='capture_tiktok' AND j.state='running' AND t.enabled=1 AND json_extract(t.value,'$.action')='auto_video' AND (json_extract(t.value,'$.stop_at') IS NULL OR json_extract(t.value,'$.stop_at')>?) AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_video_tasks(s.extension_version) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||j.account)",params![id,client,at,at-60_000],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"视频采集任务不属于有效连接，或计划已暂停")?;
        let duplicate:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND action='video_caption' AND json_extract(input,'$.source.id')=?)",params![account,video_id],|r|r.get(0)).map_err(|e|e.to_string())?;
        if duplicate{return Err("此视频已有处理记录，跳过重复下载".into());}
        Ok(json!({"account":account,"task_id":task}))
    }
    pub fn finish_video_capture(&self,id:&str,client:&str,error:Option<&str>,at:i64)->Result<Option<Value>,String>{
        if error.is_some_and(|e|e.chars().count()>2000){return Err("错误信息过长".into());}
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let row:Option<(String,String)>=tx.query_row("SELECT account,json_extract(input,'$.task_id') FROM jobs WHERE id=? AND client=? AND state='running' AND action='capture_tiktok'",params![id,client],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
        let Some((account,task))=row else{return Ok(None)};
        let count:i64=tx.query_row("SELECT count(*) FROM jobs WHERE account=? AND action='video_caption' AND json_extract(input,'$.capture_job')=?",params![account,id],|r|r.get(0)).map_err(|e|e.to_string())?;
        let skipped=count==0&&error.is_none();let result=json!({"prepared":count,"sent":false,"skip_reason":if skipped{"当前来源没有未处理的新视频"}else{""}});
        tx.execute("UPDATE jobs SET state=?,error=?,result=?,updated_at=?,input=json_set(input,'$.stage',?) WHERE id=?",params![if error.is_some(){"failed"}else{"completed"},error,result.to_string(),at,if skipped{"skipped"}else{"ready"},id]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE automation_tasks SET state=CASE WHEN enabled=0 THEN 'paused' WHEN ? THEN 'error' ELSE 'waiting' END WHERE id=? AND account=?",params![error.is_some(),task,account]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,?,?)",params![id,at,if error.is_some(){"failed"}else{"completed"},error.unwrap_or(if skipped{"当前来源没有未处理的新视频，本轮未调用模型"}else{"视频已下载，配文已进入模型队列；未发布"})]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(Some(json!({"saved":true})))
    }
    pub fn enqueue_video_caption(&self, account:&str, video:&Value, retry:bool, at:i64)->Result<Value,String>{
        let account=handle(account)?;
        let id=video["download_id"].as_str().ok_or("下载标识缺失")?;
        uuid::Uuid::parse_str(id).map_err(|_|"下载标识无效")?;
        let mut input=json!({"download_id":id,"stage":"rewrite","source":{"id":video["id"],"author":video["author"],"url":video["source"],"text":video["title"]},"language":"en"});
        if let Some(capture)=video["capture_job"].as_str().filter(|_|!retry){
            let context=self.video_capture_context(capture,video["capture_client"].as_str().ok_or("视频采集连接缺失")?,video["source"].as_str().ok_or("视频来源缺失")?,at)?;
            if context["account"]!=account{return Err("视频采集账号不匹配".into());}
            input["task_id"]=context["task_id"].clone();input["capture_job"]=json!(capture);
        }
        {
            let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
            let inserted=tx.execute("INSERT OR IGNORE INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,'video_caption','queued',?,?,?)",params![id,account,at,at,input.to_string()]).map_err(|e|e.to_string())?;
            if inserted==1 {tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'created','视频已下载，英文配文已排队')",params![id,at]).map_err(|e|e.to_string())?;}
            else {
                let owned:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE id=? AND account=? AND action='video_caption' AND coalesce(json_extract(input,'$.hidden'),0)=0)",params![id,account],|r|r.get(0)).map_err(|e|e.to_string())?;
                if !owned{return Err("配文任务不属于当前账号或已删除".into());}
                if retry {
                let changed=tx.execute("UPDATE jobs SET state='queued',error=NULL,result=NULL,updated_at=?,input=json_set(input,'$.stage','rewrite') WHERE id=? AND account=? AND action='video_caption' AND state='failed' AND coalesce(json_extract(input,'$.hidden'),0)=0",params![at,id,account]).map_err(|e|e.to_string())?;
                if changed==1 {tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'queued','重试配文，保留原视频和历史模型用量')",params![id,at]).map_err(|e|e.to_string())?;}
                }
            }
            tx.commit().map_err(|e|e.to_string())?;
        }
        self.video_caption_job(id)
    }
    pub fn video_caption_job(&self,id:&str)->Result<Value,String>{
        let db=self.lock()?;
        let mut statement=db.prepare("SELECT id,account,action,state,created_at,updated_at,error,input,result FROM jobs WHERE id=? AND action='video_caption'").map_err(|e|e.to_string())?;
        jobs::read_jobs(&db,&mut statement,[id])?.into_iter().next().ok_or_else(||"视频配文任务不存在".into())
    }
    pub fn finish_video_caption(&self,id:&str,result:Result<&Value,&str>,model_called:bool,at:i64)->Result<(),String>{
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let (state,text,stage,error,value,message)=match result {
            Ok(value)=>("completed",value["text"].as_str().unwrap_or(""),if value["status"]=="ready"{"ready"}else{"skipped"},None,Some(value.to_string()),if value["status"]=="ready"{"英文配文已生成，未发布"}else{"内容已排除或需人工检查，未生成配文"}),
            Err(error)=>("failed","","rewrite",Some(error),None,"配文生成失败，原视频已保留"),
        };
        tx.execute("UPDATE jobs SET state=?,error=?,result=?,updated_at=?,input=json_set(input,'$.stage',?,'$.text',?,'$.model_not_called',json(?)) WHERE id=? AND action='video_caption' AND state='rewriting'",params![state,error,value,at,stage,text,if model_called{"false"}else{"true"},id]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,?,?)",params![id,at,state,message]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(())
    }
}

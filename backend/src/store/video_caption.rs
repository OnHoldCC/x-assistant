use super::*;

impl Store {
    pub fn video_step(&self,id:&str,step:&str,at:i64)->Result<(),String>{
        let changed=self.lock()?.execute("UPDATE jobs SET input=json_set(input,'$.video_step',?),updated_at=? WHERE id=? AND action='video_caption' AND state='rewriting'",params![step,at,id]).map_err(|e|e.to_string())?;
        if changed!=1{return Err("视频处理任务已结束".into());}Ok(())
    }

    pub fn bind_video_media(&self,id:&str,client:&str,media:&str,at:i64)->Result<Value,String>{
        if media.is_empty()||media.len()>30||!media.bytes().all(|c|c.is_ascii_digit()){return Err("上传媒体标识无效".into());}
        self.video_upload_context(id,client,at)?;
        let changed=self.lock()?.execute("UPDATE jobs SET input=json_set(input,'$.media_id',?),updated_at=? WHERE id=? AND client=? AND state='running' AND json_extract(input,'$.stage')='ready' AND (json_extract(input,'$.media_id') IS NULL OR json_extract(input,'$.media_id')=?)",params![media,at,id,client,media]).map_err(|e|e.to_string())?;
        if changed!=1{return Err("上传媒体已改变，未继续发送".into());}Ok(json!({"saved":true}))
    }

    pub fn video_publication(&self,id:&str)->Result<Value,String>{
        let db=self.lock()?;
        let mut statement=db.prepare("SELECT id,account,action,state,created_at,updated_at,error,input,result FROM jobs WHERE id=? AND action='rewrite_publish' AND json_extract(input,'$.mode')='video'").map_err(|e|e.to_string())?;
        Ok(jobs::read_jobs(&db,&mut statement,[format!("video-{id}")])?.into_iter().next().unwrap_or(Value::Null))
    }
    pub fn prepare_existing_video(&self,id:&str,account:&str,at:i64)->Result<(),String>{
        let account=handle(account)?;
        let changed=self.lock()?.execute("UPDATE jobs SET state='queued',error=NULL,result=NULL,updated_at=?,input=json_set(input,'$.stage','rewrite','$.prepare_video',json('true')) WHERE id=? AND account=? AND action='video_caption' AND state='completed' AND json_extract(result,'$.status') IN ('ready','needs_review') AND (json_extract(input,'$.screening_job') IS NULL OR json_extract(input,'$.screening_passed')=1) AND NOT EXISTS(SELECT 1 FROM jobs p WHERE p.id='video-'||jobs.id)",params![at,id,account]).map_err(|e|e.to_string())?;
        if changed!=1{return Err("仅可处理尚未安排发布的合格视频；失败任务请重试配文".into());}
        Ok(())
    }
    pub fn enqueue_video_publication(&self,id:&str,account:&str,automatic:bool,at:i64)->Result<Value,String>{
        let account=handle(account)?;let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let (raw,result):(String,String)=tx.query_row("SELECT input,result FROM jobs WHERE id=? AND account=? AND action='video_caption' AND state='completed' AND coalesce(json_extract(input,'$.hidden'),0)=0",params![id,account],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"当前账号没有已完成的视频配文")?;
        let input:Value=serde_json::from_str(&raw).map_err(|_|"视频任务数据无效")?;
        let result:Value=serde_json::from_str(&result).map_err(|_|"视频审核记录无效")?;
        if result["status"]!="ready"||result["processing"]["verified"]!=true{return Err("视频尚未通过处理和复核，未安排发布".into());}
        if result["content_policy"]!=crate::video_screening::CONTENT_POLICY{return Err("视频尚未按搞笑或成年人非露骨暧昧搬运策略审核，请重新检查后再发布".into());}
        super::publications::validate_post_hashtags(result["text"].as_str().ok_or("视频文案缺失")?)?;
        if automatic {
            let allowed=input["task_id"].as_str().is_some_and(|task|tx.query_row("SELECT EXISTS(SELECT 1 FROM automation_tasks WHERE id=? AND account=? AND enabled=1 AND json_extract(value,'$.action')='auto_video' AND json_extract(value,'$.publish_mode')='automatic' AND (json_extract(value,'$.stop_at') IS NULL OR json_extract(value,'$.stop_at')>?))",params![task,account,at],|r|r.get::<_,bool>(0)).unwrap_or(false));
            if !allowed{return Ok(Value::Null);}
        }
        let publication_id=format!("video-{id}");
        let duplicate:Option<String>=tx.query_row("SELECT id FROM jobs WHERE account=? AND action='rewrite_publish' AND json_extract(input,'$.mode')='video' AND json_extract(input,'$.source.id')=?",params![account,input["source"]["id"].as_str()],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
        if let Some(existing)=duplicate {if existing!=publication_id{return Err("此来源视频已有发布记录或任务，未重复发布".into());}return Ok(json!({"id":existing,"queued":false}));}
        let mut payload=json!({"mode":"video","stage":"ready","publish_at":at,"text":result["text"],"source":input["source"],"download_id":id,"model_not_called":true});
        if automatic{
            payload["task_id"]=input["task_id"].clone();
            let task=input["task_id"].as_str().ok_or("视频计划缺失")?;
            let (next,interval):(i64,i64)=tx.query_row("SELECT next_run,automation_interval_ms(value) FROM automation_tasks WHERE id=? AND account=?",params![task,account],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|e|e.to_string())?;
            let last:Option<i64>=tx.query_row("SELECT max(json_extract(input,'$.publish_at')) FROM jobs WHERE account=? AND action='rewrite_publish' AND state IN ('queued','running') AND json_extract(input,'$.task_id')=?",params![account,task],|r|r.get(0)).map_err(|e|e.to_string())?;
            payload["publish_at"]=json!(at.max(next).max(last.map_or(0,|at|at+interval)));
        }
        tx.execute("INSERT INTO jobs(id,account,action,state,input,created_at,updated_at) VALUES(?,?,'rewrite_publish','queued',?,?,?)",params![publication_id,account,payload.to_string(),at,at]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'created','处理后视频和英文文案已进入串行发布队列；等待X上传与发布回执')",params![publication_id,at]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(json!({"id":publication_id,"queued":true}))
    }
    pub fn video_upload_context(&self,id:&str,client:&str,at:i64)->Result<Value,String>{
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let (download,account):(String,String)=tx.query_row("SELECT json_extract(j.input,'$.download_id'),j.account FROM jobs j JOIN clients c ON c.id=j.client AND c.account=j.account JOIN browser_sessions s ON s.client=c.id JOIN jobs v ON v.id=json_extract(j.input,'$.download_id') AND v.account=j.account WHERE j.id=? AND j.client=? AND j.action='rewrite_publish' AND j.state='running' AND json_extract(j.input,'$.mode')='video' AND json_extract(j.input,'$.stage')='ready' AND v.state='completed' AND v.action='video_caption' AND json_extract(v.result,'$.status')='ready' AND json_extract(v.result,'$.processing.verified')=1 AND json_extract(v.result,'$.content_policy') =? AND json_extract(v.result,'$.text')=json_extract(j.input,'$.text') AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND extension_video_publish(s.extension_version) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||j.account) AND (json_extract(j.input,'$.task_id') IS NULL OR EXISTS(SELECT 1 FROM automation_tasks t WHERE t.id=json_extract(j.input,'$.task_id') AND t.account=j.account AND t.enabled=1))",params![id,client,crate::video_screening::CONTENT_POLICY,at-60_000],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"视频发布任务已暂停、账号不匹配或未通过当前搞笑或成年人非露骨暧昧搬运策略审核")?;
        tx.execute("UPDATE jobs SET updated_at=? WHERE id=?",params![at,id]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(json!({"download_id":download,"account":account}))
    }

    pub fn run_video_automation(&self,account:&str,task:&str,at:i64)->Result<Value,String>{
        self.tiktok_available(at)?;
        let account=handle(account)?;let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let raw:String=tx.query_row("SELECT value FROM automation_tasks WHERE id=? AND account=? AND enabled=1 AND json_extract(value,'$.action')='auto_video'",params![task,account],|r|r.get(0)).map_err(|_|"请先启用视频配文计划")?;
        let config:Value=serde_json::from_str(&raw).map_err(|_|"视频计划无效")?;
        let active:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND state IN ('queued','running','rewriting')) OR EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||?)",params![account,account],|r|r.get(0)).map_err(|e|e.to_string())?;
        if active{return Err("账号已有任务执行中或已暂停操作".into());}
        let online:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_video_tasks(s.extension_version))",params![account,at-60_000],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !online{return Err("视频自动化需要重载并连接1.5.26或更新的助手".into());}
        let mut statement=tx.prepare("SELECT video_id FROM (SELECT json_extract(input,'$.source.id') AS video_id,created_at AS seen FROM jobs WHERE account=?1 AND action='video_caption' AND json_extract(input,'$.source.id') IS NOT NULL UNION ALL SELECT json_extract(s.value,'$.id'),j.updated_at FROM jobs j,json_each(j.input,'$.skipped_videos') s WHERE j.account=?1 AND j.action='capture_tiktok' AND (json_extract(s.value,'$.until')=0 OR json_extract(s.value,'$.until')>?2)) GROUP BY video_id ORDER BY max(seen) DESC LIMIT 5000").map_err(|e|e.to_string())?;
        let known=statement.query_map(params![account,at],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;drop(statement);
        let id=Uuid::new_v4().to_string();let input=json!({"task_id":task,"source_urls":config["source_urls"],"known_ids":known,"limit":config["limit"],"screen_first":true});
        tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,'capture_tiktok','queued',?,?,?)",params![id,account,at,at,input.to_string()]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'created','视频计划已排队，等待读取TikTok来源')",params![id,at]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE automation_tasks SET state='queued',last_run=?,next_run=? WHERE id=? AND account=?",params![at,at+super::automation::interval_ms(&config),task,account]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(json!({"id":id,"queued":true}))
    }
    pub fn video_capture_context(&self,id:&str,client:&str,url:&str,at:i64)->Result<Value,String>{
        let (_,video_id)=crate::video::video_page(url)?;let db=self.lock()?;
        let (account,task):(String,String)=db.query_row("SELECT j.account,t.id FROM jobs j JOIN automation_tasks t ON t.id=json_extract(j.input,'$.task_id') AND t.account=j.account JOIN clients c ON c.id=j.client AND c.account=j.account JOIN browser_sessions s ON s.client=c.id WHERE j.id=? AND j.client=? AND j.action='capture_tiktok' AND j.state='running' AND t.enabled=1 AND json_extract(t.value,'$.action')='auto_video' AND (json_extract(t.value,'$.stop_at') IS NULL OR json_extract(t.value,'$.stop_at')>?) AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_video_tasks(s.extension_version) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||j.account)",params![id,client,at,at-60_000],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"视频采集任务不属于有效连接，或计划已暂停")?;
        let duplicate:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND action='video_caption' AND json_extract(input,'$.source.id')=?)",params![account,video_id],|r|r.get(0)).map_err(|e|e.to_string())?;
        let skipped:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM jobs j,json_each(j.input,'$.skipped_videos') s WHERE j.account=? AND j.action='capture_tiktok' AND json_extract(s.value,'$.id')=? AND (json_extract(s.value,'$.until')=0 OR json_extract(s.value,'$.until')>?))",params![account,video_id,at],|r|r.get(0)).map_err(|e|e.to_string())?;
        if duplicate||skipped{return Err("此视频已有处理或过滤记录，跳过重复下载".into());}
        let raw:String=db.query_row("SELECT input FROM jobs WHERE id=?",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
        let input:Value=serde_json::from_str(&raw).map_err(|_|"采集参数无效")?;
        let count:i64=db.query_row("SELECT count(*) FROM jobs WHERE account=? AND action='video_caption' AND json_extract(input,'$.capture_job')=?",params![account,id],|r|r.get(0)).map_err(|e|e.to_string())?;
        if count>=input["limit"].as_i64().unwrap_or(1).clamp(1,5){return Err("本批视频下载已达到数量上限".into());}
        Ok(json!({"account":account,"task_id":task,"screen_first":input["screen_first"]}))
    }
    pub fn record_video_source(&self,id:&str,client:&str,url:&str,at:i64)->Result<Value,String>{
        let context=self.video_capture_context(id,client,url,at)?;let (url,video_id)=crate::video::video_page(url)?;
        let source=json!({"id":video_id,"url":url,"text":"","author":""});
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let changed=tx.execute("UPDATE jobs SET input=json_set(input,'$.source',json(?)),updated_at=? WHERE id=? AND client=? AND action='capture_tiktok' AND state='running'",params![source.to_string(),at,id,client]).map_err(|e|e.to_string())?;
        if changed!=1{return Err("视频采集任务已结束".into());}
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'progress',?)",params![id,at,format!("已选中视频：{url}，开始读取下载资料（未调用模型）")]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(context)
    }
    pub fn skip_video_source(&self,id:&str,client:&str,url:&str,reason:&str,temporary:bool,at:i64)->Result<(),String>{
        self.video_capture_context(id,client,url,at)?;let (url,video_id)=crate::video::video_page(url)?;
        if reason.chars().count()>1000{return Err("过滤原因过长".into());}
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let raw:String=tx.query_row("SELECT input FROM jobs WHERE id=? AND client=? AND state='running' AND action='capture_tiktok'",params![id,client],|r|r.get(0)).map_err(|_|"视频采集任务已结束")?;
        let mut input:Value=serde_json::from_str(&raw).map_err(|_|"视频任务数据无效")?;
        if input.get("skipped_videos").is_none(){input["skipped_videos"]=json!([]);}
        let skipped=input["skipped_videos"].as_array_mut().ok_or("过滤记录无效")?;
        if skipped.len()>=50{return Err("本轮过滤数量达到上限".into());}
        if !skipped.iter().any(|v|v["id"]==video_id){skipped.push(json!({"id":video_id,"url":url,"reason":reason,"until":if temporary{at+3600_000}else{0}}));}
        tx.execute("UPDATE jobs SET input=?,updated_at=? WHERE id=? AND client=? AND state='running'",params![input.to_string(),at,id,client]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'progress',?)",params![id,at,format!("{}：{url} · {reason} · 未调用模型",if temporary{"暂时跳过1小时"}else{"已自动过滤"})]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(())
    }
    pub fn finish_video_capture(&self,id:&str,client:&str,error:Option<&str>,at:i64)->Result<Option<Value>,String>{
        if error.is_some_and(|e|e.chars().count()>2000){return Err("错误信息过长".into());}
        let limited=error.is_some_and(|e|e.contains("HTTP 429"));
        let message=error.map(|e|if limited{format!("{e}；TikTok 请求限流，已延后15分钟重试，本轮未调用模型")}else{e.to_owned()});let error=message.as_deref();
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let row:Option<(String,String,String)>=tx.query_row("SELECT account,json_extract(input,'$.task_id'),input FROM jobs WHERE id=? AND client=? AND state='running' AND action='capture_tiktok'",params![id,client],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
        let Some((account,task,raw))=row else{return Ok(None)};
        let count:i64=tx.query_row("SELECT count(*) FROM jobs WHERE account=? AND action='video_caption' AND json_extract(input,'$.capture_job')=?",params![account,id],|r|r.get(0)).map_err(|e|e.to_string())?;
        if limited{tx.execute("INSERT INTO settings(key,value) VALUES('tiktok_download_cooldown',?) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(settings.value AS INTEGER),CAST(excluded.value AS INTEGER)) AS TEXT)",[(at+15*60_000).to_string()]).map_err(|e|e.to_string())?;}
        let input:Value=serde_json::from_str(&raw).map_err(|_|"视频任务数据无效")?;
        let mut pending=tx.prepare("SELECT id FROM jobs WHERE account=? AND action='video_caption' AND state='queued' AND json_extract(input,'$.stage')='screening' AND json_extract(input,'$.capture_job')=? ORDER BY created_at,id LIMIT 6").map_err(|e|e.to_string())?;
        let downloads=pending.query_map(params![account,id],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;drop(pending);
        if downloads.len()>5{return Err("批量视频数量超过上限".into());}
        if !downloads.is_empty(){
            let screen=format!("screen-{id}");let payload=json!({"task_id":task,"capture_job":id,"download_ids":downloads,"stage":"rewrite"});
            tx.execute("INSERT OR IGNORE INTO jobs(id,account,action,state,input,created_at,updated_at) VALUES(?,?,'video_screening','queued',?,?,?)",params![screen,account,payload.to_string(),at,at]).map_err(|e|e.to_string())?;
            tx.execute("UPDATE jobs SET input=json_set(input,'$.screening_job',?) WHERE account=? AND action='video_caption' AND state='queued' AND json_extract(input,'$.stage')='screening' AND json_extract(input,'$.capture_job')=?",params![screen,account,id]).map_err(|e|e.to_string())?;
            tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'created',?)",params![screen,at,format!("{}条本地视频已排队批量审核，审核前不生成文案",downloads.len())]).map_err(|e|e.to_string())?;
        }
        let items=input["skipped_videos"].as_array();let filtered=items.map_or(0,|items|items.iter().filter(|v|v["until"]==0).count());let unavailable=items.map_or(0,|items|items.len()-filtered);
        let skipped=count==0&&error.is_none();let reason=if skipped&&filtered+unavailable>0{format!("已过滤 {filtered} 条 · 暂不可下载 {unavailable} 条 · 本轮未调用模型")}else if skipped{"当前来源没有未处理的新视频".into()}else{String::new()};
        let result=json!({"prepared":count,"filtered":filtered,"unavailable":unavailable,"sent":false,"skip_reason":reason});
        tx.execute("UPDATE jobs SET state=?,error=?,result=?,updated_at=?,input=json_set(input,'$.stage',?) WHERE id=?",params![if error.is_some(){"failed"}else{"completed"},error,result.to_string(),at,if skipped{"skipped"}else{"ready"},id]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE automation_tasks SET state=CASE WHEN enabled=0 THEN 'paused' WHEN ? THEN 'error' ELSE 'waiting' END,next_run=CASE WHEN ? THEN MAX(next_run,?) ELSE next_run END WHERE id=? AND account=?",params![error.is_some(),limited,at+15*60_000,task,account]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,?,?)",params![id,at,if error.is_some(){"failed"}else{"completed"},error.unwrap_or(if skipped{"当前来源没有未处理的新视频，本轮未调用模型"}else{"视频已下载，先批量审核，再为合格视频生成文案；未发布"})]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(Some(json!({"saved":true})))
    }
    pub fn enqueue_video_caption(&self, account:&str, video:&Value, retry:bool, at:i64)->Result<Value,String>{
        let account=handle(account)?;
        let id=video["download_id"].as_str().ok_or("下载标识缺失")?;
        uuid::Uuid::parse_str(id).map_err(|_|"下载标识无效")?;
        let mut input=json!({"download_id":id,"stage":if video["screen_first"]==true{"screening"}else{"rewrite"},"source":{"id":video["id"],"author":video["author"],"url":video["source"],"text":video["title"],"page_text":video["source_text"]},"language":"en"});
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
                let screening:bool=tx.query_row("SELECT json_extract(input,'$.stage')='screening' FROM jobs WHERE id=?",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
                if screening{return Err("请重试所属批量审核，不会跳过敏感内容审核".into());}
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

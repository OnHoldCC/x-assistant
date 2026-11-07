use super::*;
impl Store {
    // Local operator import: the original and edited files were visually reviewed before queuing.
    pub fn enqueue_reviewed_meme(&self,account:&str,id:&str,review:&Value,text:&str,at:i64)->Result<Value,String>{
        let account=handle(account)?;Uuid::parse_str(id).map_err(|_|"图片任务标识无效")?;
        let source=review["source_url"].as_str().ok_or("缺少图片原帖")?;
        let url=reqwest::Url::parse(source).map_err(|_|"图片原帖无效")?;
        if url.scheme()!="https"||url.host_str()!=Some("tieba.baidu.com")||!url.username().is_empty()||url.password().is_some()||url.port().is_some()||!url.path().strip_prefix("/p/").is_some_and(|id|!id.is_empty()&&id.bytes().all(|c|c.is_ascii_digit())){return Err("仅允许可追溯的贴吧原帖".into());}
        let pre=&review["pre_edit_review"];let post=&review["post_edit_review"];
        if pre["decision"]!="pass"||post["decision"]!="pass"||["political_content","political_figures_or_symbols","political_innuendo","private_information"].iter().any(|key|pre[*key]!=false)||post["political_content"]!=false||post["watermark_remaining"]!=false {return Err("图片未通过去水印前后风控，未发布".into());}
        for stage in [pre,post] {if !stage["reason"].as_str().is_some_and(|s|!s.trim().is_empty()&&s.chars().count()<=500){return Err("缺少看图审核理由".into());}}
        let checked=crate::video::validate_caption(&json!({"schema_version":1,"status":"ready","text":text,"reason":post["reason"]}))?;
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let existing:Option<String>=tx.query_row("SELECT id FROM jobs WHERE account=? AND json_extract(input,'$.image_policy')='reviewed_meme_v1' AND json_extract(input,'$.source.url')=? ORDER BY created_at LIMIT 1",params![account,source],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
        if let Some(id)=existing {return Ok(json!({"id":id,"duplicate":true}));}
        let connected:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_image_publish(s.extension_version))",params![account,at-60_000],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !connected {return Err("请连接支持图片发布的 X 助手".into());}
        let blocked:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||?)",[&account],|r|r.get(0)).map_err(|e|e.to_string())?;
        if blocked{return Err("账号操作已暂停，未发布".into());}
        let input=json!({"mode":"image","stage":"ready","publish_at":at,"image_kind":"meme","image_policy":"reviewed_meme_v1","image_ready":true,"text":text,"source":{"kind":"tieba_meme","url":source,"author":"tieba.baidu.com","text":review["source_title"]},"image_review":review,"manual_publication":true});
        tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input,result) VALUES(?,?,'rewrite_publish','queued',?,?,?,?)",params![id,account,at,at,input.to_string(),checked.to_string()]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'ready','已核对原图和去水印成图，无政治相关内容；单次图片发布已排队')",params![id,at]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(json!({"id":id,"duplicate":false}))
    }
    pub fn queue_funny_images(&self,_id:&str,_client:&str,_posts:&Value,_at:i64)->Result<Value,String>{
        Err("外部图片转载已停用，请使用AI原创生图计划".into())
    }
    pub fn finish_funny_image(&self,id:&str,outcome:Result<&Value,&str>,called:bool,at:i64)->Result<(),String>{
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let (account,raw):(String,String)=tx.query_row("SELECT account,input FROM jobs WHERE id=? AND action='rewrite_publish' AND state='rewriting' AND json_extract(input,'$.mode')='image'",[id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"搞笑图文任务已结束")?;
        let mut input:Value=serde_json::from_str(&raw).map_err(|_|"图文任务无效")?;
        input["model_not_called"]=json!(!called);
        match outcome {
            Err(error)=>{tx.execute("UPDATE jobs SET state='failed',error=?,input=?,updated_at=? WHERE id=?",params![error,input.to_string(),at,id]).map_err(|e|e.to_string())?;},
            Ok(value)=>{
                if input["source"]["kind"]!="ai_generated" {return Err("旧的转载图片任务已停用，未发布".into());}
                let mut checked=crate::funny_image::caption(value)?;let ready=checked["status"]=="ready";
                if ready {
                    if !["spot_difference","humor","optical_illusion"].iter().any(|kind|input["image_kind"]==*kind){return Err("旧的图标阵列已停用".into());}
                    if input["image_kind"]=="spot_difference" && checked["image_type"]!="puzzle" {return Err("漫画找不同未完成答案复核".into());}
                    if input["image_kind"]=="spot_difference" && !checked["text"].as_str().unwrap_or("").to_ascii_lowercase().contains("at least 10") {return Err("漫画找不同文案应邀请至少找10处，不能虚报总数".into());}
                }
                if !ready {checked["sent"]=json!(false);checked["skip_reason"]=checked["reason"].clone();}
                if ready {
                    let duplicate:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=? AND id<>? AND action='rewrite_publish' AND json_extract(input,'$.text')=? AND (state IN ('queued','running','completed') OR json_extract(input,'$.stage')='sending'))",params![account,id,checked["text"].as_str()],|r|r.get(0)).map_err(|e|e.to_string())?;
                    if duplicate{return Err("相同图文正文已存在，未重复安排发布".into());}
                    input["text"]=checked["text"].clone();input["image_ready"]=json!(true);input["image_policy"]=json!("cartoon_scene_v3");input["image_review"]=json!({"image_type":checked["image_type"],"reason":checked["reason"]});
                    let next:i64=tx.query_row("SELECT MAX(COALESCE((SELECT MAX(updated_at)+automation_interval_ms(t.value) FROM jobs WHERE account=t.account AND json_extract(input,'$.task_id')=t.id AND action='rewrite_publish' AND state='completed' AND json_extract(input,'$.stage')='sending'),0),COALESCE((SELECT MAX(json_extract(input,'$.publish_at'))+automation_interval_ms(t.value) FROM jobs WHERE account=t.account AND id<>? AND json_extract(input,'$.task_id')=t.id AND state IN ('queued','running') AND json_extract(input,'$.stage') IN ('ready','sending')),0),?) FROM automation_tasks t WHERE t.id=? AND t.account=?",params![id,at,input["task_id"].as_str(),account],|r|r.get(0)).map_err(|e|e.to_string())?;
                    input["publish_at"]=json!(next);
                }
                input["stage"]=json!(if ready{"ready"}else{"skipped"});
                tx.execute("UPDATE jobs SET state=?,error=NULL,input=?,result=?,updated_at=? WHERE id=?",params![if ready{"queued"}else{"completed"},input.to_string(),checked.to_string(),at,id]).map_err(|e|e.to_string())?;
                tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,?,?)",params![id,at,if ready{"ready"}else{"skipped"},checked["reason"].as_str().unwrap_or("图片审核记录")]).map_err(|e|e.to_string())?;
            }
        }
        tx.execute("UPDATE automation_tasks SET state=CASE WHEN EXISTS(SELECT 1 FROM jobs WHERE account=automation_tasks.account AND json_extract(input,'$.task_id')=automation_tasks.id AND state IN ('queued','rewriting','running')) THEN 'queued' ELSE ? END WHERE id=? AND account=? AND enabled=1",params![if outcome.is_err(){"error"}else{"waiting"},input["task_id"].as_str(),account]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(())
    }
    pub fn image_upload_context(&self,id:&str,client:&str,at:i64)->Result<(),String>{
        self.expire_automation(at)?;
        let db=self.lock()?;
        let allowed:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM jobs j JOIN clients c ON c.id=j.client AND c.account=j.account JOIN browser_sessions s ON s.client=c.id LEFT JOIN automation_tasks t ON t.id=json_extract(j.input,'$.task_id') AND t.account=j.account WHERE j.id=? AND j.client=? AND j.action='rewrite_publish' AND j.state='running' AND json_extract(j.input,'$.mode')='image' AND json_extract(j.input,'$.stage')='ready' AND json_extract(j.input,'$.image_ready')=1 AND ((json_extract(j.input,'$.image_policy')='cartoon_scene_v3' AND json_extract(j.input,'$.image_version')=3 AND json_extract(j.input,'$.image_kind') IN ('spot_difference','humor','optical_illusion') AND json_extract(j.input,'$.source.kind')='ai_generated' AND t.enabled=1 AND json_extract(t.value,'$.action')='auto_image') OR (json_extract(j.input,'$.image_policy')='reviewed_meme_v1' AND json_extract(j.input,'$.source.kind')='tieba_meme' AND json_extract(j.input,'$.manual_publication')=1 AND json_extract(j.input,'$.image_review.pre_edit_review.decision')='pass' AND json_extract(j.input,'$.image_review.pre_edit_review.political_content')=0 AND json_extract(j.input,'$.image_review.post_edit_review.decision')='pass' AND json_extract(j.input,'$.image_review.post_edit_review.political_content')=0 AND json_extract(j.input,'$.image_review.post_edit_review.watermark_remaining')=0) OR (json_extract(j.input,'$.image_policy')='auto_meme_v1' AND json_extract(j.input,'$.source.kind')='tieba_meme' AND json_extract(j.input,'$.image_kind')='tieba_meme' AND t.enabled=1 AND json_extract(t.value,'$.action')='auto_meme' AND meme_review_passes(json_extract(j.input,'$.image_review.pre'),0) AND meme_review_passes(json_extract(j.input,'$.image_review.post'),1))) AND json_extract(j.result,'$.status')='ready' AND json_extract(j.input,'$.text')=json_extract(j.result,'$.text') AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_image_publish(s.extension_version) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||j.account))",params![id,client,at-60_000],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !allowed{return Err("图文发布未通过审核、连接无效或计划已暂停".into());}
        db.execute("UPDATE jobs SET updated_at=? WHERE id=?",params![at,id]).map_err(|e|e.to_string())?;Ok(())
    }
    pub fn bind_image_media(&self,id:&str,client:&str,media:&str,at:i64)->Result<Value,String>{
        if media.is_empty()||media.len()>30||!media.bytes().all(|b|b.is_ascii_digit()){return Err("上传图片标识无效".into());}
        self.image_upload_context(id,client,at)?;
        let changed=self.lock()?.execute("UPDATE jobs SET input=json_set(input,'$.media_id',?) WHERE id=? AND client=? AND state='running' AND json_extract(input,'$.stage')='ready' AND (json_extract(input,'$.media_id') IS NULL OR json_extract(input,'$.media_id')=?)",params![media,id,client,media]).map_err(|e|e.to_string())?;
        if changed!=1{return Err("上传图片已改变，未发送".into());}Ok(json!({"saved":true}))
    }
}

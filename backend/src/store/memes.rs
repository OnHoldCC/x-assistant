use super::*;
impl Store {
    pub fn meme_job_active(&self,id:&str)->Result<bool,String>{
        self.lock()?.query_row("SELECT EXISTS(SELECT 1 FROM jobs j JOIN automation_tasks t ON t.id=json_extract(j.input,'$.task_id') AND t.account=j.account WHERE j.id=? AND j.state='rewriting' AND t.enabled=1 AND json_extract(t.value,'$.action')='auto_meme')",[id],|r|r.get(0)).map_err(|e|e.to_string())
    }
    pub fn meme_exclusions(&self,account:&str,at:i64)->Result<std::collections::HashSet<String>,String>{
        let db=self.lock()?;let account=handle(account)?;
        let mut excluded=std::collections::HashSet::new();
        let mut statement=db.prepare("SELECT json_extract(input,'$.source') FROM jobs WHERE account=? AND json_extract(input,'$.source.kind')='tieba_meme' AND (state IN ('queued','rewriting','running') OR state='completed' AND json_extract(input,'$.stage')='sending')").map_err(|e|e.to_string())?;
        for raw in statement.query_map([&account],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?{
            let source:Value=serde_json::from_str(&raw.map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
            let keys=crate::tieba_meme::candidate_keys(&source);
            if let Some(post)=source["url"].as_str().and_then(|url|url.strip_prefix("https://tieba.baidu.com/p/")){
                if keys.is_empty(){excluded.insert(format!("post:{post}"));}
                else if source["image_aliases"].as_array().is_none_or(Vec::is_empty){excluded.insert(format!("legacy_post:{post}"));}
            }
            excluded.extend(keys);
        }
        let mut statement=db.prepare("SELECT c.value,coalesce(json_extract(j.input,'$.meme_screen_version'),1) FROM jobs j,json_each(j.input,'$.meme_candidates') c WHERE j.account=? AND j.created_at>? AND (NOT meme_review_passes(json_extract(c.value,'$.review'),0) OR json_extract(c.value,'$.image_key')=json_extract(j.input,'$.source.image_key'))").map_err(|e|e.to_string())?;
        for row in statement.query_map(params![account,at-86400000],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?))).map_err(|e|e.to_string())?{
            let (raw,version)=row.map_err(|e|e.to_string())?;let candidate:Value=serde_json::from_str(&raw).map_err(|e|e.to_string())?;
            let review=&candidate["review"];
            if version<3&&review["decision"]!="pass"&&review["political"]==false&&review["privacy"]==false&&review["other_risk"]==false&&review["content_preserved"]==true{continue;}
            if let Some(key)=candidate["image_key"].as_str(){excluded.insert(format!("review:{key}"));}
        }Ok(excluded)
    }
    pub fn record_meme_batch(&self,id:&str,candidates:&[Value],at:i64)->Result<(),String>{
        if candidates.len()>4{return Err("每轮最多审核4张候选梗图".into());}
        let changed=self.lock()?.execute("UPDATE jobs SET input=json_set(input,'$.meme_candidates',json(?),'$.meme_screen_version',3),updated_at=? WHERE id=? AND state='rewriting' AND json_extract(input,'$.image_kind')='tieba_meme'",params![json!(candidates).to_string(),at,id]).map_err(|e|e.to_string())?;
        if changed!=1{return Err("梗图审核任务已结束".into());}Ok(())
    }
    pub fn select_meme_candidate(&self,id:&str,candidate:&Value,at:i64)->Result<(),String>{
        if candidate["kind"]!="tieba_meme"||candidate["forum"]!="孙笑川"||candidate["image_key"].as_str()!=Some(crate::tieba_meme::image_key(candidate["image_url"].as_str().ok_or("图片地址缺失")?)?.as_str()){return Err("梗图来源不匹配".into());}
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let raw:String=tx.query_row("SELECT input FROM jobs WHERE id=? AND state='rewriting' AND json_extract(input,'$.image_kind')='tieba_meme'",[id],|r|r.get(0)).map_err(|_|"梗图任务已结束")?;
        let mut input:Value=serde_json::from_str(&raw).map_err(|e|e.to_string())?;
        if !input["meme_candidates"].as_array().is_some_and(|items|items.contains(candidate))||!crate::tieba_meme::passes(&candidate["review"],false){return Err("梗图不属于已通过风控的候选".into());}
        input["source"]=candidate.clone();
        tx.execute("UPDATE jobs SET input=?,updated_at=? WHERE id=?",params![input.to_string(),at,id]).map_err(|e|e.to_string())?;
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'meme_screen',?)",params![id,at,format!("去水印前风控已通过：{}",candidate["review"]["reason"].as_str().unwrap_or(""))]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(())
    }
    pub fn finish_meme_image(&self,id:&str,outcome:Result<&Value,&str>,at:i64)->Result<(),String>{
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let (account,raw):(String,String)=tx.query_row("SELECT account,input FROM jobs WHERE id=? AND state='rewriting' AND json_extract(input,'$.image_kind')='tieba_meme'",[id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"梗图任务已结束")?;
        let mut input:Value=serde_json::from_str(&raw).map_err(|e|e.to_string())?;
        input["model_not_called"]=json!(input["telemetry"]["generations"].as_array().is_none_or(Vec::is_empty));
        let checked=outcome.map_err(str::to_owned).and_then(|value|{
            if value["status"]!="ready" {return Ok(json!({"status":"rejected","text":"","sent":false,"skip_reason":value["reason"].as_str().unwrap_or("本轮没有通过风控的梗图")}));}
            if input["source"]["kind"]!="tieba_meme"||!crate::tieba_meme::passes(&value["pre"],false)||!crate::tieba_meme::passes(&value["post"],true){return Err("梗图未通过前后风控及水印复核，未发布".into());}
            if input["source"]["text"].as_str().is_some_and(|text|!text.trim().is_empty())&&!value["post"]["translation"].as_str().is_some_and(|text|!text.trim().is_empty()) {return Err("原帖摘要缺少英文翻译，未发布".into());}
            let text=value["post"]["caption"].as_str().ok_or("缺少梗图配文")?;
            let body=text.chars().filter(|c|c.is_alphabetic()).collect::<Vec<_>>();
            if body.is_empty()||body.iter().filter(|c|c.is_ascii_alphabetic()).count()*100<body.len()*90{return Err("梗图配文必须为英文".into());}
            let checked=crate::video::validate_caption(&json!({"schema_version":1,"status":"ready","text":text,"reason":value["post"]["reason"]}))?;
            let keys=json!(crate::tieba_meme::candidate_keys(&input["source"]));
            let duplicate:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM jobs j WHERE account=?1 AND id<>?2 AND json_extract(input,'$.source.kind')='tieba_meme' AND (state IN ('queued','rewriting','running') OR state='completed' AND json_extract(input,'$.stage')='sending') AND ((json_extract(input,'$.source.image_key') IS NULL AND json_extract(input,'$.source.url')=?3) OR EXISTS(SELECT 1 FROM json_each(?4) k WHERE k.value=json_extract(j.input,'$.source.image_key') OR k.value IN (SELECT value FROM json_each(j.input,'$.source.image_aliases')))))",params![account,id,input["source"]["url"].as_str(),keys.to_string()],|r|r.get(0)).map_err(|e|e.to_string())?;
            if duplicate{return Err("该图片或其不同尺寸版本已有发布记录，未重复发布".into());}
            input["text"]=json!(text);input["image_ready"]=json!(true);input["image_policy"]=json!("auto_meme_v1");input["image_review"]=json!({"pre":value["pre"],"post":value["post"]});
            let next:i64=tx.query_row("SELECT MAX(?,coalesce((SELECT max(updated_at)+automation_interval_ms(t.value) FROM jobs WHERE account=t.account AND json_extract(input,'$.task_id')=t.id AND action='rewrite_publish' AND state='completed' AND json_extract(input,'$.stage')='sending'),0)) FROM automation_tasks t WHERE id=? AND account=?",params![at,input["task_id"].as_str(),account],|r|r.get(0)).map_err(|e|e.to_string())?;
            input["publish_at"]=json!(next);Ok(checked)
        });
        let ready=checked.as_ref().is_ok_and(|v|v["status"]=="ready");
        input["stage"]=json!(if ready{"ready"}else{"skipped"});
        let error=checked.as_ref().err().cloned();let result=checked.ok();
        tx.execute("UPDATE jobs SET state=?,input=?,result=?,error=?,updated_at=? WHERE id=?",params![if ready{"queued"}else if error.is_some(){"failed"}else{"completed"},input.to_string(),result.as_ref().map(Value::to_string),error,at,id]).map_err(|e|e.to_string())?;
        let message=if ready{"梗图去水印后复核通过，英文配文已排队发布".to_owned()}else{error.clone().unwrap_or_else(||result.as_ref().and_then(|v|v["skip_reason"].as_str()).unwrap_or("本轮跳过").to_string())};
        tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,?,?)",params![id,at,if ready{"ready"}else{"skipped"},message]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE automation_tasks SET state=? WHERE id=? AND account=? AND enabled=1",params![if ready{"queued"}else if error.is_some(){"error"}else{"waiting"},input["task_id"].as_str(),account]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(())
    }
}

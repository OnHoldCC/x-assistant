use super::*;
impl Store {
    pub fn retry_video_screening(&self,account:&str,id:&str,at:i64)->Result<Value,String>{
        let account=handle(account)?;let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let changed=tx.execute("UPDATE jobs SET state='queued',client=NULL,error=NULL,result=NULL,updated_at=? WHERE id=? AND account=? AND action='video_screening' AND state='failed' AND coalesce(json_extract(input,'$.hidden'),0)=0",params![at,id,account]).map_err(|e|e.to_string())?;
        if changed!=1{return Err("仅可重试当前账号失败的批量视频审核".into());}
        tx.execute("UPDATE jobs SET state='queued',error=NULL,result=NULL,updated_at=? WHERE account=? AND action='video_caption' AND state='failed' AND json_extract(input,'$.stage')='screening' AND json_extract(input,'$.screening_job')=?",params![at,account,id]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e|e.to_string())?;Ok(json!({"id":id,"queued":true}))
    }
    pub fn finish_video_screening(&self,id:&str,outcome:Result<&Value,&str>,called:bool,at:i64)->Result<(),String>{
        let mut db=self.lock()?;let tx=db.transaction().map_err(|e|e.to_string())?;
        let (account,raw):(String,String)=tx.query_row("SELECT account,input FROM jobs WHERE id=? AND action='video_screening' AND state='rewriting'",[id],|r|Ok((r.get(0)?,r.get(1)?))).map_err(|_|"批量审核任务已结束")?;
        let input:Value=serde_json::from_str(&raw).map_err(|_|"批量审核记录无效")?;
        let ids=input["download_ids"].as_array().ok_or("审核视频列表缺失")?.iter().map(|v|v.as_str().map(str::to_owned).ok_or("审核视频标识无效")).collect::<Result<Vec<_>,_>>()?;
        match outcome {
            Err(error)=>{
                tx.execute("UPDATE jobs SET state='failed',error=?,updated_at=?,input=json_set(input,'$.model_not_called',json(?)) WHERE id=?",params![error,at,if called{"false"}else{"true"},id]).map_err(|e|e.to_string())?;
                tx.execute("UPDATE jobs SET state='failed',error=?,updated_at=?,input=json_set(input,'$.model_not_called',json('true')) WHERE account=? AND action='video_caption' AND state='queued' AND json_extract(input,'$.stage')='screening' AND json_extract(input,'$.screening_job')=?",params![format!("批量审核失败，尚未生成文案：{error}"),at,account,id]).map_err(|e|e.to_string())?;
                tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'failed',?)",params![id,at,error]).map_err(|e|e.to_string())?;
            },
            Ok(value)=>{
                let checked=crate::video_screening::validate(&json!({"schema_version":value["schema_version"],"items":value["items"]}),&ids)?;
                for item in checked["items"].as_array().unwrap(){
                    let download=item["download_id"].as_str().unwrap();
                    let child_raw:String=tx.query_row("SELECT input FROM jobs WHERE id=? AND account=? AND action='video_caption' AND state='queued' AND json_extract(input,'$.stage')='screening' AND json_extract(input,'$.screening_job')=?",params![download,account,id],|r|r.get(0)).map_err(|_|"审核视频不属于当前批次或已结束")?;
                    let child:Value=serde_json::from_str(&child_raw).map_err(|_|"视频资料无效")?;
                    if item["status"]=="allowed"&&crate::video::exclusion_reason(child["source"]["text"].as_str().unwrap_or("")).is_some(){return Err("模型放行了明确排除的主题，未生成文案".into());}
                    if item["status"]=="allowed" {
                        tx.execute("UPDATE jobs SET input=json_set(input,'$.stage','rewrite','$.screening_passed',json('true')),updated_at=? WHERE id=?",params![at,download]).map_err(|e|e.to_string())?;
                    }else{
                        let status=if item["status"]=="excluded"{"rejected"}else{"needs_review"};
                        let result=crate::video::validate_caption(&json!({"schema_version":1,"status":status,"text":"","reason":item["reason"]}))?;
                        tx.execute("UPDATE jobs SET state='completed',result=?,updated_at=?,input=json_set(input,'$.stage','skipped','$.model_not_called',json('true')) WHERE id=?",params![result.to_string(),at,download]).map_err(|e|e.to_string())?;
                    }
                    tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'screening',?)",params![download,at,format!("批量审核{}：{}",if item["status"]=="allowed"{"通过，文案已排队"}else{"未通过，未生成文案"},item["reason"].as_str().unwrap_or(""))]).map_err(|e|e.to_string())?;
                }
                tx.execute("UPDATE jobs SET state='completed',result=?,updated_at=?,input=json_set(input,'$.stage',?,'$.model_not_called',json(?)) WHERE id=?",params![checked.to_string(),at,if checked["allowed"]==0{"skipped"}else{"ready"},if called{"false"}else{"true"},id]).map_err(|e|e.to_string())?;
                tx.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'completed',?)",params![id,at,format!("批量审核完成：通过{} · 排除{} · 待检查{}；只为通过的视频生成文案",checked["allowed"],checked["excluded"],checked["needs_review"])]).map_err(|e|e.to_string())?;
            }
        }
        tx.commit().map_err(|e|e.to_string())?;Ok(())
    }
}
impl Store {
    pub fn tiktok_available(&self,at:i64)->Result<(),String>{
        let until:Option<String>=self.lock()?.query_row("SELECT value FROM settings WHERE key='tiktok_download_cooldown'",[],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
        if let Some(until)=until.and_then(|s|s.parse::<i64>().ok()).filter(|n|*n>at){return Err(format!("视频下载接口仍在限流冷却中，约{}分钟后再试；未请求接口、未调用模型",(until-at+59_999)/60_000));}Ok(())
    }
    pub fn cool_down_tiktok(&self,at:i64)->Result<(),String>{
        self.lock()?.execute("INSERT INTO settings(key,value) VALUES('tiktok_download_cooldown',?) ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(settings.value AS INTEGER),CAST(excluded.value AS INTEGER)) AS TEXT)",[(at+15*60_000).to_string()]).map_err(|e|e.to_string())?;Ok(())
    }
}

use super::*;

impl Store {
    pub fn enqueue_video_caption(&self, account:&str, video:&Value, retry:bool, at:i64)->Result<Value,String>{
        let account=handle(account)?;
        let id=video["download_id"].as_str().ok_or("下载标识缺失")?;
        uuid::Uuid::parse_str(id).map_err(|_|"下载标识无效")?;
        let input=json!({"download_id":id,"stage":"rewrite","source":{"id":video["id"],"author":video["author"],"url":video["source"],"text":video["title"]},"language":"en"});
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

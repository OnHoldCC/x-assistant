use super::*;

const NEWS_JOB: &str = "LEFT JOIN jobs j ON j.id=coalesce(c.job_id,(SELECT old.id FROM jobs old WHERE c.reason='该新闻已有发文任务' AND old.account=c.account AND json_extract(old.input,'$.mode')='news' AND (json_extract(old.input,'$.source.url')=json_extract(c.value,'$.url') OR json_extract(old.input,'$.source.title')=json_extract(c.value,'$.title')) ORDER BY (old.state='completed') DESC,old.created_at DESC LIMIT 1))";
const NEWS_STATE: &str = "CASE WHEN c.job_id IS NULL AND coalesce(j.state,'')<>'completed' THEN c.state ELSE coalesce(j.state,c.state) END";


impl Store {
    // A candidate is consumed by exactly one job; its receipt remains the source of truth.
    pub fn news_batch_feed(&self, id: &str, fetched: Option<&Value>, at: i64) -> Result<Option<Value>, String> {
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let (account, input): (String, String) = tx.query_row("SELECT account,input FROM jobs WHERE id=? AND state='rewriting' AND json_extract(input,'$.mode')='news'", [id], |r| Ok((r.get(0)?, r.get(1)?))).map_err(|_| "取材任务已结束")?;
        let input: Value = serde_json::from_str(&input).map_err(|e| e.to_string())?;
        let key = json!([input["task_id"],input["news_source"],input["query"]]).to_string();
        let bound:Option<String>=tx.query_row("SELECT batch_id FROM news_candidates WHERE account=? AND job_id=?",params![account,id],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
        let mut batch: Option<String> = if bound.is_some() { bound } else { tx.query_row("SELECT id FROM news_batches WHERE account=? AND config_key=? ORDER BY at DESC,rowid DESC LIMIT 1", params![account,key], |r| r.get(0)).optional().map_err(|e| e.to_string())? };
        if let Some(batch_id) = &batch {
            tx.execute("UPDATE news_candidates SET state='skipped',reason='热点已超过48小时' WHERE batch_id=? AND job_id IS NULL AND state='pending' AND coalesce(json_extract(value,'$.published_at'),(SELECT at FROM news_batches WHERE id=?))<?",params![batch_id,batch_id,at-48*3600000]).map_err(|e|e.to_string())?;
            let available: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM news_candidates c LEFT JOIN jobs j ON j.id=c.job_id WHERE c.batch_id=? AND (c.job_id=? OR (c.job_id IS NULL AND c.state='pending') OR j.state IN ('queued','rewriting','running')))",params![batch_id,id],|r|r.get(0)).map_err(|e|e.to_string())?;
            if !available { batch = None; }
        }
        if batch.is_none() {
            let Some(feed) = fetched else { return Ok(None); };
            let items = feed["items"].as_array().filter(|items|items.len()<=400).ok_or("热点批次无效")?;
            let batch_id = Uuid::new_v4().to_string();
            let mut metadata = feed.clone(); metadata.as_object_mut().ok_or("热点批次无效")?.remove("items");
            tx.execute("INSERT INTO news_batches VALUES(?,?,?,?,?)",params![batch_id,account,key,at,metadata.to_string()]).map_err(|e|e.to_string())?;
            for item in items {
                let title=item["title"].as_str().filter(|s|!s.trim().is_empty()&&s.chars().count()<=300).ok_or("热点标题无效")?;
                let url=item["url"].as_str().ok_or("热点链接无效")?;
                let parsed=reqwest::Url::parse(url).map_err(|_|"热点链接无效")?;
                if parsed.scheme()!="https" || !parsed.username().is_empty() || parsed.password().is_some() {return Err("热点链接无效".into());}
                let dedupe=if item["kind"]=="article" {url.to_owned()} else {title.trim().to_lowercase()};
                tx.execute("INSERT OR IGNORE INTO news_candidates(id,batch_id,account,dedupe_key,value) VALUES(?,?,?,?,?)",params![Uuid::new_v4().to_string(),batch_id,account,dedupe,item.to_string()]).map_err(|e|e.to_string())?;
            }
            tx.execute("UPDATE news_candidates SET state='skipped',reason='该新闻已有发文任务' WHERE batch_id=? AND EXISTS(SELECT 1 FROM jobs j WHERE j.account=news_candidates.account AND json_extract(j.input,'$.mode')='news' AND (json_extract(j.input,'$.source.url')=json_extract(news_candidates.value,'$.url') OR json_extract(j.input,'$.source.title')=json_extract(news_candidates.value,'$.title')))",[&batch_id]).map_err(|e|e.to_string())?;
            batch=Some(batch_id);
        }
        let batch=batch.unwrap();
        let active_other:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM news_candidates c JOIN jobs j ON j.id=c.job_id WHERE c.batch_id=? AND c.job_id<>? AND j.state IN ('queued','rewriting','running'))",params![batch,id],|r|r.get(0)).map_err(|e|e.to_string())?;
        if active_other {return Err("本批已有一条热点正在处理".into());}
        let selected:Option<(String,String)>=tx.query_row("SELECT id,value FROM news_candidates WHERE batch_id=? AND (job_id=? OR (job_id IS NULL AND state='pending')) ORDER BY (job_id IS NOT NULL) DESC,rowid LIMIT 1",params![batch,id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
        let metadata:String=tx.query_row("SELECT metadata FROM news_batches WHERE id=?",[&batch],|r|r.get(0)).map_err(|e|e.to_string())?;
        let mut feed:Value=serde_json::from_str(&metadata).map_err(|e|e.to_string())?;
        feed["batch_id"]=json!(batch); feed["items"]=json!([]);feed["single_candidate"]=json!(true);
        if let Some((candidate,value))=selected {
            tx.execute("UPDATE news_candidates SET job_id=? WHERE id=?",params![id,candidate]).map_err(|e|e.to_string())?;
            tx.execute("UPDATE jobs SET input=json_set(input,'$.news_candidate_id',?) WHERE id=?",params![candidate,id]).map_err(|e|e.to_string())?;
            feed["items"]=json!([serde_json::from_str::<Value>(&value).map_err(|e|e.to_string())?]);
        }
        let remaining:i64=tx.query_row("SELECT count(*) FROM news_candidates WHERE batch_id=? AND job_id IS NULL AND state='pending'",[&batch],|r|r.get(0)).map_err(|e|e.to_string())?;
        feed["remaining"]=json!(remaining);
        tx.commit().map_err(|e|e.to_string())?;
        Ok(Some(feed))
    }

    pub fn news_queue(&self, account: &str, input: &Value) -> Result<Value,String> {
        let account=handle(account)?;
        let channel=match input.get("channel") {None=>"all",Some(value)=>value.as_str().filter(|v|["all","weibo","rednote","bbc","guardian"].contains(v)).ok_or("热点渠道无效")?};
        let state=match input.get("state") {None=>"all",Some(value)=>value.as_str().filter(|v|["all","pending","processing","published","skipped","failed","uncertain"].contains(v)).ok_or("热点执行状态无效")?};
        let requested=input["offset"].as_u64().unwrap_or(0).min(1_000_000) as i64;
        let db=self.lock()?;
        let query=format!("WITH items AS (SELECT c.id,c.batch_id,b.at,c.value,{NEWS_STATE} AS raw_state,coalesce(json_extract(j.input,'$.stage'),'') AS stage,j.result,coalesce(c.reason,j.error,json_extract(j.result,'$.skip_reason')) AS reason,j.id AS job_id,json_extract(c.value,'$.platform') AS channel,coalesce(json_extract(c.value,'$.published_at'),b.at) AS sort_at FROM news_candidates c JOIN news_batches b ON b.id=c.batch_id {NEWS_JOB} WHERE c.account=?), classified AS (SELECT *,CASE WHEN raw_state='completed' AND stage='skipped' THEN 'skipped' WHEN raw_state='completed' AND coalesce(json_extract(result,'$.url'),'')<>'' THEN 'published' WHEN raw_state IN ('failed','skipped') AND stage='sending' THEN 'uncertain' WHEN raw_state IN ('pending','skipped','failed') THEN raw_state ELSE 'processing' END AS state FROM items) ");
        let filter="WHERE (?='all' OR channel=?) AND (?='all' OR state=?)";
        let total:i64=db.query_row(&format!("{query} SELECT count(*) FROM classified {filter}"),params![account,channel,channel,state,state],|r|r.get(0)).map_err(|e|e.to_string())?;
        let offset=requested.min(((total-1).max(0)/20)*20);
        let mut statement=db.prepare(&format!("{query} SELECT id,batch_id,at,value,state,stage,result,reason,job_id FROM classified {filter} ORDER BY sort_at DESC,at DESC,batch_id DESC,id LIMIT 20 OFFSET ?")).map_err(|e|e.to_string())?;
        let items=statement.query_map(params![account,channel,channel,state,state,offset],|r|{
            let value:Value=serde_json::from_str(&r.get::<_,String>(3)?).unwrap_or(Value::Null);
            let result:Value=r.get::<_,Option<String>>(6)?.and_then(|s|serde_json::from_str(&s).ok()).unwrap_or(Value::Null);
            let stage=r.get::<_,String>(5)?;let state=r.get::<_,String>(4)?;
            let posted=if state=="published" {json!(true)} else if stage=="sending" {Value::Null} else {json!(false)};
            Ok(json!({"id":r.get::<_,String>(0)?,"batch_id":r.get::<_,String>(1)?,"retrieved_at":r.get::<_,i64>(2)?,"item":value,"state":state,"posted_to_x":posted,"reason":r.get::<_,Option<String>>(7)?,"job_id":r.get::<_,Option<String>>(8)?,"published_url":result["url"]}))
        }).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        let latest:Option<(String,i64)>=db.query_row("SELECT id,at FROM news_batches WHERE account=? ORDER BY at DESC,rowid DESC LIMIT 1",[&account],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
        let mut batch=Value::Null;
        if let Some((id,at))=latest {
            let mut statement=db.prepare(&format!("{query} SELECT state,count(*) FROM classified WHERE batch_id=? GROUP BY state")).map_err(|e|e.to_string())?;
            let rows=statement.query_map(params![account,id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?))).map_err(|e|e.to_string())?;
            let mut counts=serde_json::Map::new();let mut count=0;
            for row in rows {let (key,n)=row.map_err(|e|e.to_string())?;counts.insert(key,json!(n));count+=n;}
            batch=json!({"id":id,"at":at,"total":count,"counts":counts});
        }
        Ok(json!({"account":account,"items":items,"total":total,"offset":offset,"channel":channel,"state":state,"batch":batch}))
    }
}

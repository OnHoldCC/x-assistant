use super::*;

fn validate_news(value:&Value,at:i64,news_source:Option<&str>,include_source_link:bool)->Result<Value,String>{
    let root=value.as_object().ok_or("新闻格式无效")?;
    if (root.len()!=3 && !(root.len()==4 && value["skip_reason"]=="")) || value["schema_version"]!=1 || value["news"].is_null(){return Err("未找到可核实的新新闻，未发布".into());}
    let news=value["news"].as_object().filter(|news|news.len()==4).ok_or("新闻来源格式无效")?;
    let field=|key:&str,max:usize|->Result<&str,String>{news.get(key).and_then(Value::as_str).filter(|text|!text.trim().is_empty()&&text.chars().count()<=max&&!text.chars().any(|c|c.is_control()&&c!='\n')).ok_or_else(||format!("新闻{key}无效"))};
    let title=field("title",300)?.trim();let summary=field("summary",3000)?;
    let url=field("url",2048)?;
    let mut parsed=reqwest::Url::parse(url).map_err(|_|"新闻来源链接无效")?;
    let host=parsed.host_str().ok_or("缺少新闻来源域名")?.to_owned();
    if parsed.scheme()!="https" || !parsed.username().is_empty() || parsed.password().is_some() || parsed.port().is_some() || !host.contains('.') || host.parse::<std::net::IpAddr>().is_ok() || ["x.com","twitter.com"].contains(&host.as_str()) {return Err("新闻需来自可追溯的公开HTTPS报道".into());}
    match news_source.unwrap_or("web") {
        "web" | "hot_topics" | "international" | "mixed" => (),
        "rednote" if ["www.xiaohongshu.com","xiaohongshu.com"].contains(&host.as_str()) => (),
        "rednote" => return Err("此计划仅允许小红书原帖来源，未发布".into()),
        "weibo" if ["weibo.com","www.weibo.com","weibo.cn","www.weibo.cn","m.weibo.cn"].contains(&host.as_str()) => (),
        "weibo" => return Err("此计划仅允许微博来源，未发布".into()),
        _ => return Err("新闻来源无效，未发布".into()),
    }
    if host=="s.weibo.com" || host=="60s.viki.moe" || parsed.path().starts_with("/search_result") { return Err("热榜或搜索页不是原始报道，未发布".into()); }
    parsed.set_fragment(None);
    let published=chrono::DateTime::parse_from_rfc3339(field("published_at",50)?).map_err(|_|"新闻发布时间无效")?.timestamp_millis();
    if published>at || published<at-48*3600000 {return Err("新闻不在最近48小时内，未发布".into());}
    let text=value["text"].as_str().filter(|text|!text.trim().is_empty()&&text.chars().count()<=280&&!text.chars().any(|c|c.is_control()&&c!='\n'&&c!='\t')).ok_or("新闻短帖正文无效")?;
    if include_source_link && !text.contains(url) {return Err("新闻短帖缺少来源链接，未发布".into());}
    if !include_source_link && (text.contains("https://") || text.contains("http://")) {return Err("计划要求正文不带链接，未发布".into());}
    let facts=protected_facts(&format!("{title}\n{summary}\n{url}"));
    if protected_facts(text).iter().any(|fact|!facts.contains(fact)){return Err("新闻正文新增了来源摘要没有的数字、链接或提及，未发布".into());}
    Ok(json!({"id":parsed.as_str(),"url":parsed.as_str(),"author":host,"title":title,"text":summary,"published_at":published}))
}

#[cfg(test)]
mod news_tests {
    use super::*;
    #[test]
    fn weibo_source_rejects_other_sites_and_lookalike_domains(){
        let at=now();
        for (host,allowed) in [("weibo.com",true),("m.weibo.cn",true),("www.weibo.com",true),("weibo.com.evil.example",false),("evilweibo.com",false),("news.example",false)] {
            let url=format!("https://{host}/detail/123");
            let value=json!({"schema_version":1,"news":{"title":"微博热点","url":url,"published_at":chrono::DateTime::from_timestamp_millis(at-1000).unwrap().to_rfc3339(),"summary":"原帖正在讨论该事件。"},"text":format!("原帖正在讨论该事件。{url}")});
            assert_eq!(validate_news(&value,at,Some("weibo"),true).is_ok(),allowed,"{host}");
            assert!(validate_news(&value,at,Some("unknown"),true).is_err());
        }
    }
    #[test]
    fn rejects_stale_future_missing_source_and_invented_numbers(){
        let at=now();
        let value=json!({"schema_version":1,"news":{"title":"发布公告","url":"https://news.example/story","published_at":chrono::DateTime::from_timestamp_millis(at-1000).unwrap().to_rfc3339(),"summary":"官方发布工具。"},"text":"官方发布工具。https://news.example/story"});
        assert!(validate_news(&value,at,None,true).is_ok());
        for date in [at+1000,at-49*3600000]{let mut bad=value.clone();bad["news"]["published_at"]=json!(chrono::DateTime::from_timestamp_millis(date).unwrap().to_rfc3339());assert!(validate_news(&bad,at,None,true).is_err());}
        let mut bad=value.clone();bad["text"]=json!("发布了99个工具 https://news.example/story");assert!(validate_news(&bad,at,None,true).is_err());
        bad["text"]=json!("官方发布工具。");assert!(validate_news(&bad,at,None,true).is_err());
        bad["news"]=Value::Null;assert!(validate_news(&bad,at,None,true).is_err());
        let mut repeated=value.clone();repeated["news"]["summary"]=json!("发布2个工具。");repeated["text"]=json!("发布2个工具，这2个工具已上线。https://news.example/story");assert!(validate_news(&repeated,at,None,true).is_ok());
    }
}

pub fn validate_rewrite(source: &str, text: &str) -> Result<(), String> {
    if text.trim().is_empty()
        || text.chars().count() > 24000
        || text
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err("改写正文无效，未提交发布".into());
    }
    if protected_facts(source) != protected_facts(text) {
        return Err("改写改变了数字、链接、账号或话题，未提交发布".into());
    }
    Ok(())
}

fn protected_facts(text: &str) -> Vec<String> {
    let mut facts = Vec::new();
    let mut rest = text;
    while !rest.is_empty() {
        let first = rest.chars().next().unwrap();
        let url = rest.starts_with("https://") || rest.starts_with("http://");
        let length = if url {
            rest.find(|c: char| c.is_whitespace() || "<>\"，。！？）】".contains(c))
                .unwrap_or(rest.len())
        } else if first == '@' || first == '#' {
            first.len_utf8()
                + rest[first.len_utf8()..]
                    .find(|c: char| !c.is_alphanumeric() && c != '_')
                    .unwrap_or(rest.len() - first.len_utf8())
        } else if first.is_ascii_digit() {
            rest.find(|c: char| !c.is_ascii_digit() && !".,%".contains(c))
                .unwrap_or(rest.len())
        } else {
            0
        };
        if length > 0 {
            facts.push(rest[..length].trim_end_matches([',', '.']).to_owned());
            rest = &rest[length..];
        } else {
            rest = &rest[first.len_utf8()..];
        }
    }
    facts.sort();
    facts
}

fn reply_facts(text: &str) -> Vec<String> {
    protected_facts(text).into_iter().map(|fact| {
        let end = fact.find(['.', '%']).unwrap_or(fact.len());
        let groups = fact[..end].split(',').collect::<Vec<_>>();
        if groups.len() > 1 && (1..=3).contains(&groups[0].len())
            && groups.iter().all(|group| group.bytes().all(|b| b.is_ascii_digit()))
            && groups[1..].iter().all(|group| group.len() == 3)
        {
            format!("{}{}", groups.concat(), &fact[end..])
        } else {
            fact
        }
    }).collect()
}

impl Store {
    pub fn record_news_feed(&self,id:&str,feed:&Value,at:i64)->Result<(),String>{
        let db=self.lock()?;
        let changed=db.execute("UPDATE jobs SET input=json_set(input,'$.news_feed',json(?)),updated_at=? WHERE id=? AND action='rewrite_publish' AND state='rewriting' AND json_extract(input,'$.mode')='news'",params![feed.to_string(),at,id]).map_err(|e|e.to_string())?;
        if changed!=1 {return Err("取材任务已结束".into());}
        let count=feed["items"].as_array().map_or(0,Vec::len);
        let mut message=if feed["latest_pool"]==true { format!("最新取材 · {count} 条候选 · {} · 快照距今 {} 秒 · 来源计数 {}",if count==0 {"没有可生成候选，本轮不调用模型"} else if feed["grounded_rss"]==true {"媒体RSS摘要直接生成，不重复联网检索"} else {"AI随机选一条并联网核实"},(at-feed["retrieved_at"].as_i64().unwrap_or(at))/1000,feed["counts"]) } else if feed["single_candidate"]==true { format!("批次取材 · 本次处理 {count} 条 · 本批剩余 {} 条 · 来源计数 {}",feed["remaining"],feed["counts"]) } else { format!("取材完成 · {count} 条候选 · 60s 热榜 / 新闻 RSS · 来源计数 {}",feed["counts"]) };
        if let Some(reason)=feed["skip_reason"].as_str(){message.push_str(&format!(" · {reason}"));}
        if feed["errors"].as_array().is_some_and(|items|!items.is_empty()){message.push_str(&format!(" · 部分来源失败：{}",feed["errors"]));}
        db.execute("INSERT INTO job_log(job_id,at,stage,message) VALUES(?,?,'sources',?)",params![id,at,message]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn news_prompt(&self,account:&str,query:&str,at:i64)->Result<Value,String>{
        let db=self.lock()?;
        let mut statement=db.prepare("SELECT json_extract(input,'$.source.url'),json_extract(input,'$.source.title') FROM jobs WHERE account=? AND json_extract(input,'$.mode')='news' AND json_extract(input,'$.source.url') IS NOT NULL ORDER BY created_at DESC LIMIT 20").map_err(|e|e.to_string())?;
        let rows=statement.query_map([handle(account)?],|row|Ok(json!({"url":row.get::<_,String>(0)?,"title":row.get::<_,String>(1)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(json!({"query":query,"current_time":chrono::DateTime::from_timestamp_millis(at).ok_or("时间无效")?.to_rfc3339(),"excluded_urls":rows}))
    }
    pub fn enqueue_rewrite(&self, account: &str, source: &Value, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        let mode = match source.get("mode") {
            None => "rewrite",
            Some(value) => value
                .as_str()
                .filter(|mode| ["rewrite", "similar", "replicate"].contains(mode))
                .ok_or("文章生成方式无效")?,
        };
        let author = handle(source["author"].as_str().ok_or("缺少原帖作者")?)?;
        let id = source["id"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 30 && s.bytes().all(|b| b.is_ascii_digit()))
            .ok_or("原帖标识无效")?;
        let url = format!("https://x.com/{author}/status/{id}");
        if source["url"].as_str() != Some(url.as_str()) {
            return Err("原帖来源不匹配".into());
        }
        let text = source["text"]
            .as_str()
            .filter(|s| !s.trim().is_empty() && s.chars().count() <= 24000)
            .ok_or("改写支持1–24000字符原文")?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let existing: Option<String> = tx.query_row("SELECT id FROM jobs WHERE account=? AND action='rewrite_publish' AND json_extract(input,'$.source.url')=? AND coalesce(json_extract(input,'$.mode'),'rewrite')=? AND (coalesce(json_extract(input,'$.hidden'),0)=0 OR state='completed' OR json_extract(input,'$.stage')='sending') ORDER BY created_at DESC LIMIT 1",params![account,url,mode],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
        if let Some(id) = existing {
            tx.execute(
                "UPDATE jobs SET input=json_remove(input,'$.hidden') WHERE id=?",
                [&id],
            )
            .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            return Ok(json!({"id":id,"duplicate":true}));
        }
        let connected = tx.query_row("SELECT EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.account=? AND c.last_seen>? AND s.connected=1 AND s.state='logged_in' AND s.automation_supported=1 AND extension_compatible(s.extension_version))",params![account,at-60_000],|r|r.get::<_,bool>(0)).map_err(|e|e.to_string())?;
        if !connected {
            return Err("请连接新版 X 助手后再一键改写".into());
        }
        let id = Uuid::new_v4().to_string();
        let discovered = source["discovered_from"]
            .as_str()
            .filter(|name| ["for_you", "trending", "post_detail"].contains(name))
            .unwrap_or("post_detail");
        let input = json!({"discovered_from":discovered,"mode":mode,"stage":"rewrite","publish_at":if mode=="replicate"{Some(at)}else{None},"source":{"author":author,"id":source["id"],"url":url,"text":text.trim()}});
        tx.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,?,'rewrite_publish','queued',?,?,?)",params![id,account,at,at,input.to_string()]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"id":id,"duplicate":false}))
    }
    pub fn claim_rewrite(&self, at: i64) -> Result<Value, String> {
        self.expire_automation(at)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE jobs SET state='failed',error='Codex 改写中断，请在任务队列重试',updated_at=? WHERE action='rewrite_publish' AND state='rewriting' AND updated_at<?",params![at,at-180_000]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE jobs SET state='failed',error=CASE WHEN json_extract(input,'$.stage')='sending' THEN '发布中断，请到 X 核对结果；不会自动重发' ELSE '浏览器连接中断，未发送，可重试任务' END,updated_at=? WHERE action='rewrite_publish' AND state='running' AND updated_at<?",params![at,at-120_000]).map_err(|e|e.to_string())?;
        let row: Option<(String,String,String)> = tx.query_row("SELECT id,account,input FROM jobs WHERE action='rewrite_publish' AND state='queued' AND json_extract(input,'$.stage')='rewrite' AND (json_extract(input,'$.task_id') IS NULL OR EXISTS(SELECT 1 FROM automation_tasks t WHERE t.id=json_extract(jobs.input,'$.task_id') AND t.account=jobs.account AND t.enabled=1)) ORDER BY created_at LIMIT 1",[],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(|e|e.to_string())?;
        if let Some((id, account, input)) = row {
            tx.execute(
                "UPDATE jobs SET state='rewriting',client='codex_cli',updated_at=? WHERE id=?",
                params![at, id],
            )
            .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(
                json!({"id":id,"account":account,"input":serde_json::from_str::<Value>(&input).map_err(|e|e.to_string())?}),
            )
        } else {
            tx.commit().map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
    }
    pub fn record_generation(
        &self,
        id: &str,
        started: i64,
        finished: i64,
        duration_ms: u64,
        usage: Option<&Value>,
    ) -> Result<(), String> {
        let db = self.lock()?;
        let raw:String=db.query_row("SELECT input FROM jobs WHERE id=? AND action='rewrite_publish' AND state='rewriting'",[id],|r|r.get(0)).map_err(|_|"生成任务已结束")?;
        let mut input: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let normalized = usage.and_then(crate::models::normalize_usage);
        if !input["telemetry"].is_object() {
            input["telemetry"] = json!({"generations":[]});
        }
        if !input["telemetry"]["generations"].is_array() {
            input["telemetry"]["generations"] = json!([]);
        }
        input["telemetry"]["generations"].as_array_mut().unwrap().push(json!({"started_at":started,"finished_at":finished,"duration_ms":duration_ms,"usage":normalized}));
        db.execute(
            "UPDATE jobs SET input=? WHERE id=?",
            params![input.to_string(), id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn save_rewrite(
        &self,
        id: &str,
        result: Result<&str, &str>,
        at: i64,
    ) -> Result<(), String> {
        let value = result.map(|text| json!({"text":text}));
        self.save_generated(id, value.as_ref().map_err(|error| *error), at)
    }
    pub fn save_generated(
        &self,
        id: &str,
        result: Result<&Value, &str>,
        at: i64,
    ) -> Result<(), String> {
        let mut connection = self.lock()?;
        let db = connection.transaction().map_err(|e|e.to_string())?;
        let raw: String = db.query_row("SELECT input FROM jobs WHERE id=? AND action='rewrite_publish' AND state='rewriting'",[id],|r|r.get(0)).map_err(|_|"改写任务已结束")?;
        let mut input: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        if input["mode"] == "news" && result.is_ok_and(|value| value["schema_version"]==1 && value["news"].is_null() && value["text"]=="" && value.as_object().is_some_and(|root|
            root.contains_key("news") && (root.len()==3 || root.len()==4 && root.contains_key("skip_reason")) && root.get("skip_reason").is_none_or(|reason|reason.as_str().is_some_and(|text|text.chars().count()<=300 && !text.chars().any(char::is_control)))
        )) {
            input["stage"] = json!("skipped");
            if input["news_feed"]["latest_pool"]==true && input["news_feed"]["items"].as_array().is_some_and(Vec::is_empty)
                || input["news_source"]=="web" && input["allow_news_search"]!=true {
                input["model_not_called"]=json!(true);
            }
            let explanation=result.ok().and_then(|value|value["skip_reason"].as_str()).map(str::trim).filter(|text|!text.is_empty());
            let reason=explanation.unwrap_or_else(|| if input["news_feed"]["latest_pool"]==true {
                if input["news_feed"]["items"].as_array().is_some_and(Vec::is_empty) { "本轮没有新增或可重试的候选，未调用模型" } else { "本轮最新候选未通过选题或核实，未发布" }
            } else if input["news_feed"]["single_candidate"]==true && input["news_feed"]["items"].as_array().is_some_and(Vec::is_empty) { "本批没有未处理的新热点，等待下次取材" } else { "未找到可核实的新新闻，本轮未发布" });
            if let Ok(value)=result {input["skipped_generation"]=value.clone();}
            if let Some(items)=input["news_feed"]["items"].as_array() {
                for item in items {
                    if let Some(candidate)=item["candidate_id"].as_str() {
                        db.execute("UPDATE news_candidates SET state='skipped',reason='AI未选中，暂缓重复核实',value=json_set(value,'$._reviewed_at',?,'$._reviewed_for',?) WHERE id=? AND batch_id=? AND job_id IS NULL AND state='pending'",params![at,json!([input["task_id"],input["news_source"],input["query"]]).to_string(),candidate,input["news_feed"]["batch_id"].as_str()]).map_err(|e|e.to_string())?;
                    }
                }
            }
            let skipped = json!({"sent":false,"skip_reason":reason});
            db.execute("UPDATE jobs SET state='completed',client=NULL,input=?,result=?,error=NULL,updated_at=? WHERE id=?",params![input.to_string(),skipped.to_string(),at,id]).map_err(|e|e.to_string())?;
            db.commit().map_err(|e|e.to_string())?;
            return Ok(());
        }
        let outcome = result.map_err(String::from).and_then(|value| {
            let text=value["text"].as_str().ok_or("模型正文缺失")?;
            if input["language"] == "en" && !text.trim().is_empty() {
                let body = text.split_whitespace().filter(|word| !word.starts_with("https://") && !word.starts_with("http://")).collect::<Vec<_>>().join(" ");
                let letters = body.chars().filter(|c| c.is_alphabetic()).count();
                let latin = body.chars().filter(|c| c.is_ascii_alphabetic()).count();
                if letters == 0 || latin * 100 < letters * 90 { return Err("计划要求英文正文，模型输出语言不符，未发送".into()); }
            }
            if input["mode"]=="news" {
                let source=validate_news(value,at,input.get("news_source").and_then(Value::as_str),input["include_source_link"].as_bool().unwrap_or(true))?;
                if input["news_feed"]["latest_pool"]==true {
                    let candidate=input["news_feed"]["items"].as_array().and_then(|items| items.iter().find(|item|
                        item["title"]==source["title"] && (item["kind"]=="topic" || item["kind"]=="article" && item["url"]==source["url"])
                    )).ok_or("AI选题不属于本轮最新候选，未发布")?;
                    if input["news_feed"]["grounded_rss"]==true && source["text"]!=candidate["summary"] { return Err("模型改变了原始RSS摘要，未发布".into()); }
                    input["news_candidate_id"]=json!(candidate["candidate_id"].as_str().ok_or("选题记录缺失")?);
                }
                if input["news_feed"]["single_candidate"]==true {
                    let candidate=&input["news_feed"]["items"][0];
                    if candidate["kind"]=="article" && candidate["url"]!=source["url"] {return Err("模型更换了当前新闻来源，未发布".into());}
                }
                if let Some(item)=input["news_feed"]["items"].as_array().and_then(|items|items.iter().find(|item|item["kind"]=="article"&&item["url"]==source["url"])) {
                    if item["published_at"]!=source["published_at"] {return Err("模型改变了原始 RSS 发布时间，未发布".into());}
                }
                let duplicate:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=(SELECT account FROM jobs WHERE id=?) AND id<>? AND json_extract(input,'$.mode')='news' AND (json_extract(input,'$.source.url')=? OR json_extract(input,'$.source.title')=?))",params![id,id,source["url"].as_str(),source["title"].as_str()],|r|r.get(0)).map_err(|e|e.to_string())?;
                if duplicate {return Err("该新闻已有任务，未重复发布".into());}
                input["source"]=source;
                input["schema_version"]=json!(1);
            }else if input["mode"]=="reply" {
                if value.as_object().is_none_or(|object|object.len()!=2||!object.contains_key("text")||!object.contains_key("schema_version"))||value["schema_version"]!=1 {return Err("回复返回格式无效，未发送".into());}
                if text.trim().is_empty()||text.chars().count()>120||text.chars().any(|c|c.is_control()&&c!='\n'&&c!='\t') {return Err("回复正文应为1–120字符，未发送".into());}
                let mut available=reply_facts(input["source"]["text"].as_str().unwrap_or(""));
                for fact in reply_facts(text){let Some(index)=available.iter().position(|item|*item==fact)else{return Err("回复新增了原帖没有的数字、链接、提及或话题，未发送".into())};available.remove(index);}
                input["schema_version"]=json!(1);
            }else{validate_rewrite(input["source"]["text"].as_str().unwrap_or(""),text)?;}
            if input["mode"] == "replicate" {
                let root=value.as_object().ok_or("发同款返回格式无效")?;
                let analysis=value["analysis"].as_object().ok_or("缺少原帖分析")?;
                if value["schema_version"]!=1 || root.len()!=3 || !root.keys().all(|key|["schema_version","analysis","text"].contains(&key.as_str())) || analysis.len()!=4 || !analysis.keys().all(|key|["topic","structure","tone","key_points"].contains(&key.as_str())) {return Err("发同款返回格式无效，未提交发布".into());}
                for (key,max) in [("topic",200),("structure",1000),("tone",200)] {
                    if !analysis[key].as_str().is_some_and(|text|!text.trim().is_empty()&&text.chars().count()<=max) {return Err("原帖分析字段无效，未提交发布".into());}
                }
                if !analysis["key_points"].as_array().is_some_and(|points|!points.is_empty()&&points.len()<=6&&points.iter().all(|point|point.as_str().is_some_and(|text|!text.trim().is_empty()&&text.chars().count()<=500))) {return Err("原帖分析要点无效，未提交发布".into());}
                input["analysis"]=value["analysis"].clone();
                input["schema_version"]=json!(1);
            }
            if ["similar","replicate"].iter().any(|mode|input["mode"]==*mode) && Some(text.trim()) == input["source"]["text"].as_str() {
                return Err("模型返回了原文，请重试生成同类文章".into());
            }
            let duplicate: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE account=(SELECT account FROM jobs WHERE id=?) AND action='rewrite_publish' AND id<>? AND json_extract(input,'$.text')=? AND (state IN ('queued','running','completed') OR json_extract(input,'$.stage')='sending'))",params![id,id,text.trim()],|r|r.get(0)).map_err(|e|e.to_string())?;
            if duplicate { return Err("相同正文已有发布任务，未重复发布".into()); }
            if input["mode"]=="news" && input["news_feed"]["latest_pool"]==true {
                let changed=db.execute("UPDATE news_candidates SET job_id=? WHERE id=? AND batch_id=? AND account=(SELECT account FROM jobs WHERE id=?) AND (job_id IS NULL OR job_id=?) AND state='pending'",params![id,input["news_candidate_id"].as_str(),input["news_feed"]["batch_id"].as_str(),id,id]).map_err(|e|e.to_string())?;
                if changed!=1 {return Err("该候选已被其他任务处理，未重复发布".into());}
            }
            input["text"] = json!(text.trim());
            if let Some(task)=input["task_id"].as_str(){
                let earliest:Option<i64>=db.query_row("SELECT MAX(j.updated_at)+automation_interval_ms(t.value) FROM jobs j JOIN automation_tasks t ON t.id=json_extract(j.input,'$.task_id') AND t.account=j.account WHERE j.account=(SELECT account FROM jobs WHERE id=?) AND t.id=? AND j.action='rewrite_publish' AND j.state='completed'",params![id,task],|row|row.get(0)).map_err(|e|e.to_string())?;
                if let Some(earliest)=earliest{input["publish_at"]=json!(input["publish_at"].as_i64().unwrap_or(at).max(earliest));}
            }
            input["stage"] = json!("ready");
            Ok(())
        });
        if outcome.is_err(){if let Ok(value)=result{input["rejected_generation"]=value.clone();}}else{input.as_object_mut().unwrap().remove("rejected_generation");}
        db.execute(
            "UPDATE jobs SET state=?,client=NULL,input=?,error=?,updated_at=? WHERE id=?",
            params![
                if outcome.is_ok() { "queued" } else { "failed" },
                input.to_string(),
                outcome
                    .err()
                    .map(|s| s.chars().take(2000).collect::<String>()),
                at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        db.commit().map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn schedule_publication(
        &self,
        account: &str,
        id: &str,
        run_at: i64,
        at: i64,
    ) -> Result<Value, String> {
        let account = handle(account)?;
        if run_at < at || run_at > at + 365 * 86400000 {
            return Err("请选择未来一年内的执行时间".into());
        }
        let changed = self.lock()?.execute("UPDATE jobs SET input=json_set(input,'$.publish_at',?),updated_at=? WHERE id=? AND account=? AND action='rewrite_publish' AND state IN ('queued','rewriting') AND coalesce(json_extract(input,'$.hidden'),0)=0 AND json_extract(input,'$.stage') IN ('rewrite','ready')",params![run_at,at,id,account]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("任务已开始发布或已结束，不能调整时间".into());
        }
        Ok(json!({"saved":true}))
    }
    pub fn begin_publish(&self, id: &str, client: &str, at: i64) -> Result<Value, String> {
        self.expire_automation(at)?;
        let stale:bool=self.lock()?.query_row("SELECT EXISTS(SELECT 1 FROM jobs WHERE id=? AND json_extract(input,'$.mode')='news' AND (json_extract(input,'$.source.published_at') IS NULL OR json_extract(input,'$.source.published_at')<?))",params![id,at-48*3600000],|row|row.get(0)).map_err(|e|e.to_string())?;
        if stale {return Err("新闻已超过48小时，未发送".into());}
        let changed = self.lock()?.execute("UPDATE jobs SET input=json_set(input,'$.stage','sending','$.telemetry.send_started_at',?),updated_at=? WHERE id=? AND client=? AND state='running' AND action='rewrite_publish' AND json_extract(input,'$.stage')='ready' AND json_extract(input,'$.publish_at')<=? AND (json_extract(input,'$.task_id') IS NULL OR EXISTS(SELECT 1 FROM automation_tasks t WHERE t.id=json_extract(jobs.input,'$.task_id') AND t.account=jobs.account AND t.enabled=1)) AND NOT EXISTS(SELECT 1 FROM settings WHERE key='automation_block:'||jobs.account) AND EXISTS(SELECT 1 FROM clients c JOIN browser_sessions s ON s.client=c.id WHERE c.id=jobs.client AND c.account=jobs.account AND c.last_seen>? AND s.connected=1 AND s.state='logged_in')",params![at,at,id,client,at,at-60_000]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("发布已暂停、账号已改变或已尝试发送，请检查任务队列".into());
        }
        Ok(json!({"allowed":true}))
    }
    pub fn finish_publication(
        &self,
        id: &str,
        client: &str,
        result: &Value,
        error: Option<&str>,
        at: i64,
    ) -> Result<Option<Value>, String> {
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let row: Option<(String,String,String,Option<String>)> = tx.query_row("SELECT account,input,state,result FROM jobs WHERE id=? AND client=? AND action='rewrite_publish' AND (state IN ('running','completed') OR (state='failed' AND json_extract(input,'$.stage')='sending' AND error='发布中断，请到 X 核对结果；不会自动重发'))",params![id,client],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|e|e.to_string())?;
        let Some((account, raw,previous_state,previous_result)) = row else {
            return Ok(None);
        };
        if previous_state=="completed" && error.is_some(){return Ok(Some(json!({"saved":true})));}
        let input: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let url = result["url"].as_str().unwrap_or("");
        let prefix = format!("https://x.com/{account}/status/");
        let valid = input["stage"] == "sending"
            && (input["mode"] != "reply"
                || (result["reply_to"].is_string() && result["reply_to"] == input["source"]["id"]))
            && url.strip_prefix(&prefix).is_some_and(|id| {
                !id.is_empty() && id.len() <= 30 && id.bytes().all(|b| b.is_ascii_digit())
            });
        if error.is_none() && !valid {
            return Err("缺少可验证的发布结果，未标记成功".into());
        }
        if previous_state=="completed" {
            let previous:Value=previous_result.as_deref().and_then(|value|serde_json::from_str(value).ok()).ok_or("已完成任务缺少回执")?;
            if previous["url"]!=result["url"]||input["mode"]=="reply"&&previous["reply_to"]!=result["reply_to"] {return Err("已确认的回执不一致，未覆盖".into());}
        }
        let failure = error.map(|s| s.chars().take(2000).collect::<String>());
        let mut saved_result=json!({"url":if valid{Some(url)}else{None},"reply_to":if valid&&input["mode"]=="reply"{result["reply_to"].clone()}else{Value::Null}});
        if valid || failure.is_some() {
            if let Some(closed)=result["tab_closed"].as_bool(){saved_result["tab_closed"]=json!(closed);}
            if let Some(warning)=result["cleanup_warning"].as_str().filter(|warning|!warning.is_empty()&&warning.chars().count()<=300){saved_result["cleanup_warning"]=json!(warning);}
        }
        if previous_state=="completed" {
            tx.execute("UPDATE jobs SET result=? WHERE id=?",params![saved_result.to_string(),id]).map_err(|e|e.to_string())?;
            tx.commit().map_err(|e|e.to_string())?;return Ok(Some(json!({"saved":true})));
        }
        tx.execute(
            "UPDATE jobs SET state=?,result=?,error=?,updated_at=? WHERE id=?",
            params![
                if failure.is_some() {
                    "failed"
                } else {
                    "completed"
                },
                saved_result.to_string(),
                failure,
                at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        if !input["task_id"].is_null() {
            if let Some(task) = input["task_id"].as_str() {
                tx.execute("UPDATE automation_tasks SET next_run=CASE WHEN json_extract(value,'$.action')='auto_post' THEN MAX(next_run,?) ELSE MAX(next_run,?+automation_interval_ms(value)) END WHERE id=? AND account=?",params![at,at,task,account]).map_err(|e|e.to_string())?;
                tx.execute("UPDATE jobs SET input=json_set(input,'$.publish_at',MAX(COALESCE(json_extract(input,'$.publish_at'),0),?+COALESCE((SELECT automation_interval_ms(value) FROM automation_tasks WHERE id=? AND account=?),0))) WHERE account=? AND action='rewrite_publish' AND state='queued' AND json_extract(input,'$.task_id')=? AND json_extract(input,'$.stage')='ready'",params![at,task,account,account,task]).map_err(|e|e.to_string())?;
            }
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(Some(json!({"saved":true})))
    }
    pub fn retry_rewrite(&self, account: &str, id: &str, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        let changed = self.lock()?.execute("UPDATE jobs SET state='queued',client=NULL,error=NULL,updated_at=? WHERE id=? AND account=? AND action='rewrite_publish' AND state='failed' AND coalesce(json_extract(input,'$.hidden'),0)=0 AND json_extract(input,'$.stage') IN ('rewrite','ready')",params![at,id,account]).map_err(|e|e.to_string())?;
        if changed != 1 {
            return Err("此任务已尝试发送，不能重试；请先到 X 核对发布结果".into());
        }
        Ok(json!({"saved":true}))
    }
}

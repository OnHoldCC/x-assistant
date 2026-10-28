use super::*;

pub(super) fn validate_creator(value: &Value, account: &str) -> Result<(), String> {
    if value.to_string().len() > 8000
        || value["account"].as_str() != Some(account)
        || !["unknown", "ineligible", "eligible", "enrolled"]
            .contains(&value["state"].as_str().unwrap_or(""))
    {
        return Err("创作者数据无效".into());
    }
    for name in ["verified_followers", "verified_impressions"] {
        if let Some(item) = value.get(name) {
            let count: Count =
                serde_json::from_value(item["current"].clone()).map_err(|_| "创作者计数无效")?;
            if count.value < 0
                || count.value > 1_000_000_000_000_000
                || count.raw.len() > 80
                || !item["target"]
                    .as_i64()
                    .is_some_and(|n| n > 0 && n <= 1_000_000_000_000_000)
            {
                return Err("创作者门槛无效".into());
            }
            if name == "verified_impressions"
                && !item["days"]
                    .as_u64()
                    .is_some_and(|n| (1..=366).contains(&n))
            {
                return Err("创作者统计周期无效".into());
            }
        }
    }
    Ok(())
}

impl Store {
    pub fn creator(&self, account: &str) -> Result<Value, String> {
        let account = handle(account)?;
        let db = self.lock()?;
        let read = |key: String| -> Result<Option<Value>, String> {
            let raw: Option<String> = db
                .query_row("SELECT value FROM settings WHERE key=?", [key], |r| {
                    r.get(0)
                })
                .optional()
                .map_err(|e| e.to_string())?;
            raw.map(|v| serde_json::from_str(&v).map_err(|e| e.to_string()))
                .transpose()
        };
        let creator = read(format!("creator:{account}"))?;
        let assumptions = read(format!("earnings:{account}"))?;
        let calibration = read(format!("earnings-calibration:{account}"))?;
        Ok(
            json!({"account":account,"snapshot":creator,"assumptions":assumptions,"calibration":calibration}),
        )
    }
    pub fn save_earnings(&self, account: &str, input: &Value, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        if !input["qualified30"]
            .as_i64()
            .is_some_and(|n| (0..=1_000_000_000_000_000).contains(&n))
            || !input["rpmCny"]
                .as_f64()
                .is_some_and(|n| n.is_finite() && (0.0..=1e6).contains(&n))
        {
            return Err("填写有效的近30天合格曝光与每千次收益（元）".into());
        }
        self.lock()?.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("earnings:{account}"),json!({"qualified30":input["qualified30"],"rpmCny":input["rpmCny"],"source":"manual","observed_at":at}).to_string()]).map_err(|e|e.to_string())?;
        self.creator(&account)
    }
    pub fn save_earnings_calibration(
        &self,
        account: &str,
        input: &Value,
        at: i64,
    ) -> Result<Value, String> {
        let account = handle(account)?;
        let payout = input["payout"]
            .as_f64()
            .filter(|n| n.is_finite() && (0.0..=1e9).contains(n))
            .ok_or("结算金额无效")?;
        let currency = input["currency"]
            .as_str()
            .filter(|value| ["USD", "CNY"].contains(value))
            .ok_or("币种无效")?;
        if input["confirmed"].as_bool() != Some(true) {
            return Err("请确认结算金额对应所选统计日期".into());
        }
        let observed = input["observed_at"].as_i64().ok_or("缺少 Analytics 快照")?;
        let db = self.lock()?;
        let raw: String = db
            .query_row(
                "SELECT value FROM analytics WHERE handle=? AND at=?",
                params![account, observed],
                |r| r.get(0),
            )
            .map_err(|_| "未找到该账号的 Analytics 快照")?;
        let snapshot: Value = serde_json::from_str(&raw).map_err(|_| "分析快照无效")?;
        let from = input["start_date"].as_str().ok_or("缺少结算开始日期")?;
        let to = input["end_date"].as_str().ok_or("缺少结算结束日期")?;
        let start =
            chrono::NaiveDate::parse_from_str(from, "%Y-%m-%d").map_err(|_| "结算日期无效")?;
        let end = chrono::NaiveDate::parse_from_str(to, "%Y-%m-%d").map_err(|_| "结算日期无效")?;
        let days = (end - start).num_days() + 1;
        if !(1..=366).contains(&days) || from.len() != 10 || to.len() != 10 {
            return Err("结算日期范围无效".into());
        }
        let all = snapshot["data"]["series"]
            .as_array()
            .filter(|rows| !rows.is_empty())
            .ok_or("该快照没有逐日数据")?;
        let series: Vec<_> = all
            .iter()
            .filter(|row| {
                row["date"]
                    .as_str()
                    .is_some_and(|date| date >= from && date <= to)
            })
            .collect();
        if series.len() as i64 != days {
            return Err("所选日期没有完整的逐日曝光，无法校准".into());
        }
        let mut impressions = 0i64;
        for point in &series {
            impressions = impressions
                .checked_add(
                    point["metrics"]["impressions"]
                        .as_i64()
                        .filter(|n| *n >= 0)
                        .ok_or("该周期曝光缺失，无法校准")?,
                )
                .ok_or("曝光总量过大")?;
        }
        if impressions <= 0 || impressions > 1_000_000_000_000_000 {
            return Err("校准周期需要有效曝光".into());
        }
        let calibration = json!({"payout":payout,"currency":currency,"impressions":impressions,"start_date":series.first().unwrap()["date"],"end_date":series.last().unwrap()["date"],"period":snapshot["data"]["period"],"verified_only":snapshot["data"]["verified_only"].as_bool().unwrap_or(false),"observed_at":at});
        db.execute(
            "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![
                format!("earnings-calibration:{account}"),
                calibration.to_string()
            ],
        )
        .map_err(|e| e.to_string())?;
        drop(db);
        self.creator(&account)
    }
    pub fn save_bookmark(&self, account: &str, input: &Value, at: i64) -> Result<Value, String> {
        let account = handle(account)?;
        let post = &input["post"];
        let author = handle(post["author"].as_str().ok_or("帖子作者无效")?)?;
        let id = post["id"].as_str().ok_or("帖子编号无效")?;
        if id.is_empty() || id.len() > 25 || !id.bytes().all(|c| c.is_ascii_digit()) {
            return Err("帖子编号无效".into());
        }
        let text = post["text"].as_str().ok_or("帖子内容无效")?;
        if text.is_empty() || text.len() > 96000 || text.chars().count() > 24000 {
            return Err("收藏内容应为1–24000字".into());
        }
        let tags = input["tags"].as_array().ok_or("收藏标签无效")?;
        if tags.len() > 10
            || tags.iter().any(|tag| {
                tag.as_str().is_none_or(|s| {
                    s.trim().is_empty() || s.chars().count() > 32 || s.chars().any(char::is_control)
                })
            })
        {
            return Err("最多10个标签，每个1–32字".into());
        }
        let tags: std::collections::BTreeSet<_> = tags
            .iter()
            .map(|tag| tag.as_str().unwrap().trim())
            .collect();
        let metrics: BTreeMap<String, Count> =
            serde_json::from_value(post.get("metrics").cloned().unwrap_or(json!({})))
                .map_err(|_| "收藏计数无效")?;
        if metrics.iter().any(|(name, count)| {
            !["views", "likes", "replies", "reposts", "bookmarks"].contains(&name.as_str())
                || count.value < 0
                || count.value > 1_000_000_000_000_000
                || count.raw.len() > 80
        }) {
            return Err("收藏计数无效".into());
        }
        let url = format!("https://x.com/{author}/status/{id}");
        if post
            .get("url")
            .is_some_and(|v| v.as_str() != Some(url.as_str()))
        {
            return Err("收藏来源不匹配".into());
        }
        let value = json!({"id":id,"author":author,"url":url,"text":text,"metrics":metrics});
        self.lock()?.execute("INSERT INTO bookmarks(owner,author,id,value,tags,saved_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,author,id) DO UPDATE SET value=excluded.value,tags=excluded.tags,updated_at=excluded.updated_at",params![account,author,id,value.to_string(),json!(tags).to_string(),at,at]).map_err(|e|e.to_string())?;
        Ok(json!({"saved":true,"id":id,"author":author,"tags":tags}))
    }
    pub fn bookmarks(
        &self,
        account: &str,
        offset: u32,
        search: &str,
        tag: &str,
    ) -> Result<Value, String> {
        let account = handle(account)?;
        if offset > 1_000_000 || search.len() > 1000 || tag.chars().count() > 32 {
            return Err("收藏筛选无效".into());
        }
        let db = self.lock()?;
        let filter="owner=?1 AND (?2='' OR instr(lower(json_extract(value,'$.text')),lower(?2))>0 OR instr(lower(author),lower(?2))>0) AND (?3='' OR EXISTS(SELECT 1 FROM json_each(tags) WHERE value=?3))";
        let total: i64 = db
            .query_row(
                &format!("SELECT count(*) FROM bookmarks WHERE {filter}"),
                params![account, search, tag],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut statement=db.prepare(&format!("SELECT value,tags,saved_at,updated_at FROM bookmarks WHERE {filter} ORDER BY saved_at DESC,author,id LIMIT 50 OFFSET ?4")).map_err(|e|e.to_string())?;
        let items=statement.query_map(params![account,search,tag,offset],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?,row.get::<_,i64>(2)?,row.get::<_,i64>(3)?))).map_err(|e|e.to_string())?.map(|row|{let (raw,tags,saved,updated)=row.map_err(|e|e.to_string())?;Ok(json!({"post":serde_json::from_str::<Value>(&raw).map_err(|e|e.to_string())?,"tags":serde_json::from_str::<Value>(&tags).map_err(|e|e.to_string())?,"saved_at":saved,"updated_at":updated}))}).collect::<Result<Vec<Value>,String>>()?;
        let mut statement=db.prepare("SELECT DISTINCT j.value FROM bookmarks b,json_each(b.tags) j WHERE b.owner=? ORDER BY j.value").map_err(|e|e.to_string())?;
        let tags = statement
            .query_map([&account], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        Ok(
            json!({"account":account,"items":items,"total":total,"tags":tags,"next_offset":((offset as i64+items.len() as i64)<total).then_some(offset+items.len() as u32)}),
        )
    }
    pub fn bookmark(&self, account: &str, author: &str, id: &str) -> Result<Value, String> {
        let account = handle(account)?;
        let author = handle(author)?;
        let raw: Option<String> = self
            .lock()?
            .query_row(
                "SELECT tags FROM bookmarks WHERE owner=? AND author=? AND id=?",
                params![account, author, id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(
            json!({"saved":raw.is_some(),"tags":raw.map(|value|serde_json::from_str::<Value>(&value).unwrap_or(json!([]))).unwrap_or(json!([]))}),
        )
    }
    pub fn remove_bookmark(&self, account: &str, author: &str, id: &str) -> Result<Value, String> {
        let account = handle(account)?;
        let author = handle(author)?;
        self.lock()?
            .execute(
                "DELETE FROM bookmarks WHERE owner=? AND author=? AND id=?",
                params![account, author, id],
            )
            .map_err(|e| e.to_string())?;
        Ok(json!({"saved":false}))
    }
}

use super::*;

fn analytics_period(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1d" => Some("1d"),
        "7d" => Some("7d"),
        "2w" | "14d" => Some("14d"),
        "4w" | "28d" => Some("28d"),
        "30d" => Some("30d"),
        "3m" | "90d" => Some("90d"),
        "1y" | "365d" => Some("365d"),
        _ => None,
    }
}

impl Store {
    pub fn ingest(&self, mut input: Snapshot, at: i64) -> Result<Value, String> {
        let account = handle(&input.handle)?;
        let source = url::Source::parse(&input.source)?;
        if input.posts.len() > 50 {
            return Err("单次最多接收 50 篇帖子".into());
        }
        let valid_count = |c: &Count| {
            if c.value < 0 || c.value > 1_000_000_000_000_000 || c.raw.chars().count() > 80 {
                Err("计数格式无效".to_string())
            } else {
                Ok(())
            }
        };
        for (name, c) in &input.profile {
            if !["followers", "following"].contains(&name.as_str()) {
                return Err("资料指标无效".into());
            }
            valid_count(c)?;
        }
        for post in &input.posts {
            if handle(&post.author)? != account
                || post.id.is_empty()
                || post.id.len() > 25
                || !post.id.bytes().all(|c| c.is_ascii_digit())
                || post.text.chars().count() > 24000
            {
                return Err("帖子作者、ID 或正文无效".into());
            }
            if let Some(date) = &post.created_at {
                chrono::DateTime::parse_from_rfc3339(date).map_err(|_| "帖子时间须带时区")?;
            }
            for (name, c) in &post.metrics {
                if !["views", "likes", "replies", "reposts", "bookmarks"].contains(&name.as_str()) {
                    return Err("帖子指标无效".into());
                }
                valid_count(c)?;
            }
        }
        if let Some(analytics) = &mut input.analytics {
            if !analytics.is_object()
                || analytics.to_string().len() > 256000
                || analytics.get("account").and_then(Value::as_str) != Some(account.as_str())
            {
                return Err("Analytics 账号不匹配".into());
            }
            let period = analytics
                .get("period")
                .and_then(Value::as_str)
                .and_then(analytics_period);
            if let Some(key) = analytics.get("period_key").filter(|v| !v.is_null()) {
                if key.as_str().and_then(analytics_period) != period || period.is_none() {
                    return Err("Analytics 周期不匹配".into());
                }
            }
            if let Some(period) = period {
                analytics["period_key"] = json!(period);
            }
            if let Some(periods) = analytics.get("available_periods") {
                let periods = periods.as_array().ok_or("Analytics 周期列表无效")?;
                if periods.len() > 7
                    || periods
                        .iter()
                        .any(|p| p.as_str().and_then(analytics_period).is_none())
                {
                    return Err("Analytics 周期列表无效".into());
                }
            }
            if analytics
                .get("verified_only")
                .is_some_and(|v| !v.is_null() && !v.is_boolean())
            {
                return Err("Analytics 筛选条件无效".into());
            }
            let metrics = analytics
                .get("metrics")
                .and_then(Value::as_object)
                .ok_or("Analytics 指标无效")?;
            for (name, count) in metrics {
                if ![
                    "impressions",
                    "engagements",
                    "engagement_rate",
                    "profile_visits",
                    "followers",
                    "verified_followers",
                    "likes",
                    "replies",
                    "reposts",
                    "bookmarks",
                    "shares",
                    "new_follows",
                    "unfollows",
                    "posts",
                    "video_views",
                    "media_views",
                ]
                .contains(&name.as_str())
                    || !count
                        .get("value")
                        .and_then(Value::as_f64)
                        .is_some_and(|n| n.is_finite() && (0.0..=1e15).contains(&n))
                    || (name != "engagement_rate"
                        && count.get("value").and_then(Value::as_i64).is_none())
                    || count
                        .get("raw")
                        .is_some_and(|v| v.as_str().is_none_or(|s| s.chars().count() > 80))
                    || count.get("approximate").is_some_and(|v| !v.is_boolean())
                {
                    return Err("Analytics 指标无效".into());
                }
            }
        }
        if let Some(creator) = &input.creator {
            operations::validate_creator(creator, &account)?;
        }
        if let Some(series) = input.analytics.as_ref().and_then(|v| v.get("series")) {
            let series = series.as_array().ok_or("分析时间序列无效")?;
            if series.len() > 366 {
                return Err("分析时间点过多".into());
            }
            let mut last = String::new();
            for point in series {
                let date = point["date"].as_str().ok_or("分析日期无效")?;
                if chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err()
                    || date.len() != 10
                    || date <= last.as_str()
                {
                    return Err("分析日期顺序无效".into());
                }
                last = date.into();
                let values = point["metrics"].as_object().ok_or("分析曲线指标无效")?;
                for (name, value) in values {
                    if ![
                        "impressions",
                        "engagements",
                        "engagement_rate",
                        "profile_visits",
                        "likes",
                        "replies",
                        "reposts",
                        "bookmarks",
                        "shares",
                        "new_follows",
                        "unfollows",
                        "net_follows",
                        "posts",
                        "video_views",
                        "media_views",
                    ]
                    .contains(&name.as_str())
                        || !value.is_null()
                            && !value.as_f64().is_some_and(|v| {
                                v.is_finite()
                                    && v.abs() <= 1e15
                                    && (v >= 0.0 || name == "net_follows")
                            })
                    {
                        return Err("分析曲线指标无效".into());
                    }
                }
            }
        }
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let save = (|| -> rusqlite::Result<()> {
            tx.execute("INSERT INTO accounts VALUES(?,?,?) ON CONFLICT(handle) DO UPDATE SET last_seen=excluded.last_seen",params![account,at,at])?;
            for post in &input.posts {
                let existing: Option<String> = tx
                    .query_row("SELECT handle FROM posts WHERE id=?", [&post.id], |r| {
                        r.get(0)
                    })
                    .optional()?;
                if existing.as_ref().is_some_and(|old| old != &account) {
                    return Err(rusqlite::Error::InvalidQuery);
                }
                let hashtags: Vec<_> = post
                    .text
                    .split_whitespace()
                    .filter_map(|word| word.strip_prefix('#'))
                    .map(|word| {
                        word.chars()
                            .take_while(|c| c.is_alphanumeric() || *c == '_')
                            .take(40)
                            .collect::<String>()
                    })
                    .filter(|word| !word.is_empty())
                    .collect();
                tx.execute("INSERT INTO posts VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET text=CASE WHEN length(excluded.text)>=length(posts.text) THEN excluded.text ELSE posts.text END,hashtags=CASE WHEN length(excluded.text)>=length(posts.text) THEN excluded.hashtags ELSE posts.hashtags END,created_at=COALESCE(posts.created_at,excluded.created_at),last_seen=excluded.last_seen",params![post.id,account,post.text,post.created_at,serde_json::to_string(&hashtags).unwrap(),at,at])?;
            }
            let mut values: Vec<(&str, &str, &Count)> = input
                .profile
                .iter()
                .map(|(k, v)| ("", k.as_str(), v))
                .collect();
            for post in &input.posts {
                values.extend(
                    post.metrics
                        .iter()
                        .map(|(k, v)| (post.id.as_str(), k.as_str(), v)),
                );
            }
            for (post_id, name, c) in values {
                tx.execute(
                    "INSERT OR REPLACE INTO observations VALUES(?,?,?,?,?,?,?)",
                    params![account, post_id, name, at, c.value, c.approximate, c.raw],
                )?;
            }
            if let Some(creator) = &input.creator {
                tx.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("creator:{account}"),json!({"data":creator,"source":source,"observed_at":at}).to_string()])?;
            }
            if let Some(analytics) = &input.analytics {
                tx.execute(
                    "INSERT OR REPLACE INTO analytics VALUES(?,?,?)",
                    params![
                        account,
                        at,
                        json!({"data":analytics,"source":source,"observed_at":at}).to_string()
                    ],
                )?;
            }
            Ok(())
        })();
        save.map_err(|e| format!("记录未保存：{e}"))?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"account":account,"posts":input.posts.len(),"observed_at":at}))
    }
}

mod url {
    pub struct Source;
    impl Source {
        pub fn parse(value: &str) -> Result<&str, String> {
            if value.len() > 2048
                || !(["https://x.com/", "https://twitter.com/"]
                    .iter()
                    .any(|prefix| value.starts_with(prefix)))
                || value.contains(['\r', '\n'])
            {
                return Err("只接受 X 页面的采集数据".into());
            }
            Ok(value)
        }
    }
}

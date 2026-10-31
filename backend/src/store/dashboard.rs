use super::*;

#[derive(Clone)]
struct Point {
    at: i64,
    count: Count,
    precision_start: usize,
}
fn window(points: &[Point], start: i64, end: i64) -> Window {
    let eligible = &points[..points.partition_point(|p| p.at <= end)];
    let latest = eligible.last();
    let baseline = eligible.partition_point(|p| p.at < start).saturating_sub(1);
    // Preserve the existing reset when exact and approximate observations change.
    let base = latest.and_then(|last| {
        eligible.get(if last.precision_start > 0 {
            last.precision_start
        } else {
            baseline
        })
    });
    let pair = base
        .zip(latest)
        .filter(|(a, b)| b.at >= start && b.at > a.at);
    Window {
        value: latest.map(|p| p.count.value),
        approximate: latest.is_some_and(|p| p.count.approximate),
        delta: pair.map(|(a, b)| b.count.value - a.count.value),
        delta_approximate: pair.is_some_and(|(a, b)| a.count.approximate || b.count.approximate),
        baseline_at: pair.map(|(a, _)| a.at),
        observed_at: latest.map(|p| p.at),
    }
}

fn covered_analytics_periods(periods: &mut serde_json::Map<String, Value>, at: i64) {
    let sources = periods.values().cloned().collect::<Vec<_>>();
    let today = chrono::DateTime::from_timestamp_millis(at + 8 * 3_600_000).map(|date|date.date_naive());
    for source in sources {
        if source["data"]["series_source"] != "x_analytics_csv" { continue; }
        let Some(rows) = source["data"]["series"].as_array() else { continue; };
        let Some(end) = rows.last().and_then(|point|point["date"].as_str()).and_then(|date|chrono::NaiveDate::parse_from_str(date,"%Y-%m-%d").ok()) else { continue; };
        for days in [1,7,14,28,30,90,365] {
            let key = format!("{days}d");
            if days == 1 && Some(end) != today { continue; }
            if periods.get(&key).is_some_and(|current|current["observed_at"].as_i64().unwrap_or(0) >= source["observed_at"].as_i64().unwrap_or(0)) { continue; }
            let Some(start) = end.checked_sub_days(chrono::Days::new(days-1)) else { continue; };
            let (start_text,end_text) = (start.to_string(),end.to_string());
            let selected = rows.iter().filter(|point|point["date"].as_str().is_some_and(|date|date>=start_text.as_str()&&date<=end_text.as_str())).cloned().collect::<Vec<_>>();
            if selected.len() != days as usize || selected.iter().enumerate().any(|(index,point)|point["date"]!=json!(start.checked_add_days(chrono::Days::new(index as u64)).unwrap().to_string())) { continue; }
            let mut metrics = serde_json::Map::new();
            for name in ["followers","verified_followers"] {
                if let Some(count) = source["data"]["metrics"].get(name) { metrics.insert(name.into(),count.clone()); }
            }
            for name in ["impressions","engagements","profile_visits","likes","replies","reposts","bookmarks","shares","new_follows","unfollows","posts","video_views","media_views"] {
                let sum = selected.iter().try_fold(0_i64,|sum,point|sum.checked_add(point["metrics"][name].as_i64()?));
                if let Some(value) = sum.filter(|value|*value>=0&&*value<=1_000_000_000_000_000) { metrics.insert(name.into(),json!({"value":value,"approximate":false,"raw":value.to_string()})); }
            }
            if let (Some(impressions),Some(engagements)) = (metrics.get("impressions").and_then(|value|value["value"].as_f64()),metrics.get("engagements").and_then(|value|value["value"].as_f64())) {
                if impressions>0.0 { metrics.insert("engagement_rate".into(),json!({"value":engagements/impressions*100.0,"approximate":false,"raw":""})); }
            }
            let mut snapshot = source.clone();
            snapshot["data"]["period"] = json!(key);
            snapshot["data"]["period_key"] = json!(key);
            snapshot["data"]["derived_from"] = source["data"]["period_key"].clone();
            snapshot["data"]["series"] = json!(selected);
            snapshot["data"]["metrics"] = json!(metrics);
            periods.insert(key,snapshot);
        }
    }
}

impl Store {
    pub fn dashboard(&self, account: Option<&str>, days: u32, at: i64) -> Result<Value, String> {
        if ![1, 7, 30].contains(&days) {
            return Err("统计时段须为 1、7 或 30 天".into());
        }
        let db = self.lock()?;
        let mut stmt = db
            .prepare(
                "SELECT handle,first_seen,last_seen FROM accounts ORDER BY last_seen DESC,handle",
            )
            .map_err(|e| e.to_string())?;
        let accounts=stmt.query_map([],|r|Ok(json!({"handle":r.get::<_,String>(0)?,"first_seen":r.get::<_,i64>(1)?,"last_seen":r.get::<_,i64>(2)?}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        let selected = match account.filter(|s| !s.is_empty()) {
            Some(a) => Some(handle(a)?),
            None => accounts
                .first()
                .and_then(|a| a["handle"].as_str().map(str::to_owned)),
        };
        let Some(selected) = selected else {
            return Ok(
                json!({"accounts":[],"account":null,"posts":[],"series":[],"metrics":{},"days":days,"analytics":null,"task_stats":[]}),
            );
        };
        if !accounts.iter().any(|a| a["handle"] == selected) {
            return Err("尚未采集此账号".into());
        }
        let day = 86_400_000;
        let start = (at + 8 * 3_600_000) / day * day - 8 * 3_600_000 - (days as i64 - 1) * day;
        let mut stmt=db.prepare("SELECT post_id,metric,at,value,approximate,raw FROM observations WHERE handle=? AND at<=? ORDER BY at").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map(params![selected, at], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    Point {
                        at: r.get(2)?,
                        precision_start: 0,
                        count: Count {
                            value: r.get(3)?,
                            approximate: r.get(4)?,
                            raw: r.get(5)?,
                        },
                    },
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut points: HashMap<String, HashMap<String, Vec<Point>>> = HashMap::new();
        for row in rows {
            let (post, metric, mut point) = row.map_err(|e| e.to_string())?;
            let history = points.entry(post).or_default().entry(metric).or_default();
            point.precision_start = history
                .last()
                .filter(|last| last.count.approximate == point.count.approximate)
                .map_or(history.len(), |last| last.precision_start);
            history.push(point);
        }
        let read = |post: &str, metric: &str, begin, end| {
            window(
                points
                    .get(post)
                    .and_then(|metrics| metrics.get(metric))
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
                begin,
                end,
            )
        };
        let mut stmt=db.prepare("SELECT id,text,created_at,hashtags,first_seen,last_seen FROM posts WHERE handle=? ORDER BY last_seen DESC,id DESC LIMIT 5000").map_err(|e|e.to_string())?;
        let mut posts=stmt.query_map([&selected],|r|Ok(json!({"id":r.get::<_,String>(0)?,"text":r.get::<_,String>(1)?,"created_at":r.get::<_,Option<String>>(2)?,"hashtags":serde_json::from_str::<Value>(&r.get::<_,String>(3)?).unwrap_or(json!([])),"first_seen":r.get::<_,i64>(4)?,"last_seen":r.get::<_,i64>(5)?,"handle":selected}))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        for post in &mut posts {
            let id = post["id"].as_str().unwrap().to_string();
            post["url"] = json!(format!("https://x.com/{selected}/status/{id}"));
            post["metrics"] = json!(["views", "likes", "replies", "reposts", "bookmarks"]
                .into_iter()
                .map(|name| (name, read(&id, name, start, at)))
                .collect::<BTreeMap<_, _>>());
        }
        let summarize = |begin, end| {
            let mut out = BTreeMap::new();
            for name in ["followers", "following"] {
                out.insert(name, read("", name, begin, end));
            }
            for name in ["views", "likes", "replies", "reposts", "bookmarks"] {
                let items: Vec<_> = posts
                    .iter()
                    .map(|post| read(post["id"].as_str().unwrap(), name, begin, end))
                    .collect();
                let values: Vec<_> = items.iter().filter_map(|i| i.value).collect();
                let deltas: Vec<_> = items.iter().filter_map(|i| i.delta).collect();
                out.insert(
                    name,
                    Window {
                        value: (!values.is_empty()).then(|| values.iter().sum()),
                        delta: (!deltas.is_empty()).then(|| deltas.iter().sum()),
                        approximate: items.iter().any(|i| i.approximate),
                        delta_approximate: items.iter().any(|i| i.delta_approximate),
                        baseline_at: None,
                        observed_at: Some(end),
                    },
                );
            }
            out
        };
        let count = if days == 1 { 24 } else { days };
        let step = if days == 1 { 3_600_000 } else { day };
        let series:Vec<_>=(0..count).map(|i|{let begin=start+i as i64*step;let sums=summarize(begin,(begin+step-1).min(at));json!({"at":begin,"label":if days==1{format!("{i:02}:00")}else{chrono::DateTime::from_timestamp_millis(begin+8*3_600_000).unwrap().format("%m/%d").to_string()},"values":sums.iter().map(|(k,v)|(*k,v.delta)).collect::<BTreeMap<_,_>>(),"approximate":sums.iter().map(|(k,v)|(*k,v.delta_approximate)).collect::<BTreeMap<_,_>>()})}).collect();
        let analytics: Option<String> = db
            .query_row(
                "SELECT value FROM analytics WHERE handle=? ORDER BY at DESC LIMIT 1",
                [&selected],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        // Legacy snapshots used labels such as 4W; retain their exact 28-day window.
        let mut statement = db.prepare("WITH keyed AS (SELECT at,value,CASE lower(COALESCE(json_extract(value,'$.data.period_key'),json_extract(value,'$.data.period'))) WHEN '1d' THEN '1d' WHEN '7d' THEN '7d' WHEN '2w' THEN '14d' WHEN '14d' THEN '14d' WHEN '4w' THEN '28d' WHEN '28d' THEN '28d' WHEN '30d' THEN '30d' WHEN '3m' THEN '90d' WHEN '90d' THEN '90d' WHEN '1y' THEN '365d' WHEN '365d' THEN '365d' END AS period FROM analytics WHERE handle=?) SELECT period,value FROM keyed WHERE period IS NOT NULL AND at=(SELECT max(b.at) FROM keyed b WHERE b.period=keyed.period)").map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([&selected], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut analytics_periods = serde_json::Map::new();
        for row in rows {
            let (key, raw) = row.map_err(|e| e.to_string())?;
            analytics_periods.insert(
                key,
                serde_json::from_str::<Value>(&raw).map_err(|e| e.to_string())?,
            );
        }
        covered_analytics_periods(&mut analytics_periods, at);
        let read_setting = |prefix: &str| -> Result<Value, String> {
            let raw: Option<String> = db
                .query_row(
                    "SELECT value FROM settings WHERE key=?",
                    [format!("{prefix}:{selected}")],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?;
            raw.map(|value| serde_json::from_str(&value).map_err(|e| e.to_string()))
                .transpose()
                .map(|value| value.unwrap_or(Value::Null))
        };
        let creator = json!({"account":selected,"snapshot":read_setting("creator")?,"assumptions":read_setting("earnings")?,"calibration":read_setting("earnings-calibration")?});
        let mut statement = db.prepare(r#"
            WITH task_usage AS (
                SELECT j.id, j.action, j.state, json_extract(j.input,'$.stage') AS stage,
                    CASE WHEN j.action='rewrite_publish' THEN coalesce(json_extract(j.input,'$.mode'),'rewrite') END AS mode,
                    CASE WHEN j.action='rewrite_publish' AND json_extract(j.input,'$.mode')='reply'
                        THEN CASE WHEN json_extract(j.input,'$.scope')='notifications' THEN 'notifications' ELSE 'for_you' END END AS scope,
                    CASE WHEN j.action='capture_notifications' THEN coalesce(json_extract(j.input,'$.publication_mode'),'reply') END AS publication_mode,
                    coalesce(sum(json_extract(g.value,'$.usage.total_tokens')),0) AS tokens,
                    sum(CASE WHEN g.key IS NOT NULL AND json_extract(g.value,'$.usage.total_tokens') IS NULL THEN 1 ELSE 0 END)
                        + CASE WHEN j.action='rewrite_publish' AND count(g.key)=0 AND
                            (j.state IN ('rewriting','completed','failed') OR json_extract(j.input,'$.stage') IN ('ready','sending'))
                            THEN 1 ELSE 0 END AS missing_usage
                FROM jobs j LEFT JOIN json_each(j.input,'$.telemetry.generations') g
                WHERE j.account=? AND j.created_at<=? GROUP BY j.id
            )
            SELECT action,mode,scope,publication_mode,
                sum(state='completed' AND coalesce(stage,'')<>'skipped'),sum(state='failed'),sum(tokens),sum(missing_usage)
            FROM task_usage GROUP BY action,mode,scope,publication_mode ORDER BY action,mode,scope,publication_mode
        "#).map_err(|e|e.to_string())?;
        let task_stats = statement.query_map(params![selected,at], |r| Ok(json!({
            "action":r.get::<_,String>(0)?,
            "input":{"mode":r.get::<_,Option<String>>(1)?,"scope":r.get::<_,Option<String>>(2)?,"publication_mode":r.get::<_,Option<String>>(3)?},
            "completed":r.get::<_,i64>(4)?,"failed":r.get::<_,i64>(5)?,"tokens":r.get::<_,i64>(6)?,"missing_usage":r.get::<_,i64>(7)?
        }))).map_err(|e|e.to_string())?.collect::<Result<Vec<_>,_>>().map_err(|e|e.to_string())?;
        Ok(
            json!({"accounts":accounts,"account":selected,"posts":posts,"metrics":summarize(start,at),"series":series,"days":days,"start":start,"now":at,"analytics":analytics.and_then(|v|serde_json::from_str::<Value>(&v).ok()),"analytics_periods":analytics_periods,"creator":creator,"automation_block":read_setting("automation_block")?,"task_stats":task_stats}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn long_csv_covers_short_filters_without_stale_totals_fake_zeroes_or_fake_years() {
        let end=chrono::NaiveDate::from_ymd_opt(2026,10,30).unwrap();
        let start=end-chrono::Days::new(89);
        let series=(0..90).map(|index|json!({"date":(start+chrono::Days::new(index)).to_string(),"metrics":{"impressions":index+1,"likes":0,"engagements":2,"replies":if index==89{Value::Null}else{json!(1)},"new_follows":1,"unfollows":2}})).collect::<Vec<_>>();
        let wide=json!({"observed_at":2,"source":"https://x.com/i/account_analytics","data":{"period":"3M","period_key":"90d","series_source":"x_analytics_csv","verified_only":true,"series":series,"metrics":{"likes":{"value":999},"replies":{"value":999}}}});
        let mut periods=serde_json::Map::from_iter([("90d".into(),wide.clone()),("7d".into(),json!({"observed_at":1,"data":{"metrics":{"likes":{"value":999}}}})),("14d".into(),json!({"observed_at":3,"data":{"metrics":{"likes":{"value":777}}}}))]);
        let at=end.and_hms_opt(12,0,0).unwrap().and_utc().timestamp_millis();
        covered_analytics_periods(&mut periods,at);
        assert_eq!(periods["7d"]["data"]["series"].as_array().unwrap().len(),7);
        assert_eq!(periods["7d"]["data"]["metrics"]["impressions"]["value"],609);
        assert_eq!(periods["7d"]["data"]["metrics"]["likes"]["value"],0);
        assert!(periods["7d"]["data"]["metrics"].get("replies").is_none());
        assert_eq!(periods["7d"]["data"]["metrics"]["engagement_rate"]["value"],json!(14.0/609.0*100.0));
        assert_eq!(periods["7d"]["data"]["verified_only"],true);
        assert_eq!(periods["7d"]["data"]["derived_from"],"90d");
        assert_eq!(periods["14d"]["data"]["metrics"]["likes"]["value"],777);
        assert_eq!(periods["30d"]["data"]["metrics"]["new_follows"]["value"],30);
        assert_eq!(periods["28d"]["data"]["series"].as_array().unwrap().len(),28);
        assert_eq!(periods["1d"]["data"]["series"][0]["date"],"2026-10-30");
        assert!(!periods.contains_key("365d"));
        let mut gap=wide;
        gap["data"]["series"].as_array_mut().unwrap().remove(88);
        let mut incomplete=serde_json::Map::from_iter([("90d".into(),gap)]);
        covered_analytics_periods(&mut incomplete,at+86400000);
        assert!(!incomplete.contains_key("7d"),"gaps never become complete short windows");
        assert!(!incomplete.contains_key("1d"),"yesterday never becomes today's metric");
    }
    fn reference_window(points: &[Point], start: i64, end: i64) -> Window {
        let eligible: Vec<_> = points.iter().filter(|p| p.at <= end).collect();
        let latest = eligible.last().copied();
        let mut base = eligible
            .iter()
            .rfind(|p| p.at < start)
            .copied()
            .or_else(|| eligible.first().copied());
        if let Some(last) = latest {
            if let Some(change) = eligible
                .iter()
                .rfind(|p| p.count.approximate != last.count.approximate)
            {
                base = eligible.iter().find(|p| p.at > change.at).copied();
            }
        }
        let pair = base
            .zip(latest)
            .filter(|(a, b)| b.at >= start && b.at > a.at);
        Window {
            value: latest.map(|p| p.count.value),
            approximate: latest.is_some_and(|p| p.count.approximate),
            delta: pair.map(|(a, b)| b.count.value - a.count.value),
            delta_approximate: pair
                .is_some_and(|(a, b)| a.count.approximate || b.count.approximate),
            baseline_at: pair.map(|(a, _)| a.at),
            observed_at: latest.map(|p| p.at),
        }
    }

    #[test]
    fn indexed_windows_preserve_all_legacy_boundaries_and_precision_resets() {
        for len in 0..=6 {
            for mask in 0..(1 << len) {
                let mut points: Vec<Point> = Vec::new();
                for i in 0..len {
                    let approximate = mask & (1 << i) != 0;
                    let precision_start = points
                        .last()
                        .filter(|last| last.count.approximate == approximate)
                        .map_or(i, |last| last.precision_start);
                    points.push(Point {
                        at: i as i64 * 2,
                        precision_start,
                        count: Count {
                            value: (i as i64 - 2).pow(2),
                            approximate,
                            raw: String::new(),
                        },
                    });
                }
                for start in -1..=13 {
                    for end in -1..=13 {
                        assert_eq!(
                            serde_json::to_value(window(&points, start, end)).unwrap(),
                            serde_json::to_value(reference_window(&points, start, end)).unwrap(),
                            "len={len} mask={mask} start={start} end={end}"
                        );
                    }
                }
            }
        }
    }
}

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
                json!({"accounts":[],"account":null,"posts":[],"series":[],"metrics":{},"days":days,"analytics":null}),
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
        Ok(
            json!({"accounts":accounts,"account":selected,"posts":posts,"metrics":summarize(start,at),"series":series,"days":days,"start":start,"now":at,"analytics":analytics.and_then(|v|serde_json::from_str::<Value>(&v).ok()),"analytics_periods":analytics_periods,"creator":creator,"automation_block":read_setting("automation_block")?}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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

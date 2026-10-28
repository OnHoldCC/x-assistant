use super::*;
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Client, Url,
};
use std::{future::Future, sync::Arc, time::Duration};

const PERIOD: i64 = 300_000;
const BODY_LIMIT: usize = 2_000_000;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Template {
    kind: String,
    url: String,
    method: String,
}

fn request_kind(raw: &str) -> Result<&'static str, String> {
    let url = Url::parse(raw).map_err(|_| "X 接口地址无效")?;
    if raw.len() > 32000
        || url.scheme() != "https"
        || !matches!(url.host_str(), Some("x.com" | "twitter.com"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return Err("只允许已学习的 X 只读接口".into());
    }
    let parts: Vec<_> = url.path().split('/').collect();
    if parts.len() != 6
        || parts[1..4] != ["i", "api", "graphql"]
        || parts[4].is_empty()
        || !parts[4]
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("X 接口路径无效".into());
    }
    match parts[5] {
        "UserByScreenName" | "UserByRestId" => Ok("profile"),
        "UserTweets" => Ok("posts"),
        // shortcut: unknown X schemas require a new adapter; never infer a metric from unrelated numbers.
        op if (op.starts_with("Get") || op.starts_with("Fetch"))
            && op.to_ascii_lowercase().contains("analytics") =>
        {
            Ok("analytics")
        }
        op if (op.starts_with("Get") || op.starts_with("Fetch"))
            && ["Creator", "Monetization", "Eligibility", "Rewards"]
                .iter()
                .any(|s| op.contains(s)) =>
        {
            Ok("creator")
        }
        _ => Err("不支持此 X 只读接口".into()),
    }
}

fn credentials(value: &Value, uid: &str) -> Result<HeaderMap, String> {
    let values = value
        .as_object()
        .filter(|v| v.len() <= 4)
        .ok_or("登录凭证无效")?;
    let mut headers = HeaderMap::new();
    for (key, value) in values {
        if !["authorization", "cookie", "x-csrf-token", "user-agent"].contains(&key.as_str()) {
            return Err("登录凭证字段无效".into());
        }
        let value = value
            .as_str()
            .filter(|v| !v.is_empty() && v.len() <= 16000)
            .ok_or("登录凭证无效")?;
        headers.insert(
            HeaderName::from_bytes(key.as_bytes()).map_err(|_| "登录凭证无效")?,
            HeaderValue::from_str(value).map_err(|_| "登录凭证无效")?,
        );
    }
    if !headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.starts_with("Bearer ") && v.len() > 7)
    {
        return Err("缺少 X 认证凭证".into());
    }
    let cookie = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .ok_or("缺少 X Cookie")?;
    let mut cookies = HashMap::new();
    for part in cookie.split(';') {
        let (key, value) = part.trim().split_once('=').ok_or("X Cookie 无效")?;
        if !["auth_token", "ct0", "twid"].contains(&key)
            || value.is_empty()
            || !value.bytes().all(|b| b.is_ascii_graphic())
            || cookies.insert(key, value).is_some()
        {
            return Err("X Cookie 无效".into());
        }
    }
    if cookies.len() != 3
        || cookies.get("ct0").copied() != headers.get("x-csrf-token").and_then(|v| v.to_str().ok())
        || !cookies.get("twid").is_some_and(|v| {
            *v == format!("u%3D{uid}") || *v == format!("u%3d{uid}") || *v == format!("u={uid}")
        })
    {
        return Err("X Cookie 与 UID 或 CSRF 不匹配".into());
    }
    headers.insert("referer", HeaderValue::from_static("https://x.com/"));
    headers.insert(
        "x-twitter-auth-type",
        HeaderValue::from_static("OAuth2Session"),
    );
    headers.insert("x-twitter-active-user", HeaderValue::from_static("yes"));
    Ok(headers)
}

impl Store {
    pub fn has_x_session(&self, account: &str) -> Result<bool, String> {
        self.lock()?.query_row("SELECT EXISTS(SELECT 1 FROM x_sessions s JOIN accounts a ON a.uid=s.owner_uid WHERE a.handle=?)", [account], |r| r.get(0)).map_err(|e|e.to_string())
    }

    pub fn learn_x_session(&self, input: &Value, at: i64) -> Result<Value, String> {
        let uid = input["uid"].as_str().ok_or("缺少 X UID")?;
        identities::x_uid(uid)?;
        let account = handle(input["handle"].as_str().ok_or("缺少 X 账号")?)?;
        credentials(&input["headers"], uid)?;
        let templates: Vec<Template> =
            serde_json::from_value(input["templates"].clone()).map_err(|_| "接口模板无效")?;
        if templates.is_empty() || templates.len() > 4 {
            return Err("接口模板数量无效".into());
        }
        let mut kinds = std::collections::HashSet::new();
        for item in &templates {
            if item.method != "GET"
                || request_kind(&item.url)? != item.kind
                || !kinds.insert(item.kind.as_str())
            {
                return Err("只接受无重复的 X 只读接口".into());
            }
            let url = Url::parse(&item.url).map_err(|_| "X 接口地址无效")?;
            let vars = url
                .query_pairs()
                .find(|(k, _)| k == "variables")
                .map(|(_, v)| serde_json::from_str::<Value>(&v))
                .transpose()
                .map_err(|_| "接口参数无效")?
                .unwrap_or(json!({}));
            if vars.get("userId").is_some_and(|v| v.as_str() != Some(uid))
                || vars.get("screen_name").is_some_and(|v| {
                    v.as_str().and_then(|v| handle(v).ok()).as_deref() != Some(&account)
                })
                || vars.get("cursor").is_some_and(|v| !v.is_null())
            {
                return Err("接口账号或初始分页不匹配".into());
            }
        }
        if !kinds.contains("profile") {
            return Err("缺少当前账号的资料接口".into());
        }
        self.bind_account_uid(uid, &account, at)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE jobs SET state='failed',error='登录态已更新，请重新采集',updated_at=? WHERE account=? AND action IN ('capture','capture_analytics') AND state IN ('queued','running')",params![at,account]).map_err(|e|e.to_string())?;
        tx.execute("DELETE FROM request_templates WHERE owner_uid=?", [uid])
            .map_err(|e| e.to_string())?;
        for item in &templates {
            tx.execute(
                "INSERT INTO request_templates VALUES(?,?,?,?)",
                params![uid, item.kind, serde_json::to_string(item).unwrap(), at],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.execute("INSERT INTO x_sessions(owner_uid,headers,revision,state,next_poll) VALUES(?,?,?,'active',?) ON CONFLICT(owner_uid) DO UPDATE SET headers=excluded.headers,revision=excluded.revision,state='active',next_poll=excluded.next_poll,error=''",params![uid,input["headers"].to_string(),Uuid::new_v4().to_string(),at]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"uid":uid,"account":account,"capture_interval_seconds":300}))
    }

    pub fn refresh_x_session(&self, input: &Value, at: i64) -> Result<Value, String> {
        let uid = input["uid"].as_str().ok_or("缺少 X UID")?;
        identities::x_uid(uid)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let raw: String = tx
            .query_row(
                "SELECT headers FROM x_sessions WHERE owner_uid=?",
                [uid],
                |r| r.get(0),
            )
            .map_err(|_| "请重新连接以学习 X 接口")?;
        let mut headers: Value = serde_json::from_str(&raw).map_err(|_| "登录凭证无效")?;
        headers["cookie"] = input["cookie"].clone();
        headers["x-csrf-token"] = input["csrf"].clone();
        credentials(&headers, uid)?;
        // Identical browser cookies cannot revive credentials rejected by X.
        if headers.to_string() != raw {
            tx.execute("UPDATE x_sessions SET headers=?,revision=?,state=CASE WHEN state='limited' THEN state ELSE 'active' END,next_poll=CASE WHEN state='limited' THEN next_poll ELSE ? END,error=CASE WHEN state='limited' THEN error ELSE '' END WHERE owner_uid=?",params![headers.to_string(),Uuid::new_v4().to_string(),at,uid]).map_err(|e|e.to_string())?;
            tx.execute("UPDATE jobs SET state='failed',error='登录态已更新，请重新采集',updated_at=? WHERE account=(SELECT handle FROM accounts WHERE uid=?) AND client='backend' AND state='running'",params![at,uid]).map_err(|e|e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"updated":true}))
    }

    pub fn forget_x_session(&self, account: &str, at: i64) -> Result<Value, String> {
        let account = self.account_handle(account)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM request_templates WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?)",[&account]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE x_sessions SET headers='{}',revision=?,state='revoked',error='账号已断开，请重新连接',next_poll=0 WHERE owner_uid=(SELECT uid FROM accounts WHERE handle=?)",params![Uuid::new_v4().to_string(),account]).map_err(|e|e.to_string())?;
        tx.execute("UPDATE jobs SET state='failed',error='账号已断开',updated_at=? WHERE account=? AND action IN ('capture','capture_analytics') AND state IN ('queued','running')",params![at,account]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"disconnected":true}))
    }
}

struct Session {
    uid: String,
    account: String,
    revision: String,
    headers: Value,
    templates: Vec<Template>,
    job: String,
    action: String,
}

impl Store {
    fn next_x_poll(&self, at: i64) -> Result<Option<Session>, String> {
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("UPDATE jobs SET state='failed',error='后台采集已中断，将自动重试',updated_at=? WHERE client='backend' AND state='running' AND updated_at<?",params![at,at-120_000]).map_err(|e|e.to_string())?;
        let row: Option<(String,String,String,String)> = tx.query_row("SELECT s.owner_uid,a.handle,s.revision,s.headers FROM x_sessions s JOIN accounts a ON a.uid=s.owner_uid WHERE s.state IN ('active','limited') AND s.next_poll<=? AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.account=a.handle AND j.state='running') ORDER BY s.next_poll LIMIT 1",[at],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(|e|e.to_string())?;
        let Some((uid, account, revision, headers)) = row else {
            return Ok(None);
        };
        let templates = {
            let mut stmt = tx
                .prepare("SELECT value FROM request_templates WHERE owner_uid=? ORDER BY operation")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([&uid], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            rows.map(|r| {
                serde_json::from_str::<Template>(&r.map_err(|e| e.to_string())?)
                    .map_err(|_| "接口模板无效".to_string())
            })
            .collect::<Result<Vec<_>, _>>()?
        };
        let job: Option<(String,String)> = tx.query_row("SELECT id,action FROM jobs WHERE account=? AND state='queued' AND action IN ('capture','capture_analytics') ORDER BY created_at LIMIT 1",[&account],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(|e|e.to_string())?;
        let (job, action) = job.unwrap_or_else(|| (Uuid::new_v4().to_string(), "capture".into()));
        tx.execute("INSERT INTO jobs(id,account,action,state,client,created_at,updated_at) VALUES(?,?,?,'running','backend',?,?) ON CONFLICT(id) DO UPDATE SET state='running',client='backend',updated_at=excluded.updated_at",params![job,account,action,at,at]).map_err(|e|e.to_string())?;
        tx.execute(
            "UPDATE x_sessions SET next_poll=? WHERE owner_uid=?",
            params![at + PERIOD, uid],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(Some(Session {
            uid,
            account,
            revision,
            headers: serde_json::from_str(&headers).map_err(|_| "登录凭证无效")?,
            templates,
            job,
            action,
        }))
    }

    fn finish_x_poll(
        &self,
        session: &Session,
        failure: Option<&Failure>,
        warning: &str,
        at: i64,
    ) -> Result<(), String> {
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        let error = failure.map(|e| e.message.as_str()).unwrap_or(warning);
        let state = match failure {
            Some(f) if f.stop => "expired",
            Some(f) if f.rate_limited => "limited",
            _ => "active",
        };
        let delay = failure.map_or(PERIOD, |f| f.retry_ms.max(PERIOD));
        let changed = tx.execute("UPDATE x_sessions SET state=?,error=?,last_poll=?,next_poll=MAX(next_poll,?) WHERE owner_uid=? AND revision=?",params![state,error,at,at+delay,session.uid,session.revision]).map_err(|e|e.to_string())?;
        if changed != 0 {
            tx.execute("UPDATE jobs SET state=?,error=?,updated_at=? WHERE id=? AND state='running' AND client='backend'",params![if failure.is_none() && warning.is_empty(){"completed"}else{"failed"},if error.is_empty(){None}else{Some(error)},at,session.job]).map_err(|e|e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[derive(Debug)]
struct Failure {
    message: String,
    stop: bool,
    retry_ms: i64,
    rate_limited: bool,
}
impl From<String> for Failure {
    fn from(message: String) -> Self {
        Self {
            message,
            stop: false,
            retry_ms: PERIOD,
            rate_limited: false,
        }
    }
}
fn stopped(message: &str) -> Failure {
    Failure {
        message: message.into(),
        stop: true,
        retry_ms: PERIOD,
        rate_limited: false,
    }
}

async fn fetch(
    client: Client,
    template: Template,
    headers: Value,
    uid: String,
) -> Result<Value, Failure> {
    if template.method != "GET" || request_kind(&template.url)? != template.kind {
        return Err(stopped("接口模板失效，请重新连接"));
    }
    let mut response = client
        .get(&template.url)
        .headers(credentials(&headers, &uid)?)
        .send()
        .await
        .map_err(|_| Failure::from("X 请求失败，稍后自动重试".to_string()))?;
    let status = response.status().as_u16();
    check_status(status, &template.kind, response.headers(), now())?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| Failure::from("读取 X 响应失败".to_string()))?
    {
        if bytes.len() + chunk.len() > BODY_LIMIT {
            return Err("X 响应过大，采集已停止".to_string().into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|_| Failure::from("X 响应格式无效，请重新连接".to_string()))?;
    check_body(value)
}

fn check_status(status: u16, kind: &str, headers: &HeaderMap, at: i64) -> Result<(), Failure> {
    if status == 401 || status == 403 && kind == "profile" {
        return Err(stopped("X 登录态已失效或无权访问，请重新登录并连接"));
    }
    if status == 403 {
        return Err("当前账号无权访问该 X 数据，已保留上次数据"
            .to_string()
            .into());
    }
    if status == 429 {
        let seconds = headers
            .get("retry-after")
            .and_then(|s| s.to_str().ok())
            .and_then(|s| {
                s.parse::<i64>().ok().or_else(|| {
                    chrono::DateTime::parse_from_rfc2822(s)
                        .ok()
                        .map(|date| date.timestamp() - at / 1000)
                })
            })
            .or_else(|| {
                headers
                    .get("x-rate-limit-reset")
                    .and_then(|s| s.to_str().ok())
                    .and_then(|s| s.parse::<i64>().ok())
                    .map(|end| end.saturating_sub(at / 1000))
            })
            .unwrap_or(900)
            .clamp(300, 86400);
        return Err(Failure {
            message: "X 请求限流，已暂停并延后重试".into(),
            stop: false,
            retry_ms: seconds * 1000,
            rate_limited: true,
        });
    }
    if status == 404 {
        return Err(Failure {
            message: "X 接口已变化，请重新连接以学习接口".into(),
            stop: kind == "profile",
            retry_ms: PERIOD,
            rate_limited: false,
        });
    }
    if !(200..300).contains(&status) {
        return Err(format!("X 返回 HTTP {status}，稍后自动重试").into());
    }
    Ok(())
}

fn check_body(value: Value) -> Result<Value, Failure> {
    if let Some(errors) = value["errors"].as_array().filter(|e| !e.is_empty()) {
        if errors
            .iter()
            .any(|e| matches!(e["code"].as_i64(), Some(32 | 89 | 135 | 215 | 326)))
        {
            return Err(stopped("X 登录态已失效，请重新登录并连接"));
        }
        if errors.iter().any(|e| e["code"] == 88) {
            return Err(Failure {
                message: "X 请求限流，已延后重试".into(),
                stop: false,
                retry_ms: 900_000,
                rate_limited: true,
            });
        }
        return Err("X 接口返回错误，请重新连接后重试".to_string().into());
    }
    Ok(value)
}

fn visit<'a>(value: &'a Value, depth: usize, nodes: &mut usize, out: &mut Vec<&'a Value>) {
    if depth > 32 || *nodes >= 100000 {
        return;
    }
    *nodes += 1;
    if value.is_object() {
        out.push(value);
    }
    match value {
        Value::Array(items) => {
            for item in items {
                visit(item, depth + 1, nodes, out);
            }
        }
        Value::Object(items) => {
            for item in items.values() {
                visit(item, depth + 1, nodes, out);
            }
        }
        _ => {}
    }
}
fn objects(value: &Value) -> Vec<&Value> {
    let mut out = Vec::new();
    visit(value, 0, &mut 0, &mut out);
    out
}
fn user_id(user: &Value) -> Option<&str> {
    user["rest_id"].as_str().or_else(|| user["id_str"].as_str())
}
fn user_handle(user: &Value) -> Option<String> {
    user.pointer("/core/screen_name")
        .or_else(|| user.pointer("/legacy/screen_name"))
        .or_else(|| user.get("screen_name"))
        .and_then(Value::as_str)
        .and_then(|v| handle(v).ok())
}
fn count(value: &Value) -> Option<Count> {
    let value = value
        .as_i64()
        .or_else(|| value.as_str().and_then(|v| v.parse::<i64>().ok()))?;
    (0..=1_000_000_000_000_000).contains(&value).then(|| Count {
        value,
        approximate: false,
        raw: value.to_string(),
    })
}
fn profile_snapshot(value: &Value, session: &Session) -> Result<Snapshot, Failure> {
    let nodes = objects(value);
    let user = nodes
        .into_iter()
        .find(|v| {
            user_id(v) == Some(&session.uid) && user_handle(v).as_deref() == Some(&session.account)
        })
        .ok_or_else(|| stopped("X 资料与已绑定 UID 不匹配，请重新连接"))?;
    let mut profile = BTreeMap::new();
    for (name, key) in [
        ("followers", "followers_count"),
        ("following", "friends_count"),
    ] {
        if let Some(c) = count(&user["legacy"][key]).or_else(|| count(&user[key])) {
            profile.insert(name.into(), c);
        }
    }
    Ok(Snapshot {
        uid: None,
        handle: session.account.clone(),
        source: format!("https://x.com/{}", session.account),
        profile,
        posts: Vec::new(),
        analytics: None,
        creator: None,
    })
}
fn parse_posts(value: &Value, session: &Session) -> Result<Vec<Post>, String> {
    let mut posts = BTreeMap::new();
    for tweet in objects(value) {
        let legacy = &tweet["legacy"];
        if legacy["user_id_str"].as_str() != Some(&session.uid)
            || legacy.get("retweeted_status_result").is_some()
        {
            continue;
        }
        let Some(id) = user_id(tweet).filter(|id| identities::x_uid(id).is_ok()) else {
            continue;
        };
        let Some(text) = tweet
            .pointer("/note_tweet/note_tweet_results/result/text")
            .or_else(|| legacy.get("full_text"))
            .and_then(Value::as_str)
        else {
            continue;
        };
        let mut metrics = BTreeMap::new();
        for (name, key) in [
            ("likes", "favorite_count"),
            ("replies", "reply_count"),
            ("reposts", "retweet_count"),
            ("bookmarks", "bookmark_count"),
        ] {
            if let Some(c) = count(&legacy[key]) {
                metrics.insert(name.into(), c);
            }
        }
        if let Some(c) = count(&tweet["views"]["count"]) {
            metrics.insert("views".into(), c);
        }
        let created_at = legacy["created_at"]
            .as_str()
            .map(|s| {
                chrono::DateTime::parse_from_str(s, "%a %b %d %H:%M:%S %z %Y")
                    .map(|d| d.to_rfc3339())
                    .map_err(|_| "X 帖子时间格式已变化".to_string())
            })
            .transpose()?;
        posts.insert(
            id.to_string(),
            Post {
                id: id.into(),
                author: session.account.clone(),
                text: text.into(),
                created_at,
                metrics,
            },
        );
    }
    if posts.is_empty()
        && !objects(value)
            .iter()
            .any(|v| v.get("instructions").is_some_and(Value::is_array))
    {
        return Err("X 帖子接口结构已变化，请重新连接".into());
    }
    Ok(posts.into_values().rev().take(50).collect())
}

async fn collect<F, Fut>(
    store: &Store,
    session: &Session,
    mut request: F,
) -> Result<String, Failure>
where
    F: FnMut(Template, Value, String) -> Fut,
    Fut: Future<Output = Result<Value, Failure>>,
{
    let current = || -> Result<(), Failure> {
        let valid:bool=store.lock()?.query_row("SELECT EXISTS(SELECT 1 FROM x_sessions WHERE owner_uid=? AND revision=? AND state IN ('active','limited'))",params![session.uid,session.revision],|r|r.get(0)).map_err(|e|e.to_string())?;
        if valid {
            Ok(())
        } else {
            Err("登录态已更新或断开，本次采集已取消".to_string().into())
        }
    };
    current()?;
    let template = session
        .templates
        .iter()
        .find(|t| t.kind == "profile")
        .ok_or_else(|| stopped("缺少资料接口，请重新连接"))?;
    let value = request(
        template.clone(),
        session.headers.clone(),
        session.uid.clone(),
    )
    .await?;
    let mut snapshot = profile_snapshot(&value, session)?;
    let mut warnings = Vec::new();
    for template in session.templates.iter().filter(|t| t.kind != "profile") {
        current()?;
        let value = match request(
            template.clone(),
            session.headers.clone(),
            session.uid.clone(),
        )
        .await
        {
            Ok(value) => value,
            Err(error) if !error.stop && !error.rate_limited => {
                warnings.push(error.message);
                continue;
            }
            Err(error) => return Err(error),
        };
        match template.kind.as_str() {
            "posts" => match parse_posts(&value, session) {
                Ok(posts) => snapshot.posts = posts,
                Err(error) => warnings.push(error),
            },
            "analytics" => {
                if let Some(node) = objects(&value)
                    .into_iter()
                    .find(|v| v["metrics"].is_object() && v["period"].is_string())
                {
                    let mut node = node.clone();
                    if node
                        .get("account")
                        .is_some_and(|v| v.as_str() != Some(&session.account))
                    {
                        warnings.push("X 分析账号不匹配，数据未保存".into());
                        continue;
                    }
                    node["account"] = json!(session.account);
                    match super::ingest::validate_analytics(&mut node, &session.account) {
                        Ok(()) => snapshot.analytics = Some(node),
                        Err(_) => warnings.push("X 分析接口格式无效，已保留上次分析数据".into()),
                    }
                } else {
                    warnings.push("X 分析接口结构暂不支持，已保留上次分析数据".into());
                }
            }
            "creator" => {
                if let Some(node) = objects(&value).into_iter().find(|v| {
                    v["state"]
                        .as_str()
                        .is_some_and(|s| ["ineligible", "eligible", "enrolled"].contains(&s))
                }) {
                    let mut node = node.clone();
                    if node
                        .get("account")
                        .is_some_and(|v| v.as_str() != Some(&session.account))
                    {
                        warnings.push("X 创作者账号不匹配，数据未保存".into());
                        continue;
                    }
                    node["account"] = json!(session.account);
                    match super::operations::validate_creator(&node, &session.account) {
                        Ok(()) => snapshot.creator = Some(node),
                        Err(_) => {
                            warnings.push("X 创作者接口格式无效，已保留上次创作者数据".into())
                        }
                    }
                } else {
                    warnings.push("X 创作者接口结构暂不支持，已保留上次创作者数据".into());
                }
            }
            _ => {}
        }
    }
    if session.action == "capture_analytics" && snapshot.analytics.is_none() {
        warnings.push("未取得官方分析，请重新连接以学习分析接口".into());
    }
    store.ingest_checked(snapshot, now(), Some((&session.uid, &session.revision)))?;
    Ok(warnings.join("；"))
}

pub async fn run(store: Arc<Store>) {
    let client = match Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(15))
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            let _ = store.record_event("error", "capture", None, "后台 HTTP 客户端初始化失败");
            return;
        }
    };
    run_with(store, move |t, h, u| fetch(client.clone(), t, h, u)).await;
}

async fn run_with<F, Fut>(store: Arc<Store>, mut request: F)
where
    F: FnMut(Template, Value, String) -> Fut,
    Fut: Future<Output = Result<Value, Failure>>,
{
    let mut tick = tokio::time::interval(Duration::from_secs(2));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        match store.next_x_poll(now()) {
            Ok(Some(session)) => {
                let outcome = collect(&store, &session, &mut request).await;
                let (failure, warning) = match &outcome {
                    Ok(warning) => (None, warning.as_str()),
                    Err(error) => (Some(error), ""),
                };
                let _ = store.finish_x_poll(&session, failure, warning, now());
                let _ = store.record_event(
                    if failure.is_some() || !warning.is_empty() {
                        "error"
                    } else {
                        "info"
                    },
                    "capture",
                    Some(&session.account),
                    if failure.is_some() {
                        "后台采集失败，请查看任务详情"
                    } else if !warning.is_empty() {
                        "部分数据未取得，请查看任务详情"
                    } else {
                        "后台采集数据已更新"
                    },
                );
            }
            Ok(None) => {}
            Err(_) => {
                let _ = store.record_event("error", "capture", None, "后台采集调度失败");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "started explicitly by test/admin-browser.mjs"]
    async fn browser_fixture() {
        let home =
            std::path::PathBuf::from(std::env::var("ONHOLD_FIXTURE_HOME").expect("fixture home"));
        let port: u16 = std::env::var("ONHOLD_FIXTURE_PORT")
            .expect("fixture port")
            .parse()
            .unwrap();
        let store = Arc::new(Store::open(home.join("onhold-admin.sqlite3")).unwrap());
        let fixtures: Value =
            serde_json::from_str(include_str!("../../../test/fixtures/x-session.json")).unwrap();
        tokio::spawn(run_with(store.clone(), move |template, _, _| {
            std::future::ready(Ok(fixtures[&template.kind].clone()))
        }));
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", port))
            .await
            .unwrap();
        let assets = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../app/dist");
        axum::serve(listener, crate::http::router(store, assets, port).unwrap())
            .await
            .unwrap();
    }

    const UID: &str = "1900000000000000123";
    fn upload() -> Value {
        json!({"uid":UID,"handle":"Example","headers":{"authorization":"Bearer test-only","cookie":format!("auth_token=test-only; ct0=test-csrf; twid=u%3D{UID}"),"x-csrf-token":"test-csrf"},"templates":[{"kind":"profile","url":format!("https://x.com/i/api/graphql/observed-id/UserByRestId?variables=%7B%22userId%22%3A%22{UID}%22%7D"),"method":"GET"},{"kind":"posts","url":"https://x.com/i/api/graphql/observed-id/UserTweets","method":"GET"}]})
    }
    fn profile() -> Value {
        json!({"data":{"user":{"result":{"rest_id":UID,"core":{"screen_name":"Example"},"legacy":{"followers_count":120,"friends_count":3}}}}})
    }
    fn tweets() -> Value {
        json!({"data":{"instructions":[{"entries":[{"rest_id":"1911111111111111111","legacy":{"user_id_str":UID,"full_text":"owned post","favorite_count":0,"reply_count":2,"created_at":"Wed Oct 28 02:00:00 +0000 2026"},"views":{"count":"90"}},{"rest_id":"1911111111111111112","legacy":{"user_id_str":"999","full_text":"other account"}}]}]}})
    }
    fn db() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path().join("test.db")).unwrap();
        (dir, store)
    }

    #[test]
    fn network_errors_stop_expired_credentials_and_honor_retry_headers_without_leaking_bodies() {
        let mut headers = HeaderMap::new();
        let at = now();
        assert!(check_status(401, "posts", &headers, at).unwrap_err().stop);
        assert!(check_status(403, "profile", &headers, at).unwrap_err().stop);
        assert!(
            !check_status(403, "analytics", &headers, at)
                .unwrap_err()
                .stop
        );
        assert!(check_status(404, "profile", &headers, at).unwrap_err().stop);
        assert!(!check_status(503, "profile", &headers, at).unwrap_err().stop);
        headers.insert("retry-after", HeaderValue::from_static("1200"));
        let error = check_status(429, "posts", &headers, at).unwrap_err();
        assert!(error.rate_limited);
        assert_eq!(error.retry_ms, 1_200_000);
        headers.clear();
        headers.insert(
            "x-rate-limit-reset",
            HeaderValue::from_str(&(at / 1000 + 1800).to_string()).unwrap(),
        );
        assert_eq!(
            check_status(429, "posts", &headers, at)
                .unwrap_err()
                .retry_ms,
            1_800_000
        );
        headers.clear();
        headers.insert(
            "retry-after",
            HeaderValue::from_str(
                &chrono::DateTime::from_timestamp(at / 1000 + 600, 0)
                    .unwrap()
                    .to_rfc2822(),
            )
            .unwrap(),
        );
        assert_eq!(
            check_status(429, "posts", &headers, at)
                .unwrap_err()
                .retry_ms,
            600_000
        );
        let error =
            check_body(json!({"errors":[{"code":89,"message":"server echoed test-only cookie"}]}))
                .unwrap_err();
        assert!(error.stop);
        assert!(!error.message.contains("test-only"));
        assert!(
            check_body(json!({"errors":[{"code":88}]}))
                .unwrap_err()
                .rate_limited
        );
        assert!(check_body(json!({"data":{}})).is_ok());
    }

    #[test]
    fn upload_validates_credentials_read_operations_and_owner_without_exposing_secrets() {
        let (_dir, store) = db();
        for bad_url in [
            "https://evil.example/i/api/graphql/id/UserTweets",
            "http://x.com/i/api/graphql/id/UserTweets",
            "https://x.com:8443/i/api/graphql/id/UserTweets",
            "https://x.com/i/api/graphql/id/CreateTweet",
            "https://user:pass@x.com/i/api/graphql/id/UserTweets",
            "https://x.com/i/api/graphql/id/UserTweets#fragment",
        ] {
            let mut input = upload();
            input["templates"][1]["url"] = json!(bad_url);
            assert!(store.learn_x_session(&input, 1).is_err());
        }
        for (key, value) in [
            ("cookie", "auth_token=x; ct0=y; twid=u%3D999"),
            ("authorization", "Bearer x\r\ninjected:secret"),
            ("x-csrf-token", "mismatch"),
            ("host", "evil.example"),
        ] {
            let mut input = upload();
            input["headers"][key] = json!(value);
            assert!(store.learn_x_session(&input, 1).is_err());
        }
        for method in ["POST", "DELETE"] {
            let mut input = upload();
            input["templates"][0]["method"] = json!(method);
            assert!(store.learn_x_session(&input, 1).is_err());
        }
        let mut input = upload();
        input["templates"][0]["url"] = json!(
            "https://x.com/i/api/graphql/id/UserByRestId?variables=%7B%22userId%22%3A%22999%22%7D"
        );
        assert!(store.learn_x_session(&input, 1).is_err());
        assert!(store.dashboard(None, 7, 1).unwrap()["accounts"]
            .as_array()
            .unwrap()
            .is_empty());
        let output = store.learn_x_session(&upload(), 1).unwrap();
        assert_eq!(output["uid"], UID);
        let visible = format!(
            "{}{}{}",
            output,
            store.connections(2).unwrap(),
            store.jobs().unwrap()
        );
        for secret in ["test-only", "test-csrf", "auth_token", "authorization"] {
            assert!(!visible.contains(secret));
        }
        assert_eq!(store.account_handle(UID).unwrap(), "example");
    }

    #[tokio::test]
    async fn backend_collects_without_browser_and_resumes_after_reopen() {
        let (dir, store) = db();
        let at = now();
        store.learn_x_session(&upload(), at).unwrap();
        let session = store.next_x_poll(at).unwrap().unwrap();
        assert!(store.next_x_poll(at).unwrap().is_none());
        let result = collect(&store, &session, |template, _, _| async move {
            Ok(if template.kind == "profile" {
                profile()
            } else {
                tweets()
            })
        })
        .await
        .unwrap();
        assert_eq!(result, "");
        store.finish_x_poll(&session, None, "", at).unwrap();
        let data = store.dashboard(Some("example"), 7, now()).unwrap();
        assert_eq!(data["metrics"]["followers"]["value"], 120);
        assert_eq!(data["posts"].as_array().unwrap().len(), 1);
        assert_eq!(data["posts"][0]["metrics"]["likes"]["value"], 0);
        assert_eq!(data["posts"][0]["metrics"]["views"]["value"], 90);
        assert!(store.next_x_poll(at + PERIOD - 1).unwrap().is_none());
        drop(store);
        let store = Store::open(dir.path().join("test.db")).unwrap();
        assert!(store.next_x_poll(at + PERIOD).unwrap().is_some());
    }

    #[test]
    fn manual_jobs_use_backend_and_rate_limits_cannot_be_bypassed_by_enqueue() {
        let (_dir, store) = db();
        let at = now();
        store.learn_x_session(&upload(), at).unwrap();
        let job = store.enqueue("example", at).unwrap();
        assert!(store
            .claim(&Uuid::new_v4().to_string(), "example", at)
            .unwrap()
            .is_null());
        assert!(!store.schedule_capture("example", at + PERIOD).unwrap());
        let session = store.next_x_poll(at).unwrap().unwrap();
        assert_eq!(session.job, job["id"]);
        let limit = Failure {
            message: "X 请求限流，已延后重试".into(),
            stop: false,
            retry_ms: 900_000,
            rate_limited: true,
        };
        store.finish_x_poll(&session, Some(&limit), "", at).unwrap();
        store.enqueue("example", at + 1).unwrap();
        assert!(store.next_x_poll(at + PERIOD).unwrap().is_none());
        assert!(store.next_x_poll(at + 900_000).unwrap().is_some());
    }

    #[tokio::test]
    async fn revoked_or_replaced_credentials_cannot_commit_inflight_results() {
        let (_dir, store) = db();
        let at = now();
        store.learn_x_session(&upload(), at).unwrap();
        let old = store.next_x_poll(at).unwrap().unwrap();
        store.forget_x_session("example", at + 1).unwrap();
        assert!(collect(&store, &old, |t, _, _| async move {
            Ok(if t.kind == "profile" {
                profile()
            } else {
                tweets()
            })
        })
        .await
        .is_err());
        assert!(store.dashboard(Some("example"), 7, now()).unwrap()["posts"]
            .as_array()
            .unwrap()
            .is_empty());
        assert!(store.next_x_poll(at + PERIOD).unwrap().is_none());
        let raw: String = store
            .lock()
            .unwrap()
            .query_row("SELECT headers FROM x_sessions", [], |r| r.get(0))
            .unwrap();
        assert_eq!(raw, "{}");
        let count: i64 = store
            .lock()
            .unwrap()
            .query_row("SELECT count(*) FROM request_templates", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        assert!(store.enqueue("example", at + 2).is_err());
        store.learn_x_session(&upload(), at + 3).unwrap();
        assert!(collect(&store, &old, |t, _, _| async move {
            Ok(if t.kind == "profile" {
                profile()
            } else {
                tweets()
            })
        })
        .await
        .is_err());
    }

    #[tokio::test]
    async fn wrong_uid_and_expiry_pause_until_reconnect_but_disconnect_of_browser_does_not() {
        let (_dir, store) = db();
        let at = now();
        store.learn_x_session(&upload(), at).unwrap();
        let client = Uuid::new_v4().to_string();
        store
            .session_status(&client, "example", "logged_in", "", at)
            .unwrap();
        store.session_disconnected(&client).unwrap();
        let session = store.next_x_poll(at).unwrap().unwrap();
        let error = collect(&store, &session, |_, _, _| async {
            Ok(json!({"rest_id":"999","core":{"screen_name":"example"}}))
        })
        .await
        .err()
        .unwrap();
        assert!(error.stop);
        store.finish_x_poll(&session, Some(&error), "", at).unwrap();
        assert!(store.next_x_poll(at + PERIOD).unwrap().is_none());
        let cookies = json!({"uid":UID,"cookie":upload()["headers"]["cookie"],"csrf":"test-csrf"});
        store.refresh_x_session(&cookies, at + 1).unwrap();
        assert!(store.next_x_poll(at + PERIOD).unwrap().is_none());
        store.learn_x_session(&upload(), at + 2).unwrap();
        assert!(store.next_x_poll(at + 2).unwrap().is_some());
    }

    #[tokio::test]
    async fn unsupported_optional_data_preserves_previous_snapshots_and_saves_owned_posts() {
        let (_dir, store) = db();
        let at = now();
        let mut input = upload();
        input["templates"].as_array_mut().unwrap().push(json!({"kind":"analytics","method":"GET","url":"https://x.com/i/api/graphql/id/GetAccountAnalytics"}));
        store.learn_x_session(&input, at).unwrap();
        store.ingest(serde_json::from_value(json!({"handle":"example","source":"https://x.com/example","analytics":{"account":"example","period":"7d","metrics":{"impressions":{"value":7}}}})).unwrap(),at).unwrap();
        let session = store.next_x_poll(at).unwrap().unwrap();
        let warning = collect(&store, &session, |t, _, _| async move {
            Ok(match t.kind.as_str() {
                "profile" => profile(),
                "posts" => tweets(),
                _ => json!({"unknown_schema":true}),
            })
        })
        .await
        .unwrap();
        assert!(warning.contains("暂不支持"));
        assert_eq!(
            store.dashboard(Some("example"), 7, now()).unwrap()["analytics"]["data"]["metrics"]
                ["impressions"]["value"],
            7
        );
        store.finish_x_poll(&session, None, &warning, at).unwrap();
        assert_eq!(store.jobs().unwrap()[0]["state"], "failed");
    }
}

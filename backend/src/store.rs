use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashMap},
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}
pub fn handle(value: &str) -> Result<String, String> {
    if value.is_empty()
        || value.len() > 15
        || !value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_')
    {
        return Err("账号应为 1–15 位字母、数字或下划线".into());
    }
    Ok(value.to_ascii_lowercase())
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Count {
    pub value: i64,
    #[serde(default)]
    pub approximate: bool,
    #[serde(default)]
    pub raw: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Post {
    pub id: String,
    pub author: String,
    pub text: String,
    pub created_at: Option<String>,
    #[serde(default)]
    pub metrics: BTreeMap<String, Count>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Snapshot {
    #[serde(default)]
    pub uid: Option<String>,
    pub handle: String,
    pub source: String,
    #[serde(default)]
    pub profile: BTreeMap<String, Count>,
    #[serde(default)]
    pub posts: Vec<Post>,
    pub analytics: Option<Value>,
    #[serde(default)]
    pub creator: Option<Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Window {
    pub value: Option<i64>,
    pub approximate: bool,
    pub delta: Option<i64>,
    pub delta_approximate: bool,
    pub baseline_at: Option<i64>,
    pub observed_at: Option<i64>,
}
pub struct Store {
    db: Mutex<Connection>,
    events: tokio::sync::broadcast::Sender<Value>,
    browser_connections: Mutex<HashMap<String, Uuid>>,
}
impl Store {
    pub fn open(file: impl AsRef<Path>) -> Result<Self, String> {
        if let Some(parent) = file.as_ref().parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut db = Connection::open(file.as_ref()).map_err(|e| e.to_string())?;
        let compatibility: Value = serde_json::from_str(include_str!("../../extension/compatibility.json")).map_err(|e| e.to_string())?;
        let version_parts = |version: &str| -> Option<Vec<u16>> {
            let mut parts = version.split('.').map(|p| p.parse::<u16>().ok()).collect::<Option<Vec<_>>>()?;
            if parts.is_empty() || parts.len() > 4 { return None; }
            parts.resize(4, 0);
            Some(parts)
        };
        let minimum = version_parts(compatibility["minimumVersion"].as_str().ok_or("缺少最低插件版本")?).ok_or("最低插件版本无效")?;
        db.create_scalar_function("extension_compatible", 1, rusqlite::functions::FunctionFlags::SQLITE_UTF8 | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC, move |context| {
            let version: String = context.get(0)?;
            Ok(version_parts(&version).is_some_and(|parts| parts >= minimum))
        }).map_err(|e| e.to_string())?;
        db.create_scalar_function("extension_notification_follows", 1, rusqlite::functions::FunctionFlags::SQLITE_UTF8 | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC, move |context| {
            let version: String = context.get(0)?;
            Ok(version_parts(&version).is_some_and(|parts| parts.as_slice() >= [1,5,14,0].as_slice()))
        }).map_err(|e| e.to_string())?;
        db.create_scalar_function("automation_interval_ms", 1, rusqlite::functions::FunctionFlags::SQLITE_UTF8 | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC, |context| {
            let raw:Option<String>=context.get(0)?;
            Ok(raw.map_or(0,|raw|automation::interval_ms(&serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null))))
        }).map_err(|e|e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(file.as_ref(), std::fs::Permissions::from_mode(0o600))
                .map_err(|e| e.to_string())?;
        }
        db.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        // The accounts rebuild temporarily removes parent rows; migration checks all references before committing.
        db.execute_batch("PRAGMA foreign_keys=OFF;")
            .map_err(|e| e.to_string())?;
        schema::migrate(&mut db)?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
        Ok(Self {
            db: Mutex::new(db),
            events: tokio::sync::broadcast::channel(256).0,
            browser_connections: Mutex::new(HashMap::new()),
        })
    }
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.db.lock().map_err(|_| "数据库暂不可用".into())
    }
    pub fn token(&self) -> Result<String, String> {
        let db = self.lock()?;
        if let Some(token) = db
            .query_row(
                "SELECT value FROM settings WHERE key='bridge-token'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
        {
            return Ok(token);
        }
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        db.execute("INSERT INTO settings VALUES('bridge-token',?)", [&token])
            .map_err(|e| e.to_string())?;
        Ok(token)
    }
}

mod schema;
pub use schema::SCHEMA_VERSION;
mod automation;
mod dashboard;
mod for_you;
mod identities;
mod ingest;
mod jobs;
mod publications;
mod news_queue;
mod relationships;
pub use publications::validate_rewrite;
mod journal;
mod operations;
mod sessions;
mod x_sync;
pub use x_sync::run as run_x_sync;

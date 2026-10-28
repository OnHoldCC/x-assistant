use rusqlite::{Connection, TransactionBehavior};

pub const SCHEMA_VERSION: i64 = 2;

pub(super) fn migrate(db: &mut Connection) -> Result<(), String> {
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| e.to_string())?;
    let version: i64 = tx
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if version > SCHEMA_VERSION {
        return Err(format!("数据库版本 {version} 高于当前支持的 {SCHEMA_VERSION}，请升级应用；如需回退，请恢复升级前的数据库备份"));
    }
    if version == SCHEMA_VERSION {
        return Ok(());
    }
    // Version 0 includes unversioned 0.8/0.9 installs; preserve existing rows and keys.
    tx.execute_batch("
      CREATE TABLE IF NOT EXISTS accounts(handle TEXT PRIMARY KEY,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY,handle TEXT NOT NULL REFERENCES accounts(handle),text TEXT NOT NULL,created_at TEXT,hashtags TEXT NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS observations(handle TEXT NOT NULL,post_id TEXT NOT NULL,metric TEXT NOT NULL,at INTEGER NOT NULL,value INTEGER NOT NULL,approximate INTEGER NOT NULL,raw TEXT NOT NULL,PRIMARY KEY(handle,post_id,metric,at));
      CREATE INDEX IF NOT EXISTS observation_lookup ON observations(handle,at);
      CREATE TABLE IF NOT EXISTS analytics(handle TEXT NOT NULL,at INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(handle,at));
      CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,account TEXT NOT NULL,last_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,account TEXT NOT NULL,action TEXT NOT NULL,state TEXT NOT NULL,client TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,error TEXT,result TEXT);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS automation_tasks(id TEXT PRIMARY KEY,account TEXT NOT NULL,value TEXT NOT NULL,enabled INTEGER NOT NULL,state TEXT NOT NULL,next_run INTEGER NOT NULL,last_run INTEGER);
      CREATE TABLE IF NOT EXISTS automation_follows(account TEXT NOT NULL,target TEXT NOT NULL,followed_at INTEGER NOT NULL,following INTEGER NOT NULL,PRIMARY KEY(account,target));
      CREATE TABLE IF NOT EXISTS event_log(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER NOT NULL,level TEXT NOT NULL,kind TEXT NOT NULL,account TEXT,message TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,account TEXT NOT NULL,at INTEGER NOT NULL,provider TEXT NOT NULL,question TEXT NOT NULL,content TEXT NOT NULL,adopted INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS bookmarks(owner TEXT NOT NULL,author TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,tags TEXT NOT NULL,saved_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner,author,id));
      CREATE TABLE IF NOT EXISTS browser_sessions(client TEXT PRIMARY KEY,state TEXT NOT NULL,error TEXT NOT NULL,connected INTEGER NOT NULL);").map_err(|e|e.to_string())?;
    let has_analytics = {
        let mut columns = tx
            .prepare("PRAGMA table_info(browser_sessions)")
            .map_err(|e| e.to_string())?;
        let names = columns
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        names.iter().any(|name| name == "analytics_supported")
    };
    if !has_analytics {
        tx.execute("ALTER TABLE browser_sessions ADD COLUMN analytics_supported INTEGER NOT NULL DEFAULT 0", []).map_err(|e| e.to_string())?;
    }
    for (table, column, definition) in [
        ("jobs", "input", "TEXT NOT NULL DEFAULT '{}'"),
        (
            "browser_sessions",
            "automation_supported",
            "INTEGER NOT NULL DEFAULT 0",
        ),
        (
            "browser_sessions",
            "extension_version",
            "TEXT NOT NULL DEFAULT ''",
        ),
    ] {
        let mut statement = tx
            .prepare(&format!("PRAGMA table_info({table})"))
            .map_err(|e| e.to_string())?;
        let names = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        if !names.iter().any(|name| name == column) {
            tx.execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
                [],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

use rusqlite::{Connection, TransactionBehavior};

pub const SCHEMA_VERSION: i64 = 8;

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
      CREATE TABLE IF NOT EXISTS news_batches(id TEXT PRIMARY KEY,account TEXT NOT NULL,config_key TEXT NOT NULL,at INTEGER NOT NULL,metadata TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS news_batch_lookup ON news_batches(account,config_key,at);
      CREATE TABLE IF NOT EXISTS news_candidates(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES news_batches(id),account TEXT NOT NULL,dedupe_key TEXT NOT NULL,value TEXT NOT NULL,job_id TEXT,state TEXT NOT NULL DEFAULT 'pending',reason TEXT,UNIQUE(account,dedupe_key));
      CREATE INDEX IF NOT EXISTS news_candidate_batch ON news_candidates(batch_id,state,job_id);
      CREATE UNIQUE INDEX IF NOT EXISTS news_candidate_job ON news_candidates(job_id) WHERE job_id IS NOT NULL;
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
    if version < 3 {
        let has_uid = {
            let mut statement = tx
                .prepare("PRAGMA table_info(accounts)")
                .map_err(|e| e.to_string())?;
            let rows = statement
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
                .iter()
                .any(|name| name == "uid")
        };
        if !has_uid {
            tx.execute_batch("CREATE TABLE accounts_uid(uid TEXT PRIMARY KEY NOT NULL,handle TEXT NOT NULL UNIQUE,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
          INSERT INTO accounts_uid SELECT 'legacy:'||handle,handle,first_seen,last_seen FROM accounts;
          DROP TABLE accounts;
          ALTER TABLE accounts_uid RENAME TO accounts;").map_err(|e|e.to_string())?;
        }
        tx.execute_batch("
          CREATE TABLE IF NOT EXISTS request_templates(owner_uid TEXT NOT NULL,operation TEXT NOT NULL,value TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_uid,operation));
          CREATE TABLE IF NOT EXISTS automation_actions(job_id TEXT NOT NULL,owner_uid TEXT NOT NULL,target_uid TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL,PRIMARY KEY(job_id,target_uid,action));").map_err(|e|e.to_string())?;
    }
    tx.execute_batch("CREATE TABLE IF NOT EXISTS relationship_runs(owner_uid TEXT NOT NULL,kind TEXT NOT NULL,generation TEXT NOT NULL,cursor TEXT,complete INTEGER NOT NULL DEFAULT 0,error TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_uid,kind)); CREATE TABLE IF NOT EXISTS relationships(owner_uid TEXT NOT NULL,target_uid TEXT NOT NULL,handle TEXT NOT NULL,name TEXT NOT NULL,following INTEGER,followed_by INTEGER,following_generation TEXT,followers_generation TEXT,updated_at INTEGER NOT NULL,PRIMARY KEY(owner_uid,target_uid));").map_err(|e|e.to_string())?;
    tx.execute_batch("CREATE TABLE IF NOT EXISTS x_sessions(owner_uid TEXT PRIMARY KEY REFERENCES accounts(uid),headers TEXT NOT NULL,revision TEXT NOT NULL,state TEXT NOT NULL,next_poll INTEGER NOT NULL,last_poll INTEGER,error TEXT NOT NULL DEFAULT '');").map_err(|e|e.to_string())?;
    tx.execute_batch("
      CREATE INDEX IF NOT EXISTS jobs_account_created ON jobs(account,created_at DESC,id DESC);
      CREATE TABLE IF NOT EXISTS job_log(id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,at INTEGER NOT NULL,stage TEXT NOT NULL,message TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS job_log_lookup ON job_log(job_id,id);
      CREATE TRIGGER IF NOT EXISTS job_log_created AFTER INSERT ON jobs BEGIN
        INSERT INTO job_log(job_id,at,stage,message) VALUES(NEW.id,NEW.created_at,'created','任务已创建');
      END;
      DROP TRIGGER IF EXISTS job_log_changed;
      CREATE TRIGGER IF NOT EXISTS job_log_changed AFTER UPDATE OF state,input,result ON jobs BEGIN
        INSERT INTO job_log(job_id,at,stage,message)
          SELECT NEW.id,NEW.updated_at,CASE WHEN json_extract(NEW.input,'$.stage') IS NOT json_extract(OLD.input,'$.stage') AND json_extract(NEW.input,'$.stage') IN ('ready','sending') THEN json_extract(NEW.input,'$.stage') ELSE NEW.state END,
          CASE WHEN NEW.state='failed' THEN substr(coalesce(NEW.error,'任务失败'),1,2000)
               WHEN NEW.state='completed' THEN CASE WHEN json_extract(NEW.input,'$.stage')='skipped' THEN coalesce(json_extract(NEW.result,'$.skip_reason'),'本轮未发布') WHEN json_extract(NEW.result,'$.url') IS NOT NULL THEN 'X 发布回执已确认' ELSE '采集或操作已完成' END
               WHEN json_extract(NEW.input,'$.stage')='sending' THEN '发送前检查已通过，开始向 X 发送'
               WHEN NEW.state='rewriting' THEN '开始调用模型生成内容'
               WHEN json_extract(NEW.input,'$.stage')='ready' AND OLD.state='rewriting' THEN '模型输出已通过校验，等待发布'
               WHEN NEW.state='running' THEN '开始执行采集或操作'
               ELSE '任务已排队，等待执行' END
          WHERE NEW.state IS NOT OLD.state OR json_extract(NEW.input,'$.stage') IS NOT json_extract(OLD.input,'$.stage');
        INSERT INTO job_log(job_id,at,stage,message)
          SELECT NEW.id,json_extract(NEW.input,'$.telemetry.generations[#-1].finished_at'),'model',
            '模型调用结束 · '||coalesce(json_extract(NEW.input,'$.telemetry.generations[#-1].usage.total_tokens')||' tokens','用量未知')||' · '||json_extract(NEW.input,'$.telemetry.generations[#-1].duration_ms')||' ms'
          WHERE coalesce(json_array_length(NEW.input,'$.telemetry.generations'),0)>coalesce(json_array_length(OLD.input,'$.telemetry.generations'),0);
        INSERT INTO job_log(job_id,at,stage,message)
          SELECT NEW.id,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'cleanup',coalesce(json_extract(NEW.result,'$.cleanup_warning'),CASE WHEN json_extract(NEW.result,'$.tab_closed')=1 THEN '发送页面已清空并关闭' ELSE '发送页面已保留，待清理' END)
          WHERE NEW.state='completed' AND (json_extract(NEW.result,'$.cleanup_warning') IS NOT json_extract(OLD.result,'$.cleanup_warning') OR json_extract(NEW.result,'$.tab_closed') IS NOT json_extract(OLD.result,'$.tab_closed'));
        INSERT INTO job_log(job_id,at,stage,message)
          SELECT NEW.id,NEW.updated_at,'progress','已确认成功 '||coalesce(json_array_length(NEW.result,'$.completed'),0)||' · 跳过 '||coalesce(json_array_length(NEW.result,'$.skipped'),0)
          WHERE coalesce(json_array_length(NEW.result,'$.completed'),0)+coalesce(json_array_length(NEW.result,'$.skipped'),0)>coalesce(json_array_length(OLD.result,'$.completed'),0)+coalesce(json_array_length(OLD.result,'$.skipped'),0);
      END;
    ").map_err(|e|e.to_string())?;
    if tx
        .prepare("PRAGMA foreign_key_check")
        .map_err(|e| e.to_string())?
        .exists([])
        .map_err(|e| e.to_string())?
    {
        return Err("数据库外键校验失败，升级已取消".into());
    }
    tx.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

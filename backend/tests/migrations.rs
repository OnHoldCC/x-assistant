use onhold_backend::store::{Store, SCHEMA_VERSION};
use rusqlite::Connection;

#[test]
fn version_eight_indexes_reply_progress_without_changing_history() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("reply-progress.db");
    drop(Store::open(&file).unwrap());
    let db = rusqlite::Connection::open(&file).unwrap();
    db.execute_batch("DROP INDEX jobs_account_discovery_state; DROP INDEX jobs_account_task_updated; PRAGMA user_version=8;
      INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES
        ('parent','example','capture_for_you','completed',1,1,'{}'),
        ('child','example','rewrite_publish','completed',2,2,'{\"discovery_job\":\"parent\"}'),
        ('other','other','rewrite_publish','failed',3,3,'{\"discovery_job\":\"parent\"}');").unwrap();
    let store = Store::open(&file).unwrap();
    let jobs = store.jobs().unwrap();
    let progress = &jobs.as_array().unwrap().iter().find(|job| job["id"] == "parent").unwrap()["result"]["reply_progress"];
    assert_eq!(*progress, serde_json::json!({"total":1,"completed":1,"failed":0}));
    let db = rusqlite::Connection::open(&file).unwrap();
    let plan: String = db.query_row("EXPLAIN QUERY PLAN SELECT count(*),sum(state='completed'),sum(state='failed') FROM jobs WHERE account=? AND json_extract(input,'$.discovery_job')=?", ["example","parent"], |row| row.get(3)).unwrap();
    assert!(plan.contains("jobs_account_discovery_state"), "{plan}");
    let mut statement = db.prepare("EXPLAIN QUERY PLAN SELECT a.id,(SELECT j.id FROM jobs j WHERE j.account=a.account AND CAST(json_extract(j.input,'$.task_id') AS TEXT)=a.id ORDER BY CASE WHEN j.state IN ('running','rewriting') THEN 0 WHEN j.state='queued' THEN 1 ELSE 2 END,j.updated_at DESC,j.created_at DESC,j.id DESC LIMIT 1) FROM automation_tasks a WHERE a.account=?").unwrap();
    let plan = statement.query_map(["example"], |row| row.get::<_, String>(3)).unwrap().collect::<Result<Vec<_>, _>>().unwrap().join("\n");
    assert!(plan.contains("jobs_account_task_updated (account=? AND <expr>=?)"), "{plan}");
    assert_eq!(jobs.as_array().unwrap().len(), 3);
    assert_eq!(db.pragma_query_value(None,"user_version",|row|row.get::<_,i64>(0)).unwrap(),8);
}

#[test]
fn version_three_upgrade_keeps_uid_posts_and_pairing() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("version-three.db");
    let store = Store::open(&file).unwrap();
    let token = store.token().unwrap();
    let uid = "1900000000000000123";
    store.ingest(serde_json::from_value(serde_json::json!({"uid":uid,"handle":"example","source":"https://x.com/example","posts":[{"id":"123","author":"example","text":"keep this post"}]})).unwrap(),1000).unwrap();
    drop(store);
    let db = Connection::open(&file).unwrap();
    db.execute("DROP TABLE x_sessions", []).unwrap();
    db.pragma_update(None, "user_version", 3).unwrap();
    drop(db);
    let store = Store::open(&file).unwrap();
    assert_eq!(store.token().unwrap(), token);
    assert_eq!(store.account_uid("example").unwrap(), uid);
    assert_eq!(
        store.dashboard(Some("example"), 7, 1001).unwrap()["posts"][0]["text"],
        "keep this post"
    );
    assert!(!store.has_x_session("example").unwrap());
}

#[test]
fn version_one_upgrade_keeps_pairing_and_tracks_the_loaded_extension_version() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("version-one.db");
    let store = Store::open(&file).unwrap();
    let token = store.token().unwrap();
    let client = uuid::Uuid::new_v4().to_string();
    store
        .session_status(&client, "example", "logged_in", "", 1000)
        .unwrap();
    drop(store);
    let db = Connection::open(&file).unwrap();
    db.execute(
        "ALTER TABLE browser_sessions DROP COLUMN extension_version",
        [],
    )
    .unwrap();
    db.pragma_update(None, "user_version", 1).unwrap();
    drop(db);
    let store = Store::open(&file).unwrap();
    assert_eq!(store.token().unwrap(), token);
    assert_eq!(store.connections(1001).unwrap()[0]["extension_version"], "");
    store.set_extension_version(&client, "1.4.2").unwrap();
    assert_eq!(
        store.connections(1001).unwrap()[0]["extension_version"],
        "1.4.2"
    );
    for version in ["1.bad", "65536.0", "1.2.3.4.5", "1..2"] {
        assert!(store.set_extension_version(&client, version).is_err());
    }
    store.set_extension_version(&client, "").unwrap();
    assert_eq!(store.connections(1001).unwrap()[0]["extension_version"], "");
}

#[test]
fn legacy_database_keeps_rows_pairing_and_task_defaults_on_upgrade_and_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("legacy.db");
    let db = Connection::open(&file).unwrap();
    db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        INSERT INTO settings VALUES('bridge-token','saved-pairing-key');
        CREATE TABLE accounts(handle TEXT PRIMARY KEY,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
        INSERT INTO accounts VALUES('example',1,2);
        CREATE TABLE posts(id TEXT PRIMARY KEY,handle TEXT NOT NULL REFERENCES accounts(handle),text TEXT NOT NULL,created_at TEXT,hashtags TEXT NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
        INSERT INTO posts VALUES('123','example','keep this legacy post',NULL,'[]',1,2);
        CREATE TABLE jobs(id TEXT PRIMARY KEY,account TEXT NOT NULL,action TEXT NOT NULL,state TEXT NOT NULL,client TEXT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,error TEXT,result TEXT);
        INSERT INTO jobs VALUES('old-job','example','capture','completed',NULL,1,2,NULL,NULL);
        CREATE TABLE browser_sessions(client TEXT PRIMARY KEY,state TEXT NOT NULL,error TEXT NOT NULL,connected INTEGER NOT NULL);
        INSERT INTO browser_sessions VALUES('old-client','logged_in','',1);").unwrap();
    drop(db);
    for _ in 0..2 {
        let store = Store::open(&file).unwrap();
        assert_eq!(store.token().unwrap(), "saved-pairing-key");
        assert_eq!(store.jobs().unwrap()[0]["id"], "old-job");
        assert_eq!(store.dashboard(None, 7, 3).unwrap()["account"], "example");
        assert_eq!(
            store.dashboard(None, 7, 3).unwrap()["posts"][0]["text"],
            "keep this legacy post"
        );
        drop(store);
        let db = Connection::open(&file).unwrap();
        assert_eq!(
            db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                .unwrap(),
            SCHEMA_VERSION
        );
        assert_eq!(
            db.query_row("SELECT input FROM jobs WHERE id='old-job'", [], |r| r
                .get::<_, String>(0))
                .unwrap(),
            "{}"
        );
        assert_eq!(
            db.query_row(
                "SELECT analytics_supported+automation_supported FROM browser_sessions",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }
}

#[test]
fn unversioned_current_database_can_upgrade_without_duplicate_columns() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("current.db");
    let store = Store::open(&file).unwrap();
    let token = store.token().unwrap();
    drop(store);
    Connection::open(&file)
        .unwrap()
        .pragma_update(None, "user_version", 0)
        .unwrap();
    assert_eq!(Store::open(&file).unwrap().token().unwrap(), token);
}

#[test]
fn future_database_is_rejected_without_changing_schema_or_data() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("future.db");
    let db = Connection::open(&file).unwrap();
    db.execute_batch(
        "CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES('keep');",
    )
    .unwrap();
    db.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
        .unwrap();
    let error = Store::open(&file).err().unwrap();
    assert!(error.contains("请升级应用"), "{error}");
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        SCHEMA_VERSION + 1
    );
    assert_eq!(
        db.query_row("SELECT value FROM future_data", [], |r| r
            .get::<_, String>(0))
            .unwrap(),
        "keep"
    );
    assert_eq!(
        db.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        1
    );
}

#[test]
fn failed_migration_rolls_back_tables_and_version() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("broken.db");
    let db = Connection::open(&file).unwrap();
    db.execute_batch("CREATE VIEW browser_sessions AS SELECT 'legacy' AS client;")
        .unwrap();
    assert!(Store::open(&file).is_err());
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        db.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        0
    );
}

#[test]
fn orphaned_legacy_posts_cancel_migration_without_changing_data() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("orphaned.db");
    let db = Connection::open(&file).unwrap();
    db.execute_batch("PRAGMA foreign_keys=OFF;
        CREATE TABLE accounts(handle TEXT PRIMARY KEY,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
        CREATE TABLE posts(id TEXT PRIMARY KEY,handle TEXT NOT NULL REFERENCES accounts(handle),text TEXT NOT NULL,created_at TEXT,hashtags TEXT NOT NULL,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
        INSERT INTO posts VALUES('123','missing','keep this orphaned post',NULL,'[]',1,2);").unwrap();
    assert!(Store::open(&file).err().unwrap().contains("外键校验失败"));
    assert_eq!(
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        0
    );
    assert_eq!(
        db.query_row("SELECT text FROM posts", [], |r| r.get::<_, String>(0))
            .unwrap(),
        "keep this orphaned post"
    );
    assert_eq!(
        db.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table'",
            [],
            |r| r.get::<_, i64>(0)
        )
        .unwrap(),
        2
    );
}

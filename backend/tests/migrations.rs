use onhold_backend::store::{Store, SCHEMA_VERSION};
use rusqlite::Connection;

#[test]
fn legacy_database_keeps_rows_pairing_and_task_defaults_on_upgrade_and_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("legacy.db");
    let db = Connection::open(&file).unwrap();
    db.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        INSERT INTO settings VALUES('bridge-token','saved-pairing-key');
        CREATE TABLE accounts(handle TEXT PRIMARY KEY,first_seen INTEGER NOT NULL,last_seen INTEGER NOT NULL);
        INSERT INTO accounts VALUES('example',1,2);
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

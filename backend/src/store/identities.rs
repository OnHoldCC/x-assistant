use super::*;

pub fn x_uid(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value.len() > 20
        || value.starts_with('0')
        || !value.bytes().all(|b| b.is_ascii_digit())
    {
        return Err("X UID 无效".into());
    }
    Ok(value)
}

impl Store {
    pub fn account_handle(&self, reference: &str) -> Result<String, String> {
        if reference.starts_with("legacy:") {
            return handle(reference.trim_start_matches("legacy:"));
        }
        if x_uid(reference).is_ok() {
            return self
                .lock()?
                .query_row(
                    "SELECT handle FROM accounts WHERE uid=?",
                    [reference],
                    |r| r.get(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .ok_or("此 X UID 尚未绑定".into());
        }
        handle(reference)
    }

    pub fn account_uid(&self, reference: &str) -> Result<String, String> {
        let name = self.account_handle(reference)?;
        self.lock()?
            .query_row("SELECT uid FROM accounts WHERE handle=?", [&name], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?
            .ok_or("账号尚未采集".into())
    }

    pub fn bind_account_uid(&self, uid: &str, screen_name: &str, at: i64) -> Result<Value, String> {
        x_uid(uid)?;
        let name = handle(screen_name)?;
        let mut db = self.lock()?;
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch("PRAGMA defer_foreign_keys=ON;")
            .map_err(|e| e.to_string())?;
        let occupied: Option<String> = tx
            .query_row("SELECT uid FROM accounts WHERE handle=?", [&name], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        if occupied
            .as_deref()
            .is_some_and(|existing| existing != uid && !existing.starts_with("legacy:"))
        {
            return Err("用户名属于另一 X UID，需重新验证；数据未合并".into());
        }
        let previous: Option<String> = tx
            .query_row("SELECT handle FROM accounts WHERE uid=?", [uid], |r| {
                r.get(0)
            })
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(old) = previous.filter(|old| old != &name) {
            if occupied.is_some() {
                return Err("新用户名存在旧数据，不能自动合并".into());
            }
            // Retain legacy table indexes while the account's immutable primary key remains the UID.
            for (table, column) in [
                ("posts", "handle"),
                ("observations", "handle"),
                ("analytics", "handle"),
                ("clients", "account"),
                ("jobs", "account"),
                ("automation_tasks", "account"),
                ("automation_follows", "account"),
                ("reviews", "account"),
                ("event_log", "account"),
                ("bookmarks", "owner"),
            ] {
                tx.execute(
                    &format!("UPDATE {table} SET {column}=? WHERE {column}=?"),
                    params![name, old],
                )
                .map_err(|e| e.to_string())?;
            }
            let settings = {
                let mut statement = tx
                    .prepare("SELECT key FROM settings")
                    .map_err(|e| e.to_string())?;
                let rows = statement
                    .query_map([], |r| r.get::<_, String>(0))
                    .map_err(|e| e.to_string())?;
                rows.collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?
            };
            let suffix = format!(":{old}");
            for key in settings.into_iter().filter(|key| key.ends_with(&suffix)) {
                let updated = format!("{}:{}", &key[..key.len() - suffix.len()], name);
                tx.execute(
                    "UPDATE settings SET key=? WHERE key=?",
                    params![updated, key],
                )
                .map_err(|e| e.to_string())?;
            }
            tx.execute(
                "UPDATE accounts SET handle=?,last_seen=? WHERE uid=?",
                params![name, at, uid],
            )
            .map_err(|e| e.to_string())?;
        } else if occupied
            .as_deref()
            .is_some_and(|existing| existing.starts_with("legacy:"))
        {
            tx.execute(
                "UPDATE accounts SET uid=?,last_seen=? WHERE handle=?",
                params![uid, at, name],
            )
            .map_err(|e| e.to_string())?;
        } else {
            tx.execute("INSERT INTO accounts(uid,handle,first_seen,last_seen) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET last_seen=excluded.last_seen",params![uid,name,at,at]).map_err(|e|e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(json!({"uid":uid,"handle":name}))
    }
}

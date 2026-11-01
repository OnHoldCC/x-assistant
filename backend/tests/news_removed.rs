use onhold_backend::{dispatch,store::{now,Store}};
use serde_json::json;

#[test]
fn public_api_cannot_create_enable_run_or_republish_news(){
 let dir=tempfile::tempdir().unwrap();let path=dir.path().join("db");let store=Store::open(&path).unwrap();let at=now();
 store.ingest(serde_json::from_value(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
 let config=json!({"action":"auto_post","query":"legacy news","interval_minutes":60,"limit":1});
 // Legacy records remain readable, but none of their public execution entry points stay available.
 let plan=store.save_automation("example",&config,at).unwrap()["id"].as_str().unwrap().to_owned();
 for (op,input) in [("save_automation",json!({"account":"example","action":"auto_post","query":"new news","interval_minutes":1,"limit":1})),("control_automation",json!({"account":"example","id":plan,"enabled":true})),("run_automation",json!({"account":"example","id":plan}))]{
  assert!(dispatch(&store,op,input).unwrap_err().contains("已移除"));
 }
 let db=rusqlite::Connection::open(&path).unwrap();
 db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES('old-news','example','rewrite_publish','failed',?,?,?)",rusqlite::params![at,at,json!({"mode":"news","stage":"ready"}).to_string()]).unwrap();
 for op in ["retry_rewrite","begin_publish","schedule_publication"]{assert!(dispatch(&store,op,json!({"account":"example","id":"old-news","client":"old-client","run_at":at+1000})).unwrap_err().contains("已移除"));}
}

#[test]
fn restart_retires_old_plans_and_pending_news_without_erasing_history(){
 let dir=tempfile::tempdir().unwrap();let path=dir.path().join("db");let store=Store::open(&path).unwrap();let at=now();
 let db=rusqlite::Connection::open(&path).unwrap();
 db.execute("INSERT INTO automation_tasks VALUES('old-plan','example',?,1,'waiting',?,NULL)",rusqlite::params![json!({"action":"auto_post"}).to_string(),at]).unwrap();
 let input=json!({"mode":"news","stage":"rewrite","telemetry":{"generations":[{"usage":{"total_tokens":123}}]}}).to_string();
 for (id,state) in [("pending","queued"),("history","completed")]{db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,'example','rewrite_publish',?,?,?,?)",rusqlite::params![id,state,at,at,input]).unwrap();}
 drop(store);let _store=Store::open(&path).unwrap();
 assert_eq!(db.query_row("SELECT enabled FROM automation_tasks WHERE id='old-plan'",[],|r|r.get::<_,bool>(0)).unwrap(),false);
 assert_eq!(db.query_row("SELECT state FROM jobs WHERE id='pending'",[],|r|r.get::<_,String>(0)).unwrap(),"failed");
 let (state,raw):(String,String)=db.query_row("SELECT state,input FROM jobs WHERE id='history'",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();assert_eq!(state,"completed");assert_eq!(raw,input);
}

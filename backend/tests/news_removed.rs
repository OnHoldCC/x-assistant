use onhold_backend::{dispatch,store::{now,Store}};
use serde_json::json;

#[test]
fn new_hotspot_plans_can_be_created_but_legacy_plans_and_jobs_stay_retired(){
 let dir=tempfile::tempdir().unwrap();let path=dir.path().join("db");let store=Store::open(&path).unwrap();let at=now();
 store.ingest(serde_json::from_value(json!({"handle":"example","source":"https://x.com/example","profile":{},"posts":[]})).unwrap(),at).unwrap();
 let config=json!({"action":"auto_post","query":"legacy news","interval_minutes":60,"limit":1});
 let db=rusqlite::Connection::open(&path).unwrap();
 for source in ["weibo","tieba","gossip"] {
  let mut input=config.clone();input["account"]=json!("example");input["news_source"]=json!(source);input["allow_news_search"]=json!(true);
  let plan=dispatch(&store,"save_automation",input).unwrap()["id"].as_str().unwrap().to_owned();
  let state=dispatch(&store,"control_automation",json!({"account":"example","id":plan,"enabled":true})).unwrap();
  assert!(state["tasks"].as_array().unwrap().iter().any(|t|t["id"]==plan&&t["enabled"]==true&&t["config"]["news_policy"]=="public_hotspots_v1"));
 }
 let plan=store.save_automation("example",&config,at).unwrap()["id"].as_str().unwrap().to_owned();
 db.execute("UPDATE automation_tasks SET value=json_remove(value,'$.news_policy') WHERE id=?",[&plan]).unwrap();
 for op in ["control_automation","run_automation"] {assert!(dispatch(&store,op,json!({"account":"example","id":plan,"enabled":true})).unwrap_err().contains("旧新闻"));}
 db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES('old-news','example','rewrite_publish','failed',?,?,?)",rusqlite::params![at,at,json!({"mode":"news","stage":"ready"}).to_string()]).unwrap();
 for op in ["retry_rewrite","begin_publish","schedule_publication"]{assert!(dispatch(&store,op,json!({"account":"example","id":"old-news","client":"old-client","run_at":at+1000})).unwrap_err().contains("旧新闻"));}
}

#[test]
fn restart_retires_old_plans_and_pending_news_without_erasing_history(){
 let dir=tempfile::tempdir().unwrap();let path=dir.path().join("db");let store=Store::open(&path).unwrap();let at=now();
 let db=rusqlite::Connection::open(&path).unwrap();
 db.execute("INSERT INTO automation_tasks VALUES('old-plan','example',?,1,'waiting',?,NULL)",rusqlite::params![json!({"action":"auto_post"}).to_string(),at]).unwrap();
 db.execute("INSERT INTO automation_tasks VALUES('new-plan','example',?,1,'waiting',?,NULL)",rusqlite::params![json!({"action":"auto_post","news_policy":"public_hotspots_v1"}).to_string(),at]).unwrap();
 let input=json!({"mode":"news","stage":"rewrite","telemetry":{"generations":[{"usage":{"total_tokens":123}}]}}).to_string();
 for (id,state) in [("pending","queued"),("history","completed")]{db.execute("INSERT INTO jobs(id,account,action,state,created_at,updated_at,input) VALUES(?,'example','rewrite_publish',?,?,?,?)",rusqlite::params![id,state,at,at,input]).unwrap();}
 drop(store);let _store=Store::open(&path).unwrap();
 assert_eq!(db.query_row("SELECT enabled FROM automation_tasks WHERE id='old-plan'",[],|r|r.get::<_,bool>(0)).unwrap(),false);
 assert!(db.query_row("SELECT enabled FROM automation_tasks WHERE id='new-plan'",[],|r|r.get::<_,bool>(0)).unwrap());
 assert_eq!(db.query_row("SELECT state FROM jobs WHERE id='pending'",[],|r|r.get::<_,String>(0)).unwrap(),"failed");
 let (state,raw):(String,String)=db.query_row("SELECT state,input FROM jobs WHERE id='history'",[],|r|Ok((r.get(0)?,r.get(1)?))).unwrap();assert_eq!(state,"completed");assert_eq!(raw,input);
}

import {fingerprint} from './data.mjs';
import {accountKey,postIdentity,learningFeatures,fitAccountModel} from './learning.mjs';
const metricsKeys=['views','likes','replies','reposts','quotes','bookmarks'];
const value=item=>typeof item==='number'?item:item?.value??null;
const bucket=(n,limits)=>n===null?'unknown':String(limits.findIndex(limit=>n<limit));
export function publicPostSignals(metrics,followers,publishedAt,observedAt){
 const views=value(metrics?.views),rates={};
 for(const key of metricsKeys.filter(key=>key!=='views')){const n=value(metrics?.[key]);rates[key+'_per_1000_views']=views>0&&n!==null?n/views*1000:null;}
 const ageHours=(observedAt-publishedAt)/3600000;
 return {...rates,views,followers:value(followers),views_per_follower:value(followers)>0&&views!==null?views/value(followers):null,age_hours:ageHours,views_per_hour:ageHours>0&&views!==null?views/ageHours:null};
}
export function createReferences(store,{now=Date.now}={}){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS observed_authors(account TEXT PRIMARY KEY,followers TEXT,following TEXT,observed_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS reference_posts(post_id TEXT PRIMARY KEY,account TEXT NOT NULL,content_hash TEXT NOT NULL,published_at INTEGER NOT NULL,url TEXT NOT NULL,metrics TEXT NOT NULL,observed_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS reference_candidates(post_id TEXT PRIMARY KEY,content_hash TEXT NOT NULL,base_version TEXT NOT NULL,content_score REAL NOT NULL,keywords TEXT NOT NULL,judged_at INTEGER NOT NULL,training_allowed INTEGER NOT NULL DEFAULT 0,features TEXT,rights_basis TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS reference_learning_config(id INTEGER PRIMARY KEY CHECK(id=1),enabled INTEGER NOT NULL,rights_basis TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reference_training_samples(post_id TEXT PRIMARY KEY,account TEXT NOT NULL,base_version TEXT NOT NULL,content_hash TEXT NOT NULL,features TEXT NOT NULL,target REAL NOT NULL,published_at INTEGER NOT NULL,observed_at INTEGER NOT NULL,rights_basis TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS reference_samples_version ON reference_training_samples(base_version,published_at);
 CREATE TABLE IF NOT EXISTS reference_models(version INTEGER PRIMARY KEY,base_version TEXT NOT NULL,model TEXT NOT NULL,sample_count INTEGER NOT NULL,train_cutoff INTEGER NOT NULL,validation_mae REAL NOT NULL,baseline_mae REAL NOT NULL,accepted INTEGER NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS reference_active_model(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER,previous_version INTEGER);`);
 if(!db.prepare('PRAGMA table_info(reference_candidates)').all().some(row=>row.name==='features'))db.exec('ALTER TABLE reference_candidates ADD COLUMN features TEXT');
 if(!db.prepare('PRAGMA table_info(reference_candidates)').all().some(row=>row.name==='rights_basis'))db.exec("ALTER TABLE reference_candidates ADD COLUMN rights_basis TEXT NOT NULL DEFAULT ''");
 const configuration=()=>db.prepare('SELECT * FROM reference_learning_config WHERE id=1').get();
 function configure({enabled,rights_basis=''}){
  if(typeof enabled!=='boolean'||typeof rights_basis!=='string'||rights_basis.length>1000)throw Error('参考学习设置无效');
  if(enabled&&!rights_basis.trim())throw Error('请记录这些参考数据允许用于训练的依据');
  db.prepare('INSERT INTO reference_learning_config VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,rights_basis=excluded.rights_basis').run(Number(enabled),rights_basis.trim());return status();
 }
 function status(){const config=configuration();return {enabled:!!config?.enabled,rights_basis:config?.rights_basis||'',samples:db.prepare('SELECT COUNT(*) AS n FROM reference_training_samples').get().n,active_version:db.prepare('SELECT version FROM reference_active_model WHERE id=1').get()?.version??null,models:db.prepare('SELECT version,sample_count,validation_mae,baseline_mae,accepted FROM reference_models ORDER BY version DESC LIMIT 5').all()};}
 function author({account,followers=null,following=null}){
  account=accountKey(account);
  for(const item of [followers,following])if(item!==null&&(!Number.isSafeInteger(value(item))||value(item)<0))throw Error('作者粉丝或关注数据无效');
  if(followers===null&&following===null)return {recorded:false};
  db.prepare('INSERT INTO observed_authors VALUES(?,?,?,?) ON CONFLICT(account) DO UPDATE SET followers=COALESCE(excluded.followers,observed_authors.followers),following=COALESCE(excluded.following,observed_authors.following),observed_at=excluded.observed_at').run(account,followers===null?null:JSON.stringify(followers),following===null?null:JSON.stringify(following),now());return {recorded:true};
 }
 function observe({url,original,metrics={}}){
  let post;try{post=postIdentity(url);}catch{return;}
  const safe={};for(const key of metricsKeys){const item=metrics[key],n=value(item);if(n!==null){if(!Number.isSafeInteger(n)||n<0)throw Error('帖子公开指标无效');safe[key]={value:n,approximate:item?.approximate===true};}}
  db.prepare('INSERT INTO reference_posts VALUES(?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET content_hash=excluded.content_hash,metrics=excluded.metrics,observed_at=excluded.observed_at').run(post.post_id,post.account,fingerprint(original),post.published_at,post.url,JSON.stringify(safe),now());
  db.prepare('DELETE FROM reference_candidates WHERE post_id=? AND content_hash<>?').run(post.post_id,fingerprint(original));
  train();
 }
 function judged({url,text,result}){
  let post;try{post=postIdentity(url);}catch{return;}
  const original=db.prepare('SELECT * FROM reference_posts WHERE post_id=? AND content_hash=?').get(post.post_id,fingerprint(text));
  if(!original||!Number.isFinite(result.potential?.score))return;
  // A high self-score is only a candidate flag, never a supervised training label or training permission.
  db.prepare('INSERT INTO reference_candidates VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(post_id) DO UPDATE SET content_hash=excluded.content_hash,base_version=excluded.base_version,content_score=excluded.content_score,keywords=excluded.keywords,judged_at=excluded.judged_at,training_allowed=MAX(reference_candidates.training_allowed,excluded.training_allowed),features=excluded.features,rights_basis=CASE WHEN excluded.training_allowed=1 THEN excluded.rights_basis ELSE reference_candidates.rights_basis END').run(post.post_id,original.content_hash,result.pipeline_version,result.potential.score,JSON.stringify(result.keywords||[]),now(),Number(!!configuration()?.enabled),JSON.stringify(learningFeatures(result)),configuration()?.enabled?configuration().rights_basis:'');
  train();
 }
 function report({url}){
  const post=postIdentity(url),row=db.prepare('SELECT * FROM reference_posts WHERE post_id=?').get(post.post_id);if(!row)return null;
  const profile=db.prepare('SELECT * FROM observed_authors WHERE account=?').get(row.account),followers=profile?.followers?JSON.parse(profile.followers):null,following=profile?.following?JSON.parse(profile.following):null;
  const metrics=JSON.parse(row.metrics),signals=publicPostSignals(metrics,followers,row.published_at,row.observed_at),candidate=db.prepare('SELECT * FROM reference_candidates WHERE post_id=? AND content_hash=?').get(row.post_id,row.content_hash);
  return {post_id:row.post_id,account:row.account,metrics,followers,following,author_observed_at:profile?.observed_at??null,published_at:row.published_at,observed_at:row.observed_at,signals,candidate:!!candidate&&candidate.content_score>=80,content_score:candidate?.content_score??null,training_allowed:!!candidate?.training_allowed,cohort:{followers:bucket(signals.followers,[1000,10000,100000,1000000,Infinity]),age:bucket(signals.age_hours,[6,24,48,168,Infinity])},note:'公开数据观察，不是 X 内部推荐分；浏览量不等于独立读者或停留时间。'};
 }
 function list({limit=20}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('候选数量无效');
  return db.prepare('SELECT p.url FROM reference_candidates c JOIN reference_posts p USING(post_id) WHERE c.content_hash=p.content_hash AND c.content_score>=80 ORDER BY c.judged_at DESC LIMIT ?').all(limit).map(row=>report(row));
 }
 function train(){
  const config=configuration();if(!config?.enabled)return {trained:false,reason:'disabled'};
  for(const row of db.prepare('SELECT p.*,c.base_version,c.features,c.rights_basis,a.followers,a.observed_at AS author_at FROM reference_posts p JOIN reference_candidates c USING(post_id) JOIN observed_authors a USING(account) WHERE c.content_hash=p.content_hash AND c.training_allowed=1 AND c.features IS NOT NULL ORDER BY p.observed_at DESC LIMIT 1000').all()){
   const age=row.observed_at-row.published_at,metrics=JSON.parse(row.metrics),followers=row.followers?JSON.parse(row.followers):null;
   if(age<24*3600000||age>26*3600000||!value(followers)||followers?.approximate||row.author_at>row.observed_at||row.author_at<row.observed_at-7*86400000||!Number.isSafeInteger(value(metrics.views))||value(metrics.views)<0||metrics.views.approximate)continue;
   // The target is observed reach relative to author size, not the model's own quality score or an X ranking coefficient.
   db.prepare('INSERT OR IGNORE INTO reference_training_samples VALUES(?,?,?,?,?,?,?,?,?)').run(row.post_id,row.account,row.base_version,row.content_hash,row.features,Math.log1p(value(metrics.views)/value(followers)),row.published_at,row.observed_at,row.rights_basis);
  }
  const latestSample=db.prepare('SELECT base_version FROM reference_training_samples ORDER BY published_at DESC LIMIT 1').get();if(!latestSample)return {trained:false,reason:'insufficient_samples'};
  const base_version=latestSample.base_version,total=db.prepare('SELECT COUNT(*) AS n FROM reference_training_samples WHERE base_version=?').get(base_version).n,records=db.prepare('SELECT * FROM reference_training_samples WHERE base_version=? ORDER BY published_at DESC LIMIT 1000').all(base_version).reverse(),latest=db.prepare('SELECT * FROM reference_models WHERE base_version=? ORDER BY version DESC LIMIT 1').get(base_version);
  if(records.length<30||new Set(records.map(row=>row.account)).size<5)return {trained:false,reason:'insufficient_samples_or_authors'};
  if(latest&&total-latest.sample_count<5)return {trained:false,reason:'waiting_for_batch'};
  const rows=records.map(row=>({x:JSON.parse(row.features),y:row.target,at:row.published_at,account:row.account})),cutoff=Math.floor(rows.length*.8),validation=rows.slice(cutoff),validationAuthors=new Set(validation.map(row=>row.account)),training=rows.slice(0,cutoff).filter(row=>!validationAuthors.has(row.account));
  if(training.length<20||validation.length<5)return {trained:false,reason:'waiting_for_author_disjoint_validation'};
  const current=db.prepare('SELECT m.* FROM reference_models m JOIN reference_active_model a ON m.version=a.version WHERE a.id=1').get();
  if(current?.base_version===base_version&&current.train_cutoff>=validation[0].at)return {trained:false,reason:'waiting_for_fresh_validation'};
  const fitted=fitAccountModel(rows,{train:training,validation}),prior=current?.base_version===base_version?JSON.parse(current.model):null;
  const oldError=prior?validation.reduce((sum,row)=>sum+Math.abs(prior.baseline+prior.weights.reduce((n,w,i)=>n+w*row.x[i],0)-row.y),0)/validation.length:Infinity;
  const accepted=fitted.validation_mae<Math.min(fitted.baseline_mae,oldError)*.95,version=db.prepare('SELECT COALESCE(MAX(version),0)+1 AS n FROM reference_models').get().n;
  const model={weights:fitted.weights,baseline:fitted.baseline,training_targets:fitted.training_targets};
  db.exec('BEGIN IMMEDIATE');try{
   db.prepare('INSERT INTO reference_models VALUES(?,?,?,?,?,?,?,?,?)').run(version,base_version,JSON.stringify(model),total,training.at(-1).at,fitted.validation_mae,fitted.baseline_mae,Number(accepted),now());
   if(accepted)db.prepare('INSERT INTO reference_active_model VALUES(1,?,NULL) ON CONFLICT(id) DO UPDATE SET previous_version=version,version=excluded.version').run(version);
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {trained:true,accepted,version,samples:total};
 }
 function predict(result){
  if(!configuration()?.enabled)return {status:'disabled',score:null};
  const row=db.prepare('SELECT m.* FROM reference_models m JOIN reference_active_model a ON m.version=a.version WHERE a.id=1 AND m.base_version=?').get(result.pipeline_version);
  if(!row)return {status:'insufficient_validated_data',score:null};
  const model=JSON.parse(row.model),features=learningFeatures(result),y=model.baseline+model.weights.reduce((sum,n,i)=>sum+n*features[i],0);
  return {status:'ready',score:Math.round((model.training_targets.filter(n=>n<=y).length+.5)/(model.training_targets.length+1)*100),model_version:row.version,samples:row.sample_count,label:'参考样本中的相对传播表现 · 实验性百分位'};
 }
 function rollback(){const active=db.prepare('SELECT previous_version FROM reference_active_model WHERE id=1').get();if(!active?.previous_version)throw Error('没有可回退的参考模型');db.prepare('UPDATE reference_active_model SET version=previous_version,previous_version=NULL WHERE id=1').run();return status();}
 return {author,observe,judged,report,list,configure,status,train,predict,rollback};
}

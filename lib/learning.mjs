import {createHash} from 'node:crypto';
import {fingerprint} from './data.mjs';
const HOUR=3600000,HORIZON=24*HOUR,WINDOW=2*HOUR,MIN_SAMPLES=30;
const SIGNALS=['attention','value','discussion','sharing','safety'];
export function accountKey(value){
 if(typeof value!=='string'||!/^@?[A-Za-z0-9_]{1,15}$/.test(value))throw Error('请输入有效的 X 账号名');
 // shortcut: account identity uses the handle; migrate to numeric IDs when an authorized account API is connected.
 return value.replace(/^@/,'').toLowerCase();
}
export function postIdentity(value){
 let url;try{url=new URL(value);}catch{throw Error('请输入已发布帖子的完整链接');}
 const match=url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{15,20})\/?$/);
 if(url.protocol!=='https:'||!['x.com','twitter.com'].includes(url.hostname)||url.username||url.password||!match)throw Error('需要 https://x.com/账号/status/帖子ID 链接');
 const published_at=Number(BigInt(match[2])>>22n)+1288834974657;
 if(!Number.isSafeInteger(published_at))throw Error('帖子时间无效');
 return {account:accountKey(match[1]),post_id:match[2],published_at,url:`https://x.com/${match[1].toLowerCase()}/status/${match[2]}`};
}
export function learningFeatures(result){
 const rows=result?.potential?.rows;
 const values=SIGNALS.map(key=>{const n=rows?.find(row=>row.key===key)?.score;if(!Number.isFinite(n)||n<0||n>100)throw Error('评分特征不完整，请重新评分');return n/100-.5;});
 const topics=Array(16).fill(0),terms=[...new Set((result.keywords||[]).map(row=>String(row.term).trim().toLowerCase()).filter(Boolean))];
 for(const term of terms){const hash=createHash('sha256').update(term).digest();topics[hash[0]%16]+=1/Math.max(1,terms.length);}
 return [1,...values,...topics];
}
const dot=(weights,features)=>weights.reduce((sum,n,i)=>sum+n*features[i],0);
const mean=items=>items.reduce((sum,n)=>sum+n,0)/items.length;
const mae=(rows,predict)=>mean(rows.map(row=>Math.abs(predict(row.x)-row.y)));
export function fitAccountModel(rows,partition=null){
 const split=Math.floor(rows.length*.8),train=partition?.train||rows.slice(0,split),validation=partition?.validation||rows.slice(split),baseline=mean(train.map(row=>row.y));
 const weights=Array(train[0].x.length).fill(0);
 for(let step=0;step<300;step++){
  const gradient=weights.map(()=>0);
  for(const row of train){const error=baseline+dot(weights,row.x)-row.y;for(let i=0;i<weights.length;i++)gradient[i]+=error*row.x[i]/train.length;}
  for(let i=0;i<weights.length;i++)weights[i]-=.08*(gradient[i]+(i===0?0:.02*weights[i]));
 }
 return {weights,baseline,training_targets:train.map(row=>row.y).sort((a,b)=>a-b),train,validation,validation_mae:mae(validation,x=>baseline+dot(weights,x)),baseline_mae:mae(validation,()=>baseline)};
}
export function createLearning(store,{now=Date.now}={}){
 const db=store.db;
 db.exec(`CREATE TABLE IF NOT EXISTS learning_accounts(account TEXT PRIMARY KEY,enabled INTEGER NOT NULL,active_version INTEGER,previous_version INTEGER,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS learning_drafts(account TEXT NOT NULL,draft_id TEXT NOT NULL,content_hash TEXT NOT NULL,original TEXT NOT NULL,features TEXT NOT NULL,base_version TEXT NOT NULL,predicted_at INTEGER NOT NULL,PRIMARY KEY(account,draft_id,content_hash,base_version));
 CREATE TABLE IF NOT EXISTS learning_posts(post_id TEXT PRIMARY KEY,account TEXT NOT NULL,draft_id TEXT NOT NULL,content_hash TEXT NOT NULL,original TEXT NOT NULL,features TEXT NOT NULL,base_version TEXT NOT NULL,predicted_at INTEGER NOT NULL,published_at INTEGER NOT NULL,url TEXT NOT NULL,organic INTEGER NOT NULL,state TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS learning_posts_account ON learning_posts(account,published_at);
 CREATE TABLE IF NOT EXISTS learning_samples(post_id TEXT PRIMARY KEY,account TEXT NOT NULL,base_version TEXT NOT NULL,features TEXT NOT NULL,views INTEGER NOT NULL,metrics TEXT NOT NULL,published_at INTEGER NOT NULL,observed_at INTEGER NOT NULL,capture_source TEXT NOT NULL DEFAULT 'page');
 CREATE INDEX IF NOT EXISTS learning_samples_account ON learning_samples(account,base_version,published_at);
 CREATE TABLE IF NOT EXISTS learning_models(account TEXT NOT NULL,version INTEGER NOT NULL,base_version TEXT NOT NULL,model TEXT NOT NULL,sample_count INTEGER NOT NULL,train_cutoff INTEGER NOT NULL,validation_mae REAL NOT NULL,baseline_mae REAL NOT NULL,accepted INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(account,version));`);
 if(!db.prepare('PRAGMA table_info(learning_samples)').all().some(row=>row.name==='capture_source'))db.exec("ALTER TABLE learning_samples ADD COLUMN capture_source TEXT NOT NULL DEFAULT 'page'");
 const enabled=account=>db.prepare('SELECT * FROM learning_accounts WHERE account=? AND enabled=1').get(account);
 function configure({account,enabled:allow,owns_content=false}){
  account=accountKey(account);if(typeof allow!=='boolean')throw Error('学习开关无效');if(allow&&!owns_content)throw Error('请确认只用自己的、允许用于训练的发帖数据');
  db.prepare('INSERT INTO learning_accounts VALUES(?,?,NULL,NULL,?) ON CONFLICT(account) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at').run(account,Number(allow),now());
  return status({account});
 }
 function status({account}){
  account=accountKey(account);const settings=db.prepare('SELECT * FROM learning_accounts WHERE account=?').get(account);
  const models=db.prepare('SELECT version,base_version,sample_count,validation_mae,baseline_mae,accepted,created_at FROM learning_models WHERE account=? ORDER BY version DESC LIMIT 5').all(account);
  const samples=db.prepare('SELECT COUNT(*) AS n FROM learning_samples WHERE account=?').get(account).n;
  const posts=db.prepare('SELECT post_id,url,published_at,state,organic FROM learning_posts WHERE account=? ORDER BY published_at DESC LIMIT 20').all(account).map(row=>({...row,due_at:row.published_at+HORIZON,expires_at:row.published_at+HORIZON+WINDOW}));
  return {account,enabled:!!settings?.enabled,samples,min_samples:MIN_SAMPLES,active_version:settings?.active_version??null,previous_version:settings?.previous_version??null,models,posts,profile:profile(account),horizon_hours:24,tolerance_hours:2};
 }
 function profile(account){
  const rows=db.prepare('SELECT s.*,p.original,p.content_hash FROM learning_samples s JOIN learning_posts p USING(post_id) WHERE s.account=? ORDER BY s.published_at DESC LIMIT 200').all(account);
  if(rows.length<8)return {status:'insufficient_samples',user_tags:[],audience_interests:[],evidence_posts:rows.length};
  const sorted=rows.map(row=>row.views).sort((a,b)=>a-b),threshold=sorted[Math.floor((sorted.length-1)*.75)],tags=new Map();let views=0,replies=0,reposts=0,likes=0,bookmarks=0,bookmarkViews=0;
  for(const row of rows){
   const metrics=JSON.parse(row.metrics);views+=row.views;likes+=metrics.likes;replies+=metrics.replies;reposts+=metrics.reposts;if(metrics.bookmarks!==undefined){bookmarks+=metrics.bookmarks;bookmarkViews+=row.views;}
   const cached=db.prepare("SELECT value FROM results WHERE kind='analysis' AND content_hash=? AND model_version=? ORDER BY created_at DESC LIMIT 1").get(row.content_hash,row.base_version);
   const keywords=cached?JSON.parse(cached.value).keywords||[]:[];
   for(const {term} of keywords){const item=tags.get(term)||{term,posts:0,strong_posts:0,views:0};item.posts++;item.strong_posts+=Number(row.views>0&&row.views>=threshold);item.views+=row.views;tags.set(term,item);}
  }
  const user_tags=[...tags.values()].filter(row=>row.posts>=2).sort((a,b)=>b.strong_posts-a.strong_posts||b.posts-a.posts).slice(0,8);
  return {status:'observational',user_tags,audience_interests:user_tags.filter(row=>row.strong_posts>=2).slice(0,5),evidence_posts:rows.length,likes_per_1000_views:views?likes/views*1000:null,replies_per_1000_views:views?replies/views*1000:null,reposts_per_1000_views:views?reposts/views*1000:null,bookmarks_per_1000_views:bookmarkViews?bookmarks/bookmarkViews*1000:null,note:'根据本人帖子公开表现推测主题与受众兴趣；不是实际读者身份、人口统计或 X 内部标签。'};
 }
 function recordPrediction({account,draft_id,text,result}){
  if(!account||!draft_id)return;account=accountKey(account);if(!enabled(account))return;
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(draft_id)||typeof text!=='string'||!text.trim()||text.length>24000||typeof result.pipeline_version!=='string')throw Error('草稿学习记录无效');
  const features=learningFeatures(result);
  // Re-scoring must not erase the earliest prediction made before publication.
  db.prepare('INSERT OR IGNORE INTO learning_drafts VALUES(?,?,?,?,?,?,?)').run(account,draft_id,fingerprint(text),text.trim(),JSON.stringify(features),result.pipeline_version,now());
 }
 function bind({account,draft_id,url,organic=true}){
  account=accountKey(account);if(!enabled(account))throw Error('请先开启这个账号的本地学习');
  if(typeof draft_id!=='string'||typeof organic!=='boolean')throw Error('发布关联格式无效');
  const post=postIdentity(url);if(post.account!==account)throw Error('帖子作者与学习账号不一致，未关联');
  if(post.published_at>now()+60000||post.published_at<1288834974657)throw Error('帖子发布时间无效');
  const draft=db.prepare('SELECT * FROM learning_drafts WHERE account=? AND draft_id=? AND predicted_at<=? AND predicted_at>=? ORDER BY predicted_at DESC LIMIT 1').get(account,draft_id,post.published_at,post.published_at-48*HOUR);
  if(!draft)throw Error('没有找到发布前的草稿评分，请先评分，再发布并关联');
  const prior=db.prepare('SELECT * FROM learning_posts WHERE post_id=?').get(post.post_id);
  if(prior){if(prior.account!==account||prior.draft_id!==draft_id||prior.content_hash!==draft.content_hash||prior.organic!==Number(organic))throw Error('帖子已关联其他记录，未覆盖');return status({account});}
  db.prepare('INSERT INTO learning_posts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(post.post_id,account,draft_id,draft.content_hash,draft.original,draft.features,draft.base_version,draft.predicted_at,post.published_at,post.url,Number(organic),organic?'awaiting_snapshot':'excluded_promoted');
  return status({account});
 }
 function due(){
  db.prepare("UPDATE learning_posts SET state='missed_window' WHERE state IN ('awaiting_snapshot','awaiting_exact_metrics') AND published_at+?<?").run(HORIZON+WINDOW,now());
  return db.prepare("SELECT p.account,p.post_id,p.url,p.published_at FROM learning_posts p JOIN learning_accounts a USING(account) WHERE a.enabled=1 AND p.organic=1 AND p.state IN ('awaiting_snapshot','awaiting_exact_metrics') AND p.published_at+?<=? AND p.published_at+?>=? ORDER BY p.published_at LIMIT 50").all(HORIZON,now(),HORIZON+WINDOW,now());
 }
 function train(account,base_version,{force=false}={}){
  account=accountKey(account);if(!enabled(account))throw Error('此账号学习已关闭');
  const total=db.prepare('SELECT COUNT(*) AS n FROM learning_samples WHERE account=? AND base_version=?').get(account,base_version).n,records=db.prepare('SELECT * FROM learning_samples WHERE account=? AND base_version=? ORDER BY published_at DESC,post_id DESC LIMIT 200').all(account,base_version).reverse();
  if(total<MIN_SAMPLES)return {trained:false,reason:'insufficient_samples',samples:total};
  const latest=db.prepare('SELECT * FROM learning_models WHERE account=? AND base_version=? ORDER BY version DESC LIMIT 1').get(account,base_version);
  if(latest&&(total===latest.sample_count||!force&&total-latest.sample_count<5))return {trained:false,reason:'waiting_for_batch'};
  // shortcut: use the latest 200 posts and a linear account model; revisit when held-out results justify a richer model.
  const rows=records.slice(-200).map(row=>({x:JSON.parse(row.features),y:Math.log1p(row.views),at:row.published_at}));
  const fitted=fitAccountModel(rows),settings=enabled(account),active=settings.active_version?db.prepare('SELECT * FROM learning_models WHERE account=? AND version=?').get(account,settings.active_version):null;
  const old=active?.base_version===base_version?JSON.parse(active.model):null;
  const validationStart=fitted.validation[0].at;
  if(active&&active.base_version===base_version&&active.train_cutoff>=validationStart)return {trained:false,reason:'waiting_for_fresh_validation'};
  const oldError=old?mae(fitted.validation,x=>old.baseline+dot(old.weights,x)):Infinity;
  const accepted=Number.isFinite(fitted.validation_mae)&&fitted.validation_mae<Math.min(fitted.baseline_mae,oldError)*.95;
  const version=db.prepare('SELECT COALESCE(MAX(version),0)+1 AS version FROM learning_models WHERE account=?').get(account).version;
  const auxiliary={};
  for(const metric of ['likes','replies','reposts','bookmarks','quotes']){
   const available=records.slice(-200).filter(row=>row.views>0&&Number.isSafeInteger(JSON.parse(row.metrics)[metric]));
   if(available.length<MIN_SAMPLES)continue;
   const head=fitAccountModel(available.map(row=>({x:JSON.parse(row.features),y:Math.log1p(JSON.parse(row.metrics)[metric]/row.views*1000),at:row.published_at})));
   if(head.validation_mae<head.baseline_mae*.95)auxiliary[metric]={weights:head.weights,baseline:head.baseline,validation_mae:head.validation_mae};
  }
  const model={weights:fitted.weights,baseline:fitted.baseline,training_targets:fitted.training_targets,features_version:1,auxiliary};
  db.exec('BEGIN IMMEDIATE');try{
   db.prepare('INSERT INTO learning_models VALUES(?,?,?,?,?,?,?,?,?,?)').run(account,version,base_version,JSON.stringify(model),total,fitted.train.at(-1).at,fitted.validation_mae,fitted.baseline_mae,Number(accepted),now());
   if(accepted)db.prepare('UPDATE learning_accounts SET previous_version=active_version,active_version=?,updated_at=? WHERE account=?').run(version,now(),account);
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {trained:true,accepted,version,samples:total,validation_mae:fitted.validation_mae,baseline_mae:fitted.baseline_mae};
 }
 function observation({url,original,metrics,observed_at=now(),capture_source='page'}){
  if(!['page','import'].includes(capture_source))throw Error('快照来源无效');
  const post=postIdentity(url),bound=db.prepare('SELECT * FROM learning_posts WHERE post_id=?').get(post.post_id);
  if(!bound||!enabled(bound.account)||!bound.organic)return {recorded:false,reason:'not_enrolled_own_post'};
  if(post.account!==bound.account)throw Error('帖子作者不匹配');
  if(typeof original!=='string'||fingerprint(original)!==bound.content_hash){db.prepare("UPDATE learning_posts SET state='content_mismatch' WHERE post_id=?").run(post.post_id);return {recorded:false,reason:'content_mismatch'};}
  if(!Number.isSafeInteger(observed_at)||observed_at>now()+60000)throw Error('观察时间无效');
  const age=observed_at-bound.published_at;if(age<HORIZON||age>HORIZON+WINDOW)return {recorded:false,reason:'outside_24h_window'};
  const values={};for(const name of ['views','likes','replies','reposts']){const raw=metrics?.[name],n=raw?.value??raw;if(!Number.isSafeInteger(n)||n<0||raw?.approximate){db.prepare("UPDATE learning_posts SET state='awaiting_exact_metrics' WHERE post_id=? AND state NOT IN ('sampled','content_mismatch')").run(post.post_id);return {recorded:false,reason:'exact_metrics_required'};}values[name]=n;}
  if(values.views===0&&['likes','replies','reposts'].some(key=>values[key]>0))return {recorded:false,reason:'inconsistent_exposure_metrics'};
  for(const name of ['bookmarks','quotes']){const raw=metrics?.[name],n=raw?.value??raw;if(Number.isSafeInteger(n)&&n>=0&&!raw?.approximate)values[name]=n;}
  const inserted=db.prepare('INSERT OR IGNORE INTO learning_samples(post_id,account,base_version,features,views,metrics,published_at,observed_at,capture_source) VALUES(?,?,?,?,?,?,?,?,?)').run(bound.post_id,bound.account,bound.base_version,bound.features,values.views,JSON.stringify(values),bound.published_at,observed_at,capture_source);
  db.prepare("UPDATE learning_posts SET state='sampled' WHERE post_id=?").run(bound.post_id);
  const training=inserted.changes?train(bound.account,bound.base_version):null;
  return {recorded:true,duplicate:!inserted.changes,training};
 }
 function personalize({account,result}){
  if(!account)return {status:'no_account',score:null};account=accountKey(account);const settings=enabled(account);
  if(!settings)return {account,status:'disabled',score:null};
  const samples=db.prepare('SELECT COUNT(*) AS n FROM learning_samples WHERE account=? AND base_version=?').get(account,result.pipeline_version||'').n;
  const row=settings.active_version?db.prepare('SELECT * FROM learning_models WHERE account=? AND version=? AND base_version=?').get(account,settings.active_version,result.pipeline_version||''):null;
  if(!row)return {account,status:samples<MIN_SAMPLES?'insufficient_samples':'no_validated_model',score:null,samples,min_samples:MIN_SAMPLES};
  const model=JSON.parse(row.model),prediction=model.baseline+dot(model.weights,learningFeatures(result));
  const score=Math.round((model.training_targets.filter(n=>n<=prediction).length+.5)/(model.training_targets.length+1)*100);
  const features=learningFeatures(result),interaction_predictions={};
  for(const [metric,head] of Object.entries(model.auxiliary||{}))interaction_predictions[metric+'_per_1000_views']=Math.max(0,Math.expm1(Math.max(-20,Math.min(20,head.baseline+dot(head.weights,features)))));
  return {account,status:'ready',score,samples,model_version:row.version,base_version:row.base_version,label:'帖子相对曝光潜力 · 实验性百分位',validation_mae:row.validation_mae,interaction_predictions};
 }
 function rollback({account}){
  account=accountKey(account);const settings=enabled(account);if(!settings?.previous_version)throw Error('没有可回退的账号模型');
  const previous=db.prepare('SELECT version FROM learning_models WHERE account=? AND version=? AND accepted=1').get(account,settings.previous_version);if(!previous)throw Error('旧模型不可用');
  db.prepare('UPDATE learning_accounts SET active_version=previous_version,previous_version=NULL,updated_at=? WHERE account=?').run(now(),account);return status({account});
 }
 function exportSamples({account}){
  account=accountKey(account);return db.prepare('SELECT s.*,p.original,p.url,p.predicted_at FROM learning_samples s JOIN learning_posts p USING(post_id) WHERE s.account=? ORDER BY s.published_at LIMIT 1000').all(account).map(row=>({...row,features:JSON.parse(row.features),metrics:JSON.parse(row.metrics)}));
 }
 return {configure,status,recordPrediction,bind,due,train,observation,personalize,rollback,exportSamples};
}

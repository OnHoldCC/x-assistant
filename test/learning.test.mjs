import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openData,fingerprint} from '../lib/data.mjs';
import {createLearning,postIdentity,accountKey} from '../lib/learning.mjs';
import {createReferences,publicPostSignals} from '../lib/references.mjs';
const HOUR=3600000,epoch=1288834974657,origin=Date.UTC(2026,0,1);
const postUrl=(account,at,seq=1)=>`https://x.com/${account}/status/${((BigInt(at-epoch)<<22n)+BigInt(seq)).toString()}`;
const prediction=v=>({pipeline_version:'fixture-v1',keywords:[{term:'本地模型',score:90}],potential:{rows:['attention','value','discussion','sharing','safety'].map(key=>({key,score:v*100}))}});
function fixture(){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-learning-')),store=openData(path.join(directory,'data.sqlite3'));let clock=origin;return {store,learning:createLearning(store,{now:()=>clock}),references:createReferences(store,{now:()=>clock}),at:n=>{clock=n;},close:()=>{store.close();fs.rmSync(directory,{recursive:true,force:true});}};}
function record(f,account,at,index,v=.5){
 f.at(at-60000);const text=`我自己的帖子 ${index}`,draft_id='draft-'+index,result=prediction(v),url=postUrl(account,at,index+1);
 f.learning.recordPrediction({account,draft_id,text,result});
 f.at(at+1000);f.learning.bind({account,draft_id,url});return {text,url,draft_id,result};
}
test('opt-in, ownership, publication time and author boundaries protect training records',()=>{
 const f=fixture();try{
  assert.equal(accountKey('@Example'),'example');assert.throws(()=>accountKey('../bad'));
  assert.equal(postIdentity(postUrl('example',origin)).published_at,origin);
  assert.throws(()=>f.learning.configure({account:'example',enabled:true}));
  f.learning.recordPrediction({account:'example',draft_id:'private',text:'未开启学习的私有草稿',result:prediction(.5)});
  assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM learning_drafts').get().n,0);
  f.learning.configure({account:'example',enabled:true,owns_content:true});
  const row=record(f,'example',origin+HOUR,0);
  assert.throws(()=>f.learning.bind({account:'example',draft_id:row.draft_id,url:postUrl('someone',origin+HOUR)}),/作者/);
  f.at(origin+2*HOUR);f.learning.recordPrediction({account:'example',draft_id:'late',text:'发布后才评分',result:prediction(.5)});
  assert.throws(()=>f.learning.bind({account:'example',draft_id:'late',url:postUrl('example',origin+HOUR,9)}),/发布前/);
  const before=f.store.db.prepare('SELECT features,predicted_at FROM learning_drafts WHERE draft_id=?').get(row.draft_id);
  f.learning.recordPrediction({account:'example',draft_id:row.draft_id,text:row.text,result:prediction(.9)});
  assert.deepEqual(f.store.db.prepare('SELECT features,predicted_at FROM learning_drafts WHERE draft_id=?').get(row.draft_id),before);
 }finally{f.close();}
});
test('only the linked final text and real 24–26h exact snapshots become samples; misses stay missing',()=>{
 const f=fixture();try{
  f.learning.configure({account:'example',enabled:true,owns_content:true});const at=origin+HOUR,row=record(f,'example',at,0);
  const metrics={views:100,likes:3,replies:2,reposts:1};
  f.at(at+23*HOUR);assert.equal(f.learning.observation({url:row.url,original:row.text,metrics}).reason,'outside_24h_window');
  f.at(at+24*HOUR);assert.equal(f.learning.due().length,1);
  assert.equal(f.learning.observation({url:postUrl('other',at,10),original:row.text,metrics}).reason,'not_enrolled_own_post');
  assert.equal(f.learning.observation({url:row.url,original:'未重新评分的采纳稿',metrics}).reason,'content_mismatch');
  assert.equal(f.learning.observation({url:row.url,original:row.text,metrics:{...metrics,views:{value:100,approximate:true}}}).reason,'exact_metrics_required');
  const result=f.learning.observation({url:row.url,original:row.text,metrics});assert.equal(result.recorded,true);assert.equal(result.training.trained,false);
  assert.equal(f.learning.observation({url:row.url,original:row.text,metrics}).duplicate,true);
  const sample=f.learning.exportSamples({account:'example'})[0];assert.equal(sample.metrics.bookmarks,undefined,'missing bookmarks are not zero');
  const missed=record(f,'example',at+HOUR,1);f.at(at+28*HOUR);f.learning.due();assert.equal(f.learning.status({account:'example'}).posts.find(post=>post.url===missed.url).state,'missed_window');
  assert.equal(f.learning.observation({url:missed.url,original:missed.text,metrics}).recorded,false);
  assert.equal(f.learning.observation({url:missed.url,original:missed.text,metrics,observed_at:at+25*HOUR}).recorded,true,'a genuinely timestamped earlier snapshot can be imported later');
 }finally{f.close();}
});
test('chronological batches train an account model, isolate accounts, preserve pipeline versions and disable cleanly',()=>{
 const f=fixture();try{
  f.learning.configure({account:'example',enabled:true,owns_content:true});
  for(let i=0;i<35;i++){
   const at=origin+i*48*HOUR,v=(i%10)/10,row=record(f,'example',at,i,v);f.at(at+24*HOUR);
   const metrics={views:Math.round(Math.exp(4+3*v)),likes:Math.round(5+5*v),replies:1,reposts:1,bookmarks:2};
   f.learning.observation({url:row.url,original:row.text,metrics});
   if(i===28)assert.equal(f.learning.status({account:'example'}).models.length,0,'29 samples cannot train');
  }
  const status=f.learning.status({account:'example'});assert.equal(status.samples,35);assert.ok(status.active_version);assert.equal(status.models.length,2);
  assert.ok(status.models.some(model=>model.accepted&&model.validation_mae<model.baseline_mae*.95));
  const low=f.learning.personalize({account:'example',result:prediction(.1)}),high=f.learning.personalize({account:'example',result:prediction(.9)});
  assert.equal(high.status,'ready');assert.ok(high.score>low.score);assert.ok(high.score<=100&&low.score>=0);
  assert.equal(f.learning.personalize({account:'other',result:prediction(.9)}).score,null);
  assert.equal(f.learning.personalize({account:'example',result:{...prediction(.9),pipeline_version:'new-version'}}).score,null);
  f.learning.configure({account:'example',enabled:false});assert.equal(f.learning.personalize({account:'example',result:prediction(.9)}).status,'disabled');
 }finally{f.close();}
});
test('a candidate without validation improvement is rejected; promoted posts are excluded',()=>{
 const f=fixture();try{
  f.learning.configure({account:'flat',enabled:true,owns_content:true});
  for(let i=0;i<30;i++){
   const at=origin+i*48*HOUR,row=record(f,'flat',at,i,(i%10)/10);f.at(at+24*HOUR);f.learning.observation({url:row.url,original:row.text,metrics:{views:100,likes:2,replies:1,reposts:0}});
  }
  const status=f.learning.status({account:'flat'});assert.equal(status.models.length,1);assert.equal(status.models[0].accepted,0);assert.equal(status.active_version,null);
  assert.equal(f.learning.personalize({account:'flat',result:prediction(.5)}).status,'no_validated_model');
  assert.throws(()=>f.learning.rollback({account:'flat'}),/回退/);
  const at=origin+100*48*HOUR;f.at(at-1000);f.learning.recordPrediction({account:'flat',draft_id:'promoted',text:'付费推广',result:prediction(.9)});f.at(at+1000);const url=postUrl('flat',at,99);f.learning.bind({account:'flat',draft_id:'promoted',url,organic:false});f.at(at+24*HOUR);
  assert.equal(f.learning.observation({url,original:'付费推广',metrics:{views:99999,likes:1000,replies:1,reposts:1}}).recorded,false);
 }finally{f.close();}
});
test('browsed candidates retain provenance, public-rate denominators and unknown counts, without training authorization',()=>{
 const f=fixture();try{
  const url=postUrl('author',origin),original='有帮助的本地模型经验',metrics={views:{value:1000},likes:{value:20},replies:{value:10},reposts:{value:5}};
  f.at(origin+HOUR);f.references.observe({url,original,metrics});f.references.judged({url,text:original,result:{...prediction(.9),potential:{...prediction(.9).potential,score:90}}});
  let report=f.references.report({url});assert.equal(report.candidate,true);assert.equal(report.training_allowed,false);assert.equal(report.signals.bookmarks_per_1000_views,null);assert.equal(report.followers,null);
  f.references.author({account:'author',followers:{value:100},following:{value:20}});report=f.references.report({url});assert.equal(report.signals.views_per_follower,10);assert.equal(report.signals.replies_per_1000_views,10);
  assert.equal(f.references.list().length,1);assert.equal(f.learning.status({account:'author'}).samples,0,'browsing a high-scored post must not train an account');
  f.references.observe({url,original:'修改后的正文',metrics});assert.equal(f.references.list().length,0,'edited posts invalidate prior quality judgments');
  assert.equal(publicPostSignals({},null,origin,origin+HOUR).likes_per_1000_views,null);
 }finally{f.close();}
});

test('authorized reference learning uses outcomes, author-disjoint validation and versioned predictions',()=>{
 const f=fixture();try{
  assert.throws(()=>f.references.configure({enabled:true}),/依据/);
  f.references.configure({enabled:true,rights_basis:'Test-owned licensed fixture corpus'});
  for(let i=0;i<35;i++){
   const account='author'+i,at=origin+i*48*HOUR,v=(i%10)/10,url=postUrl(account,at,i+1),text='授权测试内容 '+i;
   f.at(at+23*HOUR);f.references.author({account,followers:{value:1000},following:{value:10}});
   f.at(at+24*HOUR);const metrics={views:{value:Math.round(1000*(Math.exp(.5+v*2)-1))},likes:{value:10},replies:{value:2},reposts:{value:1}};
   f.references.observe({url,original:text,metrics});
   const result=prediction(v);result.potential.score=i%2?90:40;
   f.references.judged({url,text,result});
  }
  const status=f.references.status();assert.equal(status.samples,35);assert.ok(status.active_version);assert.equal(status.models.length,2);
  const low=f.references.predict(prediction(.1)),high=f.references.predict(prediction(.9));assert.equal(high.status,'ready');assert.ok(high.score>low.score);
  assert.equal(f.references.list().length,17,'only high model scores appear in the candidate list, but normal cases remain training controls');
  assert.equal(f.references.predict({...prediction(.9),pipeline_version:'new'}).score,null);
  f.references.configure({enabled:false});assert.equal(f.references.predict(prediction(.9)).status,'disabled');
 }finally{f.close();}
});

test('account topics are derived from observed own-post outcomes, with zero-view failures retained',()=>{
 const f=fixture();try{
  f.learning.configure({account:'topics',enabled:true,owns_content:true});
  for(let i=0;i<8;i++){
   const at=origin+i*48*HOUR,row=record(f,'topics',at,i,i/10);
   f.store.db.prepare('INSERT INTO results VALUES(?,?,?,?,?,?,?)').run('analysis','topic-'+i,fingerprint(row.text),'fixture-v1','zh',JSON.stringify(row.result),at-60000);
   f.at(at+24*HOUR);f.learning.observation({url:row.url,original:row.text,metrics:{views:i*100,likes:i,replies:0,reposts:0}});
  }
  const state=f.learning.status({account:'topics'});assert.equal(state.samples,8);assert.equal(state.profile.user_tags[0].term,'本地模型');assert.equal(state.profile.audience_interests[0].term,'本地模型');assert.match(state.profile.note,/推测/);assert.equal(state.active_version,null);
 }finally{f.close();}
});

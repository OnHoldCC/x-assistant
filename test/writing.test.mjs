import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {rewritePrompt,validateRewrite} from '../lib/rewrite.mjs';
import {createGateway} from '../lib/gateway.mjs';
import {createAnalyzer} from '../lib/analysis.mjs';
import {openData,fingerprint} from '../lib/data.mjs';
const answer=text=>({choices:[{finish_reason:'stop',message:{content:text}}]});
test('content potential is bounded, rejects missing signals, and improves with stronger content judgments',()=>{
 const core=globalThis.OnHoldAnalysisCore;
 const signals=Object.fromEntries(Object.keys(core.POTENTIAL_QUESTIONS).map(id=>[id.slice(2),.4]));
 assert.equal(core.potentialScore(signals).score,40);
 assert.equal(core.potentialScore(Object.fromEntries(Object.keys(signals).map(key=>[key,1]))).score,100);
 assert.equal(core.potentialScore({...signals,sharing:.9}).score,50);
 assert.throws(()=>core.potentialScore({...signals,value:NaN}));
 assert.throws(()=>core.potentialScore({}));
});
test('rewrite rejects incomplete responses and changed protected facts, returns observable editing reasons',()=>{
 assert.throws(()=>rewritePrompt(''));
 assert.throws(()=>rewritePrompt('a'.repeat(4001)));
 const source='我试用了 3 天，发现这个工具很好用。 @onhold #LocalAI https://example.com/a';
 const result=validateRewrite(answer('试用了 3 天，这个工具很好用。 @onhold #LocalAI https://example.com/a'),source);
 assert.equal(result.changed,true);assert.ok(result.reasons.some(reason=>reason.includes('精简')));
 for(const text of [source.replace('3','5'),source.replace('https://example.com/a','https://bad.example'),source+' 99',source.replace('@onhold','@someone')])assert.throws(()=>validateRewrite(answer(text),source));
 assert.throws(()=>validateRewrite({choices:[{finish_reason:'length',message:{content:source}}]},source));
 assert.equal(validateRewrite(answer(source),source).changed,false);
 assert.match(rewritePrompt(source).messages[0].content,/不添加/);
});
test('rewrite endpoint caches separately from translation and validates before model execution',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-writing-'));let calls=0;
 const config={port:0,database:path.join(directory,'cache.sqlite3'),modelHash:'fixture',extensionIds:['abcdefghijklmnopabcdefghijklmnop']};
 const gateway=createGateway(config,process.pid,async payload=>{calls++;assert.match(payload.messages[0].content,/润色/);return answer('这个工具在本机运行，保护正文隐私。');});
 await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));config.port=gateway.server.address().port;
 const request=text=>fetch(`http://127.0.0.1:${config.port}/rewrite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
 try{
  assert.equal((await request('')).status,422);assert.equal(calls,0);
  const first=await (await request('正文隐私很重要。这个工具在本机运行。')).json();assert.equal(first.changed,true);assert.equal(first.cached,false);
  const second=await (await request('正文隐私很重要。这个工具在本机运行。')).json();assert.equal(second.cached,true);assert.equal(calls,1);
  assert.equal(gateway.store.db.prepare('SELECT COUNT(*) AS n FROM contents').get().n,0);
 }finally{gateway.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('draft scoring keeps its original out of saved post content and returns dimensions',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-draft-')),store=openData(path.join(directory,'cache.sqlite3'));
 const analyzer=createAnalyzer({store,translationVersion:'test',decisionVersion:'test',translate:async()=>{throw Error('not needed');},candidates:async()=>[],decide:async({questions})=>({answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,q.type==='score'?{score:3.2}:{noul:.8}]))})});
 try{
  const result=await analyzer({text:'这是尚未发布的私人草稿',purpose:'draft'});assert.equal(result.potential.score,80);assert.equal(result.potential.rows.length,5);
  assert.equal(store.lookup({content_hash:fingerprint('这是尚未发布的私人草稿')}).original,null);
  await assert.rejects(analyzer({text:'草稿',purpose:'publish'}));
 }finally{store.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('translation used for draft analysis does not retain the original or inflate translation counters',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-private-analysis-'));const gateway=createGateway({database:path.join(directory,'cache.sqlite3'),modelHash:'fixture'},process.pid,async()=>answer('这是草稿分析译文。'));
 try{await gateway.translate({text:'A private draft, not a published post.',target_lang:'zh',purpose:'draft_analysis'});assert.equal(gateway.store.db.prepare('SELECT COUNT(*) AS n FROM contents').get().n,0);assert.equal(gateway.store.counters().segments,0);}
 finally{gateway.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('rubric scores use ordinal levels, reject legacy binary confidence and expose the basis',()=>{
 const core=globalThis.OnHoldAnalysisCore;
 assert.ok(Object.values(core.POTENTIAL_QUESTIONS).every(q=>q.type==='score'&&q.criteria.length===5));
 const answers={...Object.fromEntries(Object.keys(core.CONTENT_QUESTIONS).map(id=>[id,{noul:.99}])),...Object.fromEntries(Object.keys(core.POTENTIAL_QUESTIONS).map(id=>[id,{score:1,confidence:.9999}]))};
 const value=core.readDecisions({answers},[]),result=core.potentialScore(value.signals);assert.equal(result.score,25);assert.ok(result.rows.every(row=>row.basis));assert.ok(result.reasons.every(reason=>reason.includes('：')));
 answers.p_value={noul:.9999};assert.throws(()=>core.readDecisions({answers},[]));
});

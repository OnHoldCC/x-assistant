import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createGateway,validateTranslation} from '../lib/gateway.mjs';
test('translation input bounds, no implicit API access',()=>{for(const body of [{text:''},{text:'x'.repeat(4001)},{text:'hello',target_lang:'unknown'},{text:'hello',purpose:'publish'}])assert.throws(()=>validateTranslation(body));assert.equal(validateTranslation({text:'hello'}).target_lang,'zh');});
test('gateway protocol, cache, source restrictions and private config',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-assistant-gateway-'));let calls=0;
 const config={port:0,database:path.join(directory,'cache.sqlite3'),modelHash:'fixed',instance:'fixture-instance',controlToken:'secret-control',extensionIds:['abcdefghijklmnopabcdefghijklmnop'],extensionPath:'C:\\Users\\Example\\extension',device:'CPU'};
 const gateway=createGateway(config,process.pid,async payload=>{calls++;assert.equal(payload.model,'hy-mt2-1.8b-q8');return {choices:[{finish_reason:'stop',message:{content:'会议时间是 10:30。https://example.com/doc'}}]};});
 await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));config.port=gateway.server.address().port;const base=`http://127.0.0.1:${config.port}`;
 try{
 const headers={'Content-Type':'application/json',Origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop'};
 const first=await fetch(base+'/translate',{method:'POST',headers,body:JSON.stringify({text:'The meeting is at 10:30. https://example.com/doc'})}).then(r=>r.json());assert.equal(first.cached,false);assert.equal(typeof first.elapsed_ms,'number');assert.match(first.text,/10:30/);
 const second=await fetch(base+'/translate',{method:'POST',headers,body:JSON.stringify({text:'The meeting is at 10:30. https://example.com/doc'})}).then(r=>r.json());assert.equal(second.cached,true);assert.equal(calls,1);
 assert.equal((await fetch(base+'/metrics',{headers:{Origin:'https://example.com'}})).status,403);
 assert.equal((await fetch(base+'/translate',{method:'POST',headers,body:'{"text":"","target_lang":"en"}'})).status,422);
 assert.equal((await fetch(base+'/control/stop',{method:'POST',headers})).status,403);
 const health=await fetch(base+'/health').then(r=>r.text());assert.doesNotMatch(health,/secret-control|backendKey/);
 assert.ok((await fetch(base+'/setup').then(r=>r.text())).includes('Chrome'));assert.equal((await fetch(base+'/unknown')).status,404);
 const status=await fetch(base+'/metrics').then(r=>r.json());assert.equal(status.translation_calls,1);assert.equal('translation_gpu_percent' in status,false);assert.ok(status.translation_process_rss_mb>0);
 }finally{gateway.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('broken cache is preserved without blocking translation',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-assistant-broken-')),file=path.join(directory,'cache.sqlite3');fs.writeFileSync(file,'broken original cache');
 const gateway=createGateway({database:file,modelHash:'fixed'},process.pid,async()=>({choices:[{finish_reason:'stop',message:{content:'开源'}}]}));
 try{const translated=await gateway.translate({text:'open source'});assert.equal(translated.text,'开源');assert.ok(translated.cache_warning);assert.equal(fs.readFileSync(file,'utf8'),'broken original cache');}finally{gateway.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('an English paragraph mentioning Chinese names still translates',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-assistant-mixed-'));let called=false;const gateway=createGateway({database:path.join(directory,'cache.sqlite3'),modelHash:'fixed'},process.pid,async()=>{called=true;return {choices:[{finish_reason:'stop',message:{content:'这是提及中文名字的英文正文。'}}]};});
 try{const result=await gateway.translate({text:'This English paragraph mentions 中文 while most of the post is written in English.'});assert.equal(called,true);assert.equal(result.unchanged,undefined);assert.match(result.text,/英文/);}finally{gateway.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('observed page translation retains provenance without putting unknown originals into training records',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-native-observe-')),config={port:0,database:path.join(directory,'cache.sqlite3'),extensionIds:[]},gateway=createGateway(config,process.pid);
 await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));config.port=gateway.server.address().port;
 const request=body=>fetch(`http://127.0.0.1:${config.port}/observe`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const body={url:'https://x.com/example/status/1234567890123456789',original:null,translation:{provider:'x_grok_dom',text:'页面已显示的中文译文',complete:false}};
 try{
  const result=await (await request(body)).json();assert.equal(result.translation_recorded,true);assert.equal(result.original_available,false);
  assert.equal(gateway.store.db.prepare('SELECT COUNT(*) AS n FROM contents').get().n,0);assert.equal(gateway.store.db.prepare('SELECT COUNT(*) AS n FROM documents').get().n,0);
  const saved=JSON.parse(gateway.store.db.prepare("SELECT value FROM results WHERE kind='native_translation'").get().value);assert.equal(saved.provider,'x_grok_dom');assert.equal(saved.original_text,null);assert.equal(saved.complete,false);
  assert.equal((await request({...body,url:'https://evil.example/post'})).status,422);assert.equal((await request({...body,translation:{...body.translation,provider:'unknown'}})).status,422);
  const known={...body,original:'The actual observed original.'};assert.equal((await request(known)).status,200);
  assert.equal(gateway.store.lookup({url:body.url}).original,known.original);
  assert.equal(gateway.store.db.prepare('SELECT COUNT(*) AS n FROM contents WHERE original=?').get(body.translation.text).n,0);
 }finally{gateway.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('cold translation reports preparation, resumes on readiness, and cache reads do not load the model',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-cold-'));let preparations=0,inferences=0;
 const config={port:0,database:path.join(dir,'cache.sqlite3'),modelHash:'cold',extensionIds:[],translationState:'not_loaded',ensureTranslation:async()=>{preparations++;config.translationState='preparing';}};
 const gateway=createGateway(config,undefined,async()=>{inferences++;return {choices:[{finish_reason:'stop',message:{content:'你好'}}]};});
 await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));config.port=gateway.server.address().port;
 const request=()=>fetch(`http://127.0.0.1:${config.port}/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Hello'})});
 try{const cold=await request();assert.equal(cold.status,503);assert.equal((await cold.json()).code,'TRANSLATION_PREPARING');assert.equal(preparations,1);assert.equal(inferences,0);config.translationState='ready';assert.equal((await (await request()).json()).text,'你好');config.translationState='not_loaded';assert.equal((await (await request()).json()).cached,true);assert.equal(preparations,1);assert.equal(inferences,1);
 const state=await fetch(`http://127.0.0.1:${config.port}/metrics`).then(r=>r.json());assert.equal(state.translation_loaded,false);assert.equal(state.translation_state,'not_loaded');
 }finally{gateway.close();fs.rmSync(dir,{recursive:true,force:true});}
});

import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openData} from '../lib/data.mjs';import {createAnalyzer} from '../lib/analysis.mjs';
test('translation → phrases → typed decisions; cached analysis survives restart and isolates model versions',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-analysis-'));let store=openData(path.join(root,'records.sqlite3')),translated=0,decided=0;const args=()=>({store,translationVersion:'hy-v1',decisionVersion:'laya-v1',translate:async({text})=>{translated++;assert.match(text,/open source/);return {text:'本地模型与开源项目'};},candidates:async text=>{assert.match(text,/本地模型/);return ['本地模型','开源项目'];},decide:async({questions})=>{decided++;return {answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,q.type==='score'?{score:3.6}:{noul:.9}]))};}});
 try{let analyze=createAnalyzer(args());const first=await analyze({text:'An open source local model.',to_chinese:true});assert.deepEqual(first.keywords.map(row=>row.term),['本地模型','开源项目']);assert.equal(first.content,90);await analyze({text:'An open source local model.',to_chinese:true});assert.equal(translated,1);assert.equal(decided,1);store.close();store=openData(path.join(root,'records.sqlite3'));analyze=createAnalyzer(args());assert.equal((await analyze({text:'An open source local model.',to_chinese:true})).cache_layer,'sqlite');assert.equal(decided,1);analyze=createAnalyzer({...args(),decisionVersion:'laya-v2'});await analyze({text:'An open source local model.',to_chinese:true});assert.equal(decided,2);
 }finally{store.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('observed Grok translation is analyzed directly, isolated from original caches and never saved as the original',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-native-analysis-')),store=openData(path.join(root,'records.sqlite3'));let translations=0;
 const analyze=createAnalyzer({store,translationVersion:'test',decisionVersion:'test',translate:async()=>{translations++;throw Error('native text must not be translated again');},candidates:async()=>[],decide:async({questions})=>({answers:Object.fromEntries(Object.entries(questions).map(([id,q])=>[id,q.type==='score'?{score:2}:{noul:.5}]))})});
 try{
  const result=await analyze({text:'页面显示的 Grok 译文',input_source:'x_grok_translation',to_chinese:true});assert.equal(translations,0);assert.equal(result.original_available,false);assert.equal(result.input_source,'x_grok_translation');assert.match(result.pipeline_version,/:x-grok-dom$/);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM contents').get().n,0);
  await assert.rejects(analyze({text:'hello',input_source:'x_grok_translation',purpose:'draft'}));
  await assert.rejects(analyze({text:'hello',input_source:'unknown'}));
  await assert.rejects(analyze({text:'hello',input_source:'x_grok_translation',original_text:12}));
 }finally{store.close();fs.rmSync(root,{recursive:true,force:true});}
});

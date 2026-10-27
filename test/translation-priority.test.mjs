import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createGateway} from '../lib/gateway.mjs';
test('visible reading translation starts ahead of queued analysis translation',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-translation-priority-')),started=[],release=new Map();
 const gateway=createGateway({database:path.join(directory,'cache.sqlite3'),modelHash:'fixture'},process.pid,payload=>{
  const text=payload.messages[0].content.split('\n\n').at(-1);started.push(text);
  return new Promise(resolve=>release.set(text,()=>resolve({choices:[{finish_reason:'stop',message:{content:'译文：'+text}}]})));
 });
 const first=gateway.translate({text:'analysis first',purpose:'analysis'}),second=gateway.translate({text:'analysis second',purpose:'analysis'}),queued=gateway.translate({text:'analysis queued',purpose:'analysis'}),reading=gateway.translate({text:'visible reading',purpose:'reading'});
 try{
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(started,['analysis first','analysis second']);
  release.get('analysis first')();await first;await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(started,['analysis first','analysis second','visible reading']);
  release.get('analysis second')();await second;await new Promise(resolve=>setImmediate(resolve));assert.equal(started.at(-1),'analysis queued');
  release.get('visible reading')();release.get('analysis queued')();await Promise.all([reading,queued]);
 }finally{gateway.close();fs.rmSync(directory,{recursive:true,force:true});}
});

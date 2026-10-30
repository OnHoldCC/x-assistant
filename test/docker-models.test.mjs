import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {verify} from '../docker/prepare-models.mjs';
import {createGateway} from '../lib/gateway.mjs';
test('model verifier rejects missing, truncated and same-size corrupted model files',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-model-verify-'));
  try {
    const file=path.join(directory,'fixture.gguf'),asset={size:4,sha256:createHash('sha256').update('okay').digest('hex')};
    assert.equal(await verify(file,asset),false);
    fs.writeFileSync(file,'bad');assert.equal(await verify(file,asset),false);
    fs.writeFileSync(file,'evil');assert.equal(await verify(file,asset),false);
    fs.writeFileSync(file,'okay');assert.equal(await verify(file,asset),true);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('container gateway retains strict Host and Origin validation',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-container-guard-'));
  const config={port:0,database:path.join(directory,'cache.sqlite3'),extensionIds:['fixture'],container:true};
  const gateway=createGateway(config);
  await new Promise(resolve=>gateway.server.listen(0,'127.0.0.1',resolve));config.port=gateway.server.address().port;
  try {
    const base=`http://127.0.0.1:${config.port}`;
    assert.equal((await fetch(base+'/health')).status,200);
    const forbidden=await new Promise((resolve,reject)=>http.get(base+'/health',{headers:{Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject));
    assert.equal(forbidden,403);
    assert.equal((await fetch(base+'/health',{headers:{Origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(base+'/health',{headers:{Origin:'chrome-extension://fixture'}})).status,200);
  } finally { gateway.close();fs.rmSync(directory,{recursive:true,force:true}); }
});
test('weight download resumes safely, restarts when ranges are ignored, and bounds bytes',async()=>{
  const {download}=await import('../docker/prepare-models.mjs');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-model-resume-')),file=path.join(directory,'model.part'),original=globalThis.fetch;
  const asset={url:'https://weights.example/model',name:'fixture',size:6};
  try {
    fs.writeFileSync(file,'abc');
    globalThis.fetch=async(_url,options)=>{assert.equal(options.headers.Range,'bytes=3-');return new Response('def',{status:206,headers:{'content-range':'bytes 3-5/6'}});};
    await download(asset,file);assert.equal(fs.readFileSync(file,'utf8'),'abcdef');
    fs.writeFileSync(file,'bad');
    globalThis.fetch=async()=>new Response('abcdef');await download(asset,file);assert.equal(fs.readFileSync(file,'utf8'),'abcdef');
    fs.writeFileSync(file,'abc');
    globalThis.fetch=async()=>new Response('def',{status:206,headers:{'content-range':'bytes 0-2/6'}});
    await assert.rejects(()=>download(asset,file),/断点不匹配/);assert.equal(fs.readFileSync(file,'utf8'),'abc');
    globalThis.fetch=async()=>new Response('too long payload');await assert.rejects(()=>download(asset,file),/超过预期大小/);
    await assert.rejects(()=>download({...asset,url:'http://weights.example/model'},file),/HTTPS/);
  } finally {globalThis.fetch=original;fs.rmSync(directory,{recursive:true,force:true});}
});
test('optional Codex worker authenticates and returns only final text with tools disabled',async()=>{
  const {createCodexServer}=await import('../docker/codex.mjs');let calls=0;
  const server=createCodexServer('private-key',async(args,prompt,_timeout,directory)=>{
    calls++;if(args[0]==='login')return 0;assert.ok(args.includes('--json'));
    assert.ok(args.includes('read-only'));assert.ok(args.includes('--ignore-user-config'));
    assert.ok(args.includes('shell_tool'));assert.ok(args.includes('unified_exec'));
    assert.equal(args[args.indexOf('--model')+1],'fixture-model');
    if(args.includes('--output-schema')) {
      const schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1],'utf8'));
      assert.equal(schema.additionalProperties,false);assert.ok(schema.required.includes('text'));if(args[args.indexOf('--output-schema')+1].endsWith('reply-schema.json'))assert.equal(schema.properties.text.maxLength,120);else assert.ok(schema.required.includes('analysis'));
    }
    assert.equal(prompt,'fixed-instructions\n\nuntrusted-data');assert.ok(directory.startsWith(os.tmpdir()));
    fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'final fixture');return {code:0,usage:{input_tokens:100,output_tokens:20,cached_input_tokens:60}};
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/rpc`;
  const request=(body,key='private-key',origin)=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`,...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  try {
    assert.equal((await request({operation:'status'},'wrong')).status,403);assert.equal(calls,0);
    assert.equal((await request({operation:'status'},'private-key','https://evil.example')).status,403);
    assert.equal((await (await request({operation:'status'})).json()).ready,true);
    const result=await request({operation:'generate',instructions:'fixed-instructions',prompt:'untrusted-data',model:'fixture-model',output_format:'replicate_v1'});
    const value=await result.json();assert.equal(result.status,200,JSON.stringify(value));assert.deepEqual(value,{text:'final fixture',usage:{input_tokens:100,output_tokens:20,cached_input_tokens:60,total_tokens:120}});
    assert.equal((await request({operation:'generate',instructions:'fixed-instructions',prompt:'untrusted-data',model:'fixture-model',output_format:'reply_v1'})).status,200);
    assert.equal((await request({operation:'generate',instructions:'x',prompt:'x'.repeat(160001)})).status,413);
    assert.equal((await request({operation:'generate',instructions:'x',prompt:'x',output_format:'arbitrary-file'})).status,422);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test('news worker enables live search only for news and requires an actual search event',async()=>{
  const {createCodexServer}=await import('../docker/codex.mjs');let searched=false;
  const server=createCodexServer('fixture-key',async(args,_prompt,_timeout,directory)=>{
    assert.ok(args.includes('web_search="live"'));assert.ok(args.includes('shell_tool'));
    assert.ok(args[args.indexOf('--output-schema')+1].endsWith('news-schema.json'));
    fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'news fixture');
    if(searched)fs.writeFileSync(path.join(directory,'events.jsonl'),JSON.stringify({type:'item.completed',item:{type:'web_search',query:'news'}})+'\n');
    return {code:0,usage:{input_tokens:10,output_tokens:5}};
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=()=>fetch(`http://127.0.0.1:${server.address().port}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-key'},body:JSON.stringify({operation:'generate',instructions:'news instructions',prompt:'news query',output_format:'news_v1'})});
  try{assert.equal((await request()).status,422);searched=true;const response=await request();assert.equal(response.status,200);assert.equal((await response.json()).searched,true);}finally{await new Promise(resolve=>server.close(resolve));}
});

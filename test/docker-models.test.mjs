import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {verify} from '../docker/prepare-models.mjs';
import {createGateway} from '../lib/gateway.mjs';
test('Docker backend copies every embedded runtime library asset',()=>{
 const dockerfile=fs.readFileSync(new URL('../docker/Dockerfile.web',import.meta.url),'utf8');
 const backend=dockerfile.split(' AS backend\n')[1].split('\nFROM ')[0];
 const copied=new Set([...backend.matchAll(/^COPY (.+) lib\/$/gm)].flatMap(match=>match[1].split(/\s+/)));
 const source=new URL('../backend/src/',import.meta.url);let checked=0;
 for(const file of fs.readdirSync(source,{recursive:true}).filter(name=>name.endsWith('.rs'))){
  const text=fs.readFileSync(new URL(file.replaceAll('\\','/'),source),'utf8');
  for(const match of text.matchAll(/include_(?:str|bytes)!\("(?:\.\.\/)+lib\/([^\"]+)"\)/g)){
   assert.ok(copied.has('lib/')||copied.has('lib/'+match[1]),'Missing embedded asset in Docker build: '+match[1]);checked++;
  }
 }
 assert.ok(checked>0);
});
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

test('RSS-grounded drafts use the news schema with web search disabled',async()=>{
 const {createCodexServer}=await import('../docker/codex.mjs');
 const server=createCodexServer('fixture-key',async(args,_prompt)=>{
  assert.ok(args.includes('web_search="disabled"'));assert.ok(!args.includes('web_search="live"'));
  assert.ok(args[args.indexOf('--output-schema')+1].endsWith('news-schema.json'));
  fs.writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify({schema_version:1,news:null,text:'',skip_reason:'No suitable source in the fixture'}));
  return {code:0,usage:{input_tokens:100,output_tokens:10}};
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-key'},body:JSON.stringify({operation:'generate',instructions:'RSS-only summary',prompt:'verified source data',output_format:'news_draft_v1'})});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.usage.total_tokens,110);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('video captions attach only bounded images from shared video storage with tools disabled',async()=>{
 const {createCodexServer}=await import('../docker/codex.mjs');const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'onhold-caption-images-'))),image=path.join(root,'caption-preview.jpg');fs.writeFileSync(image,Buffer.from([255,216,0,0,255,217]));let calls=0;
 const server=createCodexServer('caption-key',async(args,_prompt,_timeout,directory)=>{calls++;assert.equal(args[args.indexOf('--image')+1],image);assert.ok(args.includes('web_search="disabled"'));assert.ok(args.includes('shell_tool'));assert.ok(args[args.indexOf('--output-schema')+1].endsWith('video-caption-schema.json'));fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'{"schema_version":1,"status":"ready","text":"A kitten playing.","reason":""}');return {code:0,usage:{input_tokens:10,output_tokens:5}};},root);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const request=body=>fetch(`http://127.0.0.1:${server.address().port}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer caption-key'},body:JSON.stringify({operation:'generate',instructions:'caption instructions',prompt:'untrusted title',output_format:'video_caption_v1',...body})});
 try{assert.equal((await request({image_paths:[]})).status,422);assert.equal((await request({image_paths:['/etc/passwd']})).status,422);assert.equal(calls,0);const valid=await request({image_paths:[image]});assert.equal(valid.status,200,await valid.text());assert.equal(calls,1);}
 finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

test('batch video screening accepts bounded generated review images with its own schema',async()=>{
 const {createCodexServer}=await import('../docker/codex.mjs');const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'onhold-screen-images-'))),images=[];let calls=0;
 for(let n=0;n<5;n++){const folder=path.join(root,String(n));fs.mkdirSync(folder);for(const name of ['caption-preview.jpg','source-last.jpg']){const file=path.join(folder,name);fs.writeFileSync(file,Buffer.from([255,216,0,0,255,217]));images.push(file);}}
 const server=createCodexServer('screen-key',async(args)=>{calls++;assert.equal(args.filter(v=>v==='--image').length,10);assert.ok(args[args.indexOf('--output-schema')+1].endsWith('video-screening-schema.json'));assert.ok(args.includes('web_search="disabled"'));fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'{"schema_version":1,"items":[]}');return 0;},root);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const request=paths=>fetch(`http://127.0.0.1:${server.address().port}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer screen-key'},body:JSON.stringify({operation:'generate',instructions:'screen only',prompt:'batch',output_format:'video_screening_v1',image_paths:paths})});
 try{assert.equal((await request([...images,images[0]])).status,422);const valid=await request(images);assert.equal(valid.status,200,await valid.text());assert.equal(calls,1);}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

test('puzzle reviews accept only one poster or five bounded same-folder review JPEGs',async()=>{
 const {createCodexServer}=await import('../docker/codex.mjs');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'onhold-funny-image-'))),videoRoot=path.join(root,'tiktok'),images=path.join(root,'images');fs.mkdirSync(videoRoot);fs.mkdirSync(images);
 const image=path.join(images,'image.jpg');fs.writeFileSync(image,Buffer.from([255,216,0,0,255,217]));let calls=0;
 const server=createCodexServer('image-key',async(args,_prompt,_timeout,directory)=>{calls++;assert.equal(args[args.indexOf('--image')+1],image);assert.ok(args.includes('web_search="disabled"'));assert.ok(args[args.indexOf('--output-schema')+1].endsWith('funny-image-schema.json'));fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'{"schema_version":1,"image_type":"photo","status":"ready","text":"The boss is taking a break. #Cats","reason":"反差"}');return 0;},videoRoot);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const request=paths=>fetch(`http://127.0.0.1:${server.address().port}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer image-key'},body:JSON.stringify({operation:'generate',instructions:'caption',prompt:'source',output_format:'funny_image_v1',image_paths:paths})});
 try{assert.equal((await request([image])).status,200);const details=Array.from({length:4},(_,i)=>path.join(images,`scene-${i}.jpg`));for(const file of details)fs.copyFileSync(image,file);assert.equal((await request([image,...details])).status,200);assert.equal((await request([image,image])).status,422);assert.equal((await request([])).status,422);const wrong=path.join(videoRoot,'image.jpg');fs.copyFileSync(image,wrong);assert.equal((await request([wrong])).status,422);assert.equal(calls,2);}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

test('meme screening accepts four same-folder candidates or an original/edited pair with no tools',async()=>{
 const {createCodexServer}=await import('../docker/codex.mjs');
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'onhold-meme-screen-'))),videoRoot=path.join(root,'tiktok'),folder=path.join(root,'images','fixture');fs.mkdirSync(videoRoot);fs.mkdirSync(folder,{recursive:true});
 const images=Array.from({length:4},(_,i)=>path.join(folder,`scene-${i}.jpg`));for(const file of [...images,path.join(folder,'image.jpg')])fs.writeFileSync(file,Buffer.from([255,216,0,0,255,217]));let calls=0;
 const server=createCodexServer('meme-key',async(args)=>{calls++;assert.ok(args.includes('web_search="disabled"'));assert.ok(args.includes('shell_tool'));assert.ok(args[args.indexOf('--output-schema')+1].endsWith('meme-screen-schema.json'));fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'{"schema_version":1,"items":[]}');return 0;},videoRoot);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const request=paths=>fetch(`http://127.0.0.1:${server.address().port}/rpc`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer meme-key'},body:JSON.stringify({operation:'generate',instructions:'political screening',prompt:'batch',output_format:'meme_screen_v1',image_paths:paths})});
 try{assert.equal((await request(images)).status,200);assert.equal((await request([images[0],path.join(folder,'image.jpg')])).status,200);assert.equal((await request([...images,images[0]])).status,422);assert.equal((await request([])).status,422);assert.equal((await request(['/etc/passwd'])).status,422);assert.equal(calls,2);}finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

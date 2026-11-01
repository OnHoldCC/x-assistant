import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadTikTokVideo} from '../extension/tiktok.js';
test('plugin sends only the current TikTok page URL to the backend',async t=>{
 const old=globalThis.chrome;t.after(()=>{if(old===undefined)delete globalThis.chrome;else globalThis.chrome=old;});
 globalThis.chrome={tabs:{query:async()=>[{id:7,url:'https://www.tiktok.com/@creator/video/123?tracking=1'}]}};
 const result=await downloadTikTokVideo(async url=>{assert.equal(url,'https://www.tiktok.com/@creator/video/123?tracking=1');return {filename:'/backend/media/source.mp4',bytes:1234};});
 assert.equal(result.filename,'/backend/media/source.mp4');
 await assert.rejects(downloadTikTokVideo(async()=>{throw Error('TikTok 拒绝视频下载');}),/拒绝视频下载/);
});
test('plugin refuses homepages, non-TikTok URLs and malformed video targets without contacting the backend',async t=>{
 const old=globalThis.chrome;t.after(()=>{if(old===undefined)delete globalThis.chrome;else globalThis.chrome=old;});
 for(const url of ['https://www.tiktok.com/','https://evil.example/@creator/video/123','https://www.tiktok.com.evil.example/@creator/video/123','https://www.tiktok.com/@creator/video/not-a-number']){
  globalThis.chrome={tabs:{query:async()=>[{id:7,url}]}};
  await assert.rejects(downloadTikTokVideo(async()=>assert.fail('invalid URLs must not reach the backend')),/具体的 TikTok 视频/);
 }
});

test('video plans skip known clips and queue only one new URL with owned capture context',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);
 const {collectTikTokVideos}=await import('../extension/tiktok.js');let calls=0,verifications=0;
 globalThis.chrome={tabs:{create:async()=>assert.fail('direct video URLs do not open browser tabs')}};
 await collectTikTokVideos({id:'capture',client:'client',input:{known_ids:['123'],source_urls:['https://www.tiktok.com/@cats/video/123','https://www.tiktok.com/@cats/video/456','https://www.tiktok.com/@cats/video/789']}},async(operation,input,timeout)=>{
  calls++;assert.equal(operation,'download_tiktok_video');assert.deepEqual(input,{account:'example',url:'https://www.tiktok.com/@cats/video/456',capture_job:'capture',client:'client'});assert.equal(timeout,90000);
 },'example',async()=>verifications++);
 assert.equal(calls,1);assert.equal(verifications,1);
 await assert.rejects(collectTikTokVideos({input:{source_urls:['https://evil.example/']}},async()=>assert.fail(),'example',async()=>{}),/来源页面无效/);
});
test('TikTok page capture closes its reader and rejects verification pages without downloading',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');let removed=0,detached=0,downloads=0,blocked=false;
 globalThis.chrome={tabs:{create:async options=>{assert.equal(options.active,false);return {id:7};},remove:async()=>removed++},debugger:{getTargets:async()=>[],attach:async()=>{},detach:async()=>detached++,sendCommand:async()=>({result:{value:blocked?{blocked:true,urls:[]}:{urls:['https://www.tiktok.com/@cats/video/456','https://evil.example/@cats/video/789']}}})}};
 const job={id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/search?q=cats'],known_ids:[]}};
 await collectTikTokVideos(job,async()=>downloads++,'example',async()=>{});assert.equal(downloads,1);assert.equal(removed,1);assert.equal(detached,1);
 blocked=true;await assert.rejects(collectTikTokVideos(job,async()=>assert.fail(),'example',async()=>{}),/安全验证/);assert.equal(removed,2);assert.equal(detached,2);
});

test('TikTok homepage reads embedded feed data when there are no video anchor links',async t=>{
 const previous={document:globalThis.document,location:globalThis.location};t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 const {inspectTikTokVideos}=await import('../extension/tiktok.js');
 globalThis.location={protocol:'https:',hostname:'www.tiktok.com',pathname:'/'};
 const raw=JSON.stringify({__DEFAULT_SCOPE__:{'webapp.foryou.video':{statusCode:0,itemList:[{id:'12345678901234567890',author:{uniqueId:'kitten.creator'},video:{},desc:'A kitten plays'},{id:'456',author:{uniqueId:'advert'},video:{},isAd:true},{id:'789',author:{uniqueId:'../../bad'},video:{}}]},'webapp.a-b':Array.from({length:11000},()=>({noise:{}}))}});
 globalThis.document={readyState:'complete',body:{innerText:''},querySelectorAll:()=>[],getElementById:id=>id==='__UNIVERSAL_DATA_FOR_REHYDRATION__'?{textContent:raw}:null};
 assert.deepEqual(inspectTikTokVideos(),{urls:['https://www.tiktok.com/embed/v2/789','https://www.tiktok.com/@kitten.creator/video/12345678901234567890'],blocked:false,page:{path:'/',ready:'complete',videos:0}});
 globalThis.document.getElementById=()=>({textContent:'invalid JSON'});assert.deepEqual(inspectTikTokVideos(),{urls:[],blocked:false,page:{path:'/',ready:'complete',videos:0}});
});

test('video capture reuses a ready matching TikTok page without scrolling or closing it',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');let detached=0,downloads=0;
 globalThis.chrome={tabs:{create:async()=>assert.fail('already open source must be reused'),remove:async()=>assert.fail('user page must remain open')},debugger:{getTargets:async()=>[{type:'page',tabId:12,url:'https://www.tiktok.com/?lang=en',attached:false}],attach:async()=>{},detach:async()=>detached++,sendCommand:async(target,method,args)=>{assert.equal(target.tabId,12);assert.ok(!args.expression.includes('window.scrollBy'));return {result:{value:{urls:['https://www.tiktok.com/@cats/video/456']}}};}}};
 await collectTikTokVideos({id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/']}},async()=>downloads++,'example',async()=>{});assert.equal(downloads,1);assert.equal(detached,1);
});
test('an already processed open page falls back to a fresh reader and keeps the user page intact',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');const closed=[],detached=[];
 globalThis.chrome={tabs:{create:async()=>({id:7}),remove:async id=>closed.push(id)},debugger:{getTargets:async()=>[{type:'page',tabId:12,url:'https://www.tiktok.com/',attached:false}],attach:async()=>{},detach:async target=>detached.push(target.tabId),sendCommand:async target=>({result:{value:{urls:[`https://www.tiktok.com/@cats/video/${target.tabId===12?'123':'456'}`]}}})}};
 await collectTikTokVideos({id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/'],known_ids:['123']}},async(_op,input)=>assert.equal(input.url,'https://www.tiktok.com/@cats/video/456'),'example',async()=>{});assert.deepEqual(closed,[7]);assert.deepEqual(detached,[12,7]);
});
test('empty source errors report actual page readiness instead of claiming a login failure',async t=>{
 const old=globalThis.chrome,oldTimer=globalThis.setTimeout;t.after(()=>{globalThis.chrome=old;globalThis.setTimeout=oldTimer;});const {collectTikTokVideos}=await import('../extension/tiktok.js');
 globalThis.setTimeout=fn=>{queueMicrotask(fn);return 0;};globalThis.chrome={tabs:{create:async()=>({id:7}),remove:async()=>{}},debugger:{getTargets:async()=>[],attach:async()=>{},detach:async()=>{},sendCommand:async()=>({result:{value:{urls:[],page:{path:'/foryou',ready:'complete',videos:3}}}})}};
 await assert.rejects(collectTikTokVideos({input:{source_urls:['https://www.tiktok.com/']}},async()=>assert.fail(),'example',async()=>{}),error=>error.message.includes('播放器 3 个')&&error.message.includes('未调用模型')&&!error.message.includes('登录'));
});

 test('video IDs can be queued without any author metadata',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');
 globalThis.chrome={tabs:{create:async()=>assert.fail('embed URLs already identify the video')}};
 await collectTikTokVideos({id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/embed/v2/123']}},async(operation,input)=>{assert.equal(operation,'download_tiktok_video');assert.equal(input.url,'https://www.tiktok.com/embed/v2/123');},'example',async()=>{});
 });

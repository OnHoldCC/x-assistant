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
 globalThis.chrome={tabs:{create:async options=>{assert.equal(options.active,false);return {id:7};},remove:async()=>removed++},debugger:{onEvent:{addListener(){},removeListener(){}},getTargets:async()=>[],attach:async()=>{},detach:async()=>detached++,sendCommand:async()=>({result:{value:blocked?{blocked:true,urls:[]}:{urls:['https://www.tiktok.com/@cats/video/456','https://evil.example/@cats/video/789']}}})}};
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
 const page=inspectTikTokVideos();assert.deepEqual(page.urls,['https://www.tiktok.com/embed/v2/12345678901234567890','https://www.tiktok.com/embed/v2/456','https://www.tiktok.com/embed/v2/789']);assert.equal(page.blocked,false);assert.ok(page.candidates[0].text.includes('A kitten plays'));assert.ok(page.candidates[1].text.includes('sponsored'));
 globalThis.document.getElementById=()=>({textContent:'invalid JSON'});assert.deepEqual(inspectTikTokVideos(),{urls:[],candidates:[],blocked:false,page:{path:'/',ready:'complete',videos:0}});
});

test('video capture reuses a ready matching TikTok page without scrolling or closing it',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');let detached=0,downloads=0;
 globalThis.chrome={tabs:{create:async()=>assert.fail('already open source must be reused'),remove:async()=>assert.fail('user page must remain open')},debugger:{onEvent:{addListener(){},removeListener(){}},getTargets:async()=>[{type:'page',tabId:12,url:'https://www.tiktok.com/?lang=en',attached:false}],attach:async()=>{},detach:async()=>detached++,sendCommand:async(target,method,args)=>{assert.equal(target.tabId,12);assert.ok(!args.expression.includes('window.scrollBy'));return {result:{value:{urls:['https://www.tiktok.com/@cats/video/456']}}};}}};
 await collectTikTokVideos({id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/']}},async()=>downloads++,'example',async()=>{});assert.equal(downloads,1);assert.equal(detached,1);
});
test('an already processed open page falls back to a fresh reader and keeps the user page intact',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');const closed=[],detached=[];
 globalThis.chrome={tabs:{create:async()=>({id:7}),remove:async id=>closed.push(id)},debugger:{onEvent:{addListener(){},removeListener(){}},getTargets:async()=>[{type:'page',tabId:12,url:'https://www.tiktok.com/',attached:false}],attach:async()=>{},detach:async target=>detached.push(target.tabId),sendCommand:async target=>({result:{value:{urls:[`https://www.tiktok.com/@cats/video/${target.tabId===12?'123':'456'}`]}}})}};
 await collectTikTokVideos({id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/'],known_ids:['123']}},async(_op,input)=>assert.equal(input.url,'https://www.tiktok.com/@cats/video/456'),'example',async()=>{});assert.deepEqual(closed,[7]);assert.deepEqual(detached,[12,7]);
});
test('empty source errors report actual page readiness instead of claiming a login failure',async t=>{
 const old=globalThis.chrome,oldTimer=globalThis.setTimeout;t.after(()=>{globalThis.chrome=old;globalThis.setTimeout=oldTimer;});const {collectTikTokVideos}=await import('../extension/tiktok.js');
 globalThis.setTimeout=fn=>{queueMicrotask(fn);return 0;};globalThis.chrome={tabs:{create:async()=>({id:7}),remove:async()=>{}},debugger:{onEvent:{addListener(){},removeListener(){}},getTargets:async()=>[],attach:async()=>{},detach:async()=>{},sendCommand:async()=>({result:{value:{urls:[],page:{path:'/foryou',ready:'complete',videos:3}}}})}};
 await assert.rejects(collectTikTokVideos({input:{source_urls:['https://www.tiktok.com/']}},async()=>assert.fail(),'example',async()=>{}),error=>error.message.includes('播放器 3 个')&&error.message.includes('未调用模型')&&!error.message.includes('登录'));
});

 test('video IDs can be queued without any author metadata',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');
 globalThis.chrome={tabs:{create:async()=>assert.fail('embed URLs already identify the video')}};
 await collectTikTokVideos({id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/embed/v2/123']}},async(operation,input)=>{assert.equal(operation,'download_tiktok_video');assert.equal(input.url,'https://www.tiktok.com/embed/v2/123');},'example',async()=>{});
 });

 test('homepage capture ignores profile/detail metadata and only returns the recommendation feed',async t=>{
 const previous={document:globalThis.document,location:globalThis.location};t.after(()=>{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});const {inspectTikTokVideos}=await import('../extension/tiktok.js');
 globalThis.location={protocol:'https:',hostname:'www.tiktok.com',pathname:'/'};
 const item=id=>({id,video:{},desc:'A kitten plays'});const raw=JSON.stringify({__DEFAULT_SCOPE__:{'webapp.foryou.video':{itemList:[item('123')]},'webapp.video-detail':{itemInfo:{itemStruct:item('456')}},'webapp.user-post':{itemList:[item('789')]}}});
 globalThis.document={body:{innerText:''},readyState:'complete',querySelectorAll:()=>[],querySelector:()=>null,getElementById:id=>id==='__UNIVERSAL_DATA_FOR_REHYDRATION__'?{textContent:raw}:null};
 assert.deepEqual(inspectTikTokVideos().urls,['https://www.tiktok.com/embed/v2/123']);globalThis.location.pathname='/@someone';assert.throws(()=>inspectTikTokVideos(),/离开 TikTok 首页推荐流/);
 });
 test('video capture skips excluded and unavailable candidates then downloads a different home-feed clip',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');const calls=[];
 globalThis.chrome={tabs:{create:async()=>({id:7}),remove:async()=>{}},debugger:{onEvent:{addListener(){},removeListener(){}},getTargets:async()=>[],attach:async()=>{},detach:async()=>{},sendCommand:async()=>({result:{value:{candidates:[{url:'https://www.tiktok.com/embed/v2/123',text:'Chinese creator in Beijing'},{url:'https://www.tiktok.com/embed/v2/456',text:'Unavailable clip'},{url:'https://www.tiktok.com/embed/v2/789',text:'A kitten plays'}]}}})}};
 await collectTikTokVideos({id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/']}},async(_op,input)=>{calls.push(input);return calls.length<3?{skipped:true,unavailable:calls.length===2}:{download_id:'saved'};},'example',async()=>{});
 assert.equal(calls.length,3);assert.equal(calls[0].source_text,'Chinese creator in Beijing');assert.equal(calls[2].url,'https://www.tiktok.com/embed/v2/789');
 });

test('current home-feed player ID is read without walking profile state',async t=>{
 const old={document:globalThis.document,location:globalThis.location};t.after(()=>{for(const [k,v] of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}});const {inspectTikTokVideos}=await import('../extension/tiktok.js');
 globalThis.location={protocol:'https:',hostname:'www.tiktok.com',pathname:'/',href:'https://www.tiktok.com/'};
 globalThis.document={readyState:'complete',body:{innerText:''},querySelector:()=>null,getElementById:()=>null,querySelectorAll:selector=>selector==='video'?[{currentSrc:'https://v45.tiktokcdn-us.com/play?item_id=123',dataset:{},closest:()=>({innerText:'Chinese creator in Beijing'})}]:[]};
 const result=inspectTikTokVideos();assert.deepEqual(result.urls,['https://www.tiktok.com/embed/v2/123']);assert.equal(result.candidates[0].text,'Chinese creator in Beijing');
});
test('home recommendation response is read after attaching and before navigating, without reading profile responses',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');let listener,enabled=false,reads=0;
 globalThis.chrome={tabs:{create:async options=>{assert.equal(options.url,'about:blank');return {id:7};},remove:async()=>{}},debugger:{getTargets:async()=>[],onEvent:{addListener:fn=>listener=fn,removeListener:fn=>assert.equal(fn,listener)},attach:async()=>{},detach:async()=>{},sendCommand:async(target,method,args)=>{
  if(method==='Network.enable'){enabled=true;return {};}
  if(method==='Page.navigate'){assert.equal(enabled,true);listener({tabId:7},'Network.responseReceived',{requestId:'profile',response:{url:'https://www.tiktok.com/api/post/item_list/',status:200}});listener({tabId:7},'Network.loadingFinished',{requestId:'profile'});listener({tabId:7},'Network.responseReceived',{requestId:'feed',response:{url:'https://www.tiktok.com/api/recommend/item_list/?private-query=never-log',status:200}});listener({tabId:7},'Network.loadingFinished',{requestId:'feed'});return {};}
  if(method==='Network.getResponseBody'){reads++;assert.equal(args.requestId,'feed');return {body:JSON.stringify({itemList:[{id:'123',video:{},desc:'A kitten plays'}]}),base64Encoded:false};}
  return {result:{value:{urls:[],candidates:[],page:{path:'/',ready:'complete',videos:1}}}};
 }}};
 await collectTikTokVideos({id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/']}},async(_op,input)=>assert.equal(input.url,'https://www.tiktok.com/embed/v2/123'),'example',async()=>{});assert.equal(reads,1);
});

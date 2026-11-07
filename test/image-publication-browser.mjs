import assert from 'node:assert/strict';
import {runPublication} from '../extension/publisher.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),context=await browser.newContext(),tabs=new Map(),sessions=new Map(),listeners=new Set(),noBody=new Set();
const bytes=Array.from({length:70000},(_,i)=>i%256),text='A playful kitten. #Cats';
let seq=0,posts=0,uploads=0,gate=0,confirmed=0,tamper=false,wrongReceipt=false,unmatched=false,corrupt=false;
const html=()=>`<a data-testid="AppTabBar_Profile_Link" href="/example">Profile</a><main data-testid="primaryColumn"><div contenteditable="true" data-testid="tweetTextarea_0" style="width:400px;height:80px;margin:50px"></div><input type="file" accept="image/jpeg"><button data-testid="tweetButtonInline" style="width:100px;height:50px" disabled>Post</button></main><script>
const input=document.querySelector('input'),editor=document.querySelector('[contenteditable]'),button=document.querySelector('button');let uploaded=false;
let obscured=8;const point=document.elementFromPoint.bind(document);document.elementFromPoint=(x,y)=>uploaded&&obscured-->0?document.body:point(x,y);
const overlay=document.createElement('div');overlay.style='position:fixed;inset:0;z-index:999';editor.addEventListener('input',()=>document.body.append(overlay));document.addEventListener('keydown',e=>{if(e.key==='Escape'){overlay.remove();window.escaped=true;}});
const update=()=>button.disabled=!(uploaded&&editor.innerText.trim());editor.oninput=update;
input.onchange=async()=>{const file=input.files[0];if(file.name!=='image.jpg'||file.type!=='image/jpeg')throw Error('wrong file');const response=await fetch('/i/media/upload2.json',{method:'POST',body:await file.arrayBuffer()});if(!response.ok)return;await response.json();await fetch('/i/media/upload2.json?command=APPEND',{method:'POST'});uploaded=true;const root=document.createElement('div');root.dataset.testid='attachments';root.innerHTML='<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">';document.querySelector('main').append(root);update();};
button.onclick=async()=>{if(!window.escaped)throw Error('autocomplete overlay was not dismissed');const response=await fetch('/i/api/graphql/fixture/CreateTweet',{method:'POST',body:JSON.stringify({variables:{tweet_text:editor.innerText,media:{media_entities:[{media_id:'${tamper?'999':'456'}'}]}}})});if(response.ok){editor.innerText='';document.querySelector('[data-testid="attachments"]').remove();}};
</script>`;
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());assert.equal(url.hostname,'x.com','intercept every request; never contact live X');
 if(url.pathname==='/i/media/upload2.json'){if(url.searchParams.get('command')==='APPEND')return route.fulfill({status:204,body:''});uploads++;assert.deepEqual([...req.postDataBuffer()],bytes);return route.fulfill({json:{media_id_string:'456'}});}
 if(url.pathname.includes('CreateTweet')){posts++;const payload=req.postDataJSON();assert.equal(payload.variables.tweet_text,text);assert.equal(payload.variables.media.media_entities[0].media_id,'456');return route.fulfill({json:{data:{create_tweet:{tweet_results:{result:{rest_id:'987',core:{user_results:{result:{core:{screen_name:'example'}}}},legacy:{extended_entities:{media:[{id_str:wrongReceipt?'999':'456',type:'photo'}]}}}}}}}});}
 return route.fulfill({contentType:'text/html;charset=utf-8',body:html()});
});
globalThis.chrome={tabs:{create:async({url})=>{const page=await context.newPage(),id=++seq;tabs.set(id,page);await page.goto(url);return {id};},get:async id=>({url:tabs.get(id).url(),active:false,pinned:false}),remove:async id=>{assert.ok(confirmed>0);await tabs.get(id).close();}},debugger:{attach:async({tabId})=>{const session=await context.newCDPSession(tabs.get(tabId));sessions.set(tabId,session);for(const method of ['Fetch.requestPaused','Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed'])session.on(method,event=>{if(method==='Network.responseReceived'&&event.response.status===204)noBody.add(event.requestId);for(const fn of listeners)fn({tabId},method,event);});},detach:async({tabId})=>sessions.get(tabId).detach(),onEvent:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},sendCommand:async({tabId},method,params)=>{if(method==='Network.getResponseBody'&&noBody.has(params.requestId))throw Error('No resource with given identifier found');return sessions.get(tabId).send(method,params);}}};
const job={id:'video-job',client:'client',account:'example',action:'rewrite_publish',input:{mode:'image',stage:'ready',download_id:'c80a21e7-1b0c-4297-9c24-22c1ae4f9345',text}};
const call=async(operation,input)=>{
 if(operation==='image_upload_chunk')return {offset:unmatched?input.offset+1:input.offset,total:bytes.length,bytes:corrupt?[999]:bytes.slice(input.offset,input.offset+65536)};
 if(operation==='image_upload_ready'){assert.equal(input.media_id,'456');return {};}
 if(operation==='begin_publish'){gate++;return {allowed:true};}
 if(operation==='finish'){assert.equal(input.result.media_id,'456');assert.equal(input.result.url,'https://x.com/example/status/987');confirmed++;return {saved:true};}
 throw Error('Unexpected operation: '+operation);
};
try{
 const result=await runPublication(job,call,'example',async()=>{});assert.equal(result.url,'https://x.com/example/status/987');assert.equal(result.media_id,'456');assert.equal(posts,1);assert.equal(uploads,1);assert.equal(gate,1);assert.equal(confirmed,1);
 unmatched=true;await assert.rejects(runPublication(job,call,'example',async()=>{}),/分片无效/);unmatched=false;assert.equal(uploads,1);
 corrupt=true;await assert.rejects(runPublication(job,call,'example',async()=>{}),/分片写入失败/);corrupt=false;assert.equal(uploads,1);
 tamper=true;await assert.rejects(runPublication(job,call,'example',async()=>{}),/媒体不匹配/);tamper=false;assert.equal(posts,1,'mismatched media is stopped before X receives CreateTweet');
 wrongReceipt=true;await assert.rejects(runPublication(job,call,'example',async()=>{}),/回执未确认对应图片/);assert.equal(posts,2);assert.equal(confirmed,1,'never confirm a text-only or mismatched-media receipt');assert.equal(listeners.size,0);
 console.log('Passed: full image bytes -> real browser File input -> intercepted media upload -> exact-media send gate -> matched receipt; corrupt chunks, changed media and wrong receipts stop. No live posts. Image path exercised.');
}finally{await browser.close();delete globalThis.chrome;}

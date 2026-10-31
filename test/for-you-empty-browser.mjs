import assert from 'node:assert/strict';
import {collectForYou} from '../extension/for-you.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),context=await browser.newContext();
const previous=globalThis.chrome,tabs=new Map(),sessions=new Map(),listeners=new Set(),saved={};let sequence=0,summary,queued;
try{
 await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<a data-testid="AppTabBar_Profile_Link" href="/example"></a><main><button role="tab" aria-selected="true">For you</button>'+Array.from({length:9},(_,i)=>'<article data-testid="tweet"><a href="/writer/status/'+(100+i)+'"><time></time></a><span data-testid="promotedIndicator">Ad</span><div data-testid="tweetText" lang="zh">这是广告帖子。</div></article>').join('')+'<div role="progressbar">Loading more</div></main>'}));
 globalThis.chrome={storage:{session:{get:async key=>({[key]:saved[key]}),set:async value=>Object.assign(saved,value)}},tabs:{create:async({active})=>{assert.equal(active,false);const page=await context.newPage(),id=++sequence;tabs.set(id,page);await page.goto('about:blank');return {id};},remove:async id=>tabs.get(id).close()},debugger:{attach:async({tabId})=>{const session=await context.newCDPSession(tabs.get(tabId));sessions.set(tabId,session);for(const name of ['Network.responseReceived'])session.on(name,value=>{for(const listener of listeners)listener({tabId},name,value);});},detach:async({tabId})=>sessions.get(tabId).detach(),sendCommand:async({tabId},method,value)=>sessions.get(tabId).send(method,value),onEvent:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
 const result=await collectForYou({id:'fixture',client:'fixture-client',account:'example',action:'capture_for_you',input:{limit:1,language:'en',task_id:'fixture-plan'}},async(operation,input)=>{
  if(operation==='automation_can_run')return {allowed:true};
  if(operation==='for_you_snapshot'){summary=input.snapshot;return {saved:true};}
  assert.equal(operation,'queue_feed_replies');queued=input.posts;return {queued:queued.length};
 },'example',async()=>{});
 assert.equal(result.queued,0);assert.deepEqual(queued,[]);assert.equal(summary.scanned,9);assert.equal(summary.eligible,0);assert.equal(summary.filtered.ads,9);assert.equal(listeners.size,0);
 console.log('Passed: nine ads filtered to zero are recorded despite an unrelated loading spinner; no comment is created. No live X requests.');
}finally{globalThis.chrome=previous;await browser.close();}

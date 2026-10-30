import assert from 'node:assert/strict';
import {cleanupPublicationTabs} from '../extension/publisher.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),context=await browser.newContext(),pages=new Map(),sessions=new Map(),removed=[];
const candidates=[
 {id:1,url:'https://x.com/writer/status/1#onhold-reply'},
 {id:2,url:'https://x.com/writer/status/2#onhold-reply',draft:'Keep my draft'},
 {id:3,url:'https://x.com/writer/status/3#onhold-reply'},
 {id:4,url:'https://x.com/writer/status/4'},
 {id:5,url:'https://x.com/writer/status/5#onhold-reply'},
 {id:6,url:'https://x.com/writer/status/6#onhold-reply'},
 {id:7,url:'https://x.com/writer/status/7#onhold-reply',active:true},
 {id:8,url:'https://x.com/writer/status/8#onhold-reply',pinned:true},
 {id:9,url:'https://x.com/home#onhold-publisher'},
 {id:10,url:'https://x.com/writer/status/10#onhold-reply',owner:'other'}
];
await context.route('**/*',route=>{assert.equal(new URL(route.request().url()).hostname,'x.com');const tab=candidates.find(tab=>tab.url.split('#')[0]===route.request().url());return route.fulfill({contentType:'text/html',body:'<a data-testid="AppTabBar_Profile_Link" href="/'+(tab?.owner||'example')+'"></a><main><div contenteditable="true">'+(tab?.draft||'')+'</div></main>'});});
globalThis.chrome={tabs:{query:async()=>candidates,get:async id=>candidates.find(tab=>tab.id===id),remove:async id=>{removed.push(id);await pages.get(id).close();}},debugger:{attach:async({tabId})=>sessions.set(tabId,await context.newCDPSession(pages.get(tabId))),sendCommand:async({tabId},method,input)=>{assert.equal(method,'Runtime.evaluate');return sessions.get(tabId).send(method,input);},detach:async({tabId})=>sessions.get(tabId).detach()}};
try{
 for(const tab of candidates){const page=await context.newPage();pages.set(tab.id,page);await page.goto(tab.url);}
 const call=async(op,input)=>{
  assert.equal(op,'job_records');assert.equal(input.account,'example');const id=input.search.split('/').at(-1);
  assert.ok(['1','2','3','6','10'].includes(id),'bound, active, pinned, ordinary and unidentifiable pages are never candidates');
  const items=id==='6'?[]:[{action:'rewrite_publish',state:'failed',input:{mode:'reply',stage:id==='3'?'sending':'ready',source:{url:input.search}}}];
  return {items,total:items.length,offset:0};
 };
 const result=await cleanupPublicationTabs('example',call,5);
 assert.deepEqual(removed,[1]);assert.deepEqual(result,{closed:1,retained:5});
 assert.equal(await pages.get(2).locator('[contenteditable]').innerText(),'Keep my draft');
 console.log('Passed: stale empty failed task tabs close; drafts, uncertain sends, unknown tasks, bound/active/pinned tabs and ordinary X pages stay open. Fixture only.');
}finally{await browser.close();}

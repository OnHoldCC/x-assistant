import assert from 'node:assert/strict';
import {createCdpBridge} from '../extension/cdp-bridge.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),context=await browser.newContext();context.on('page',page=>page.on('pageerror',error=>console.error('Fixture page error:',error.message)));
const pages=new Map(),sessions=new Map(),listeners=new Set(),saved=[],finished=[],jobs=[];
const local={cdpConfig:{endpoint:'http://127.0.0.1:18431',token:'a'.repeat(64)},cdpClient:'fixture'},state={cdpTab:1,cdpAccount:'example'};
const paused=[];let publicationDraft=false;
let sequence=1,identity='example',socket,bridge,analyticsMode='failed';const exportedPeriods=[];
await context.addCookies(['auth_token','ct0','twid'].map(name=>({name,value:name==='twid'?'u%3D123':'fixture',domain:'.x.com',path:'/',secure:true})));
await context.exposeFunction('recordAnalyticsExport',period=>exportedPeriods.push(period));
await context.route('**/*',route=>{
 const url=new URL(route.request().url());assert.equal(url.hostname,'x.com','fixture never contacts X');
 if(url.pathname.includes('/graphql/'))return route.fulfill({status:500,json:{error:'fixture analytics unavailable'}});
 if(url.pathname==='/i/account_analytics'&&analyticsMode!=='failed'){
  const mode=analyticsMode;
  return route.fulfill({contentType:'text/html',body:`<a data-testid="AppTabBar_Profile_Link" href="/example"></a><main><button data-period="7D" aria-pressed="true">7D</button><button data-period="2W" aria-pressed="false">2W</button><button data-period="3M" aria-pressed="false">3M</button><button data-period="1Y" aria-pressed="false">1Y</button><button>Impressions 1</button><button id="export">Download CSV</button></main><script>for(const button of document.querySelectorAll('[data-period]'))button.onclick=()=>{for(const other of document.querySelectorAll('[data-period]'))other.setAttribute('aria-pressed',String(other===button));};document.querySelector('#export').onclick=async()=>{const selected=document.querySelector('[data-period][aria-pressed=true]').dataset.period;await window.recordAnalyticsExport(selected);const count=selected==='1Y'?(${JSON.stringify(mode)}==='year'?365:7):90;const end=Date.UTC(2026,9,30),rows=Array.from({length:count},(_,index)=>new Date(end-(count-1-index)*86400000).toISOString().slice(0,10)+',100,0,10,2');if(${JSON.stringify(mode)}==='gap'&&selected==='3M')rows.splice(45,1);const csv=['Date,Impressions,Likes,Engagements,Replies',...rows].join('\\n'),anchor=document.createElement('a');anchor.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));anchor.download='analytics.csv';anchor.click();};</script>`});
 }
 const creator=url.pathname==='/i/jf/creators/original_content_rewards';
 return route.fulfill({contentType:'text/html',body:creator?'<main>Have at least 500 Verified followers 492 Have at least 500K Verified Home Timeline impressions in the last 90 days 291</main>':'<a data-testid="AppTabBar_Profile_Link" href="/example"></a><main>'+(publicationDraft?'<div contenteditable="true" data-testid="tweetTextarea_0">Keep this draft</div><button data-testid="tweetButtonInline">Post</button>':'')+'</main>'+(url.pathname==='/i/account_analytics'?'<script>fetch("/i/api/graphql/fixture/GetAnalytics")</script>':'')});
});
async function attach(id){
 const session=await context.newCDPSession(pages.get(id));sessions.set(id,session);
 for(const method of ['Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed'])session.on(method,event=>{for(const listener of listeners)listener({tabId:id},method,event);});
}
globalThis.chrome={storage:{local:{get:async()=>({...local}),set:async value=>Object.assign(local,value),remove:async()=>{}},session:{get:async()=>({...state}),set:async value=>Object.assign(state,value),remove:async keys=>keys.forEach(key=>delete state[key])}},
 runtime:{getManifest:()=>({version:'1.5.11'})},alarms:{onAlarm:{addListener(){}},clear:async()=>{}},
 tabs:{async create({url,active}){assert.equal(active,false);const page=await context.newPage(),id=++sequence;pages.set(id,page);await page.goto(url);return {id};},async get(id){const page=pages.get(id);return {url:page.url(),title:await page.title()};},async remove(id){await pages.get(id).close();pages.delete(id);}},
 debugger:{onEvent:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},onDetach:{addListener(){}},attach:async({tabId})=>attach(tabId),detach:async({tabId})=>sessions.get(tabId).detach(),sendCommand:async({tabId},method,input)=>{assert.notEqual(method,'Page.bringToFront');return sessions.get(tabId).send(method,input);}}
};
globalThis.fetch=async(_url,options)=>{
 const {operation,input}=JSON.parse(options.body);
 if(operation==='creator'){assert.equal(input.account,'123','identity is resolved from login UID, never assumed from the requested handle');return Response.json({account:identity});}
 if(operation==='claim')return Response.json(jobs.shift()||null);
 if(operation==='ingest')saved.push(input);
 if(operation==='finish')finished.push(input);
 if(operation==='control_automation')paused.push(input);
 return Response.json({});
};
globalThis.WebSocket=class{
 static OPEN=1;readyState=1;
 constructor(){socket=this;queueMicrotask(()=>this.onopen());}
 send(value){if(JSON.parse(value).token)queueMicrotask(()=>this.onmessage({data:JSON.stringify({type:'ready'})}));}
 close(){this.readyState=3;this.onclose?.();}
};
async function run(action,input){
 const id='job-'+finished.length;jobs.push({id,account:'example',action,input});socket.onmessage({data:JSON.stringify({type:'capture'})});
 for(let count=0;count<250;count++){const result=finished.find(row=>row.id===id);if(result)return result;await new Promise(resolve=>setTimeout(resolve,100));}
 throw Error('fixture task did not finish: '+action+' / '+analyticsMode+' / exports '+exportedPeriods.join(','));
}
try{
 const main=await context.newPage();pages.set(1,main);await main.goto('https://x.com/home');await attach(1);
 bridge=createCdpBridge();await bridge.resume();
 let result=await run('capture_creator');assert.equal(result.error,undefined);assert.equal(saved.at(-1).creator.verified_followers.current.value,492);assert.equal(saved.at(-1).creator.verified_impressions.current.value,291);
 const count=saved.length;identity='other';result=await run('capture_creator');assert.match(result.error,/账号已切换/);assert.equal(saved.length,count,'a switched login cannot save another account’s progress');
 identity='example';result=await run('capture_analytics');assert.match(result.error,/X 分析请求失败/);assert.equal(saved.length,count+1,'qualification is still saved after analytics fails');assert.equal(saved.at(-1).creator.verified_followers.current.value,492);
 analyticsMode='quarter';let before=saved.length;result=await run('capture_analytics');assert.equal(result.error,undefined);assert.deepEqual(exportedPeriods,['1Y','3M'],'an incomplete yearly export falls back to a full quarter without trying short periods');let analytics=saved.slice(before).find(value=>value.analytics)?.analytics;assert.equal(analytics.period_key,'90d');assert.equal(analytics.series.length,90);assert.equal(analytics.metrics.impressions.value,9000);assert.equal(analytics.metrics.likes.value,0);
 analyticsMode='year';exportedPeriods.length=0;before=saved.length;result=await run('capture_analytics');assert.equal(result.error,undefined);assert.deepEqual(exportedPeriods,['1Y'],'one complete widest export replaces repeated per-period downloads');assert.equal(saved.slice(before).find(value=>value.analytics).analytics.series.length,365);
 analyticsMode='gap';before=saved.length;result=await run('capture_analytics');assert.match(result.error,/逐日数据不完整/);assert.equal(saved.slice(before).filter(value=>value.analytics).length,0,'a short or gapped CSV cannot masquerade as a complete quarter');
 assert.equal(pages.size,1,'temporary pages close and the bound X tab stays open');
 publicationDraft=true;result=await run('rewrite_publish',{mode:'news',stage:'ready',text:'Test post',task_id:'plan-1'});assert.match(result.error,/草稿/);assert.equal(result.result.tab_closed,false);assert.deepEqual(paused,[{account:'example',id:'plan-1',enabled:false}]);assert.match(result.result.cleanup_warning,/已暂停/);assert.equal(pages.size,2,'a draft is retained and its plan pauses instead of opening another page');
 console.log('Passed: widest complete CSV export, annual fallback to 90 days, zero totals and rejection of incomplete/gapped ranges.');
 console.log('Passed: retained publication drafts pause their plan.');
 console.log('Passed: sidebar-free qualification capture, login UID ownership checks, account-switch rejection, independent capture after analytics failure and background-tab cleanup. Fixture only.');
}finally{await bridge?.disconnect().catch(()=>{});await browser.close();}

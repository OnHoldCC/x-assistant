import assert from 'node:assert/strict';
import {runPublication,inspectPublishPage} from '../extension/publisher.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),previousChrome=globalThis.chrome;
const context=await browser.newContext({viewport:{width:1200,height:900}}),tabs=new Map(),sessions=new Map(),listeners=new Set(),commands=[],requests=[];
let sequence=0,owner='example',draft='',acknowledge=true,removed=0,gateCount=0,verifyCount=0,ackCount=0,preventFocus=false,blockMouseFocus=false,longForm=false,emulatedFocus=false,clearDelay=1200,neverClear=false,hangClose=false;
const content=text=>`<a data-testid="AppTabBar_Profile_Link" href="/${owner}">Profile</a><main data-testid="primaryColumn"><div role="textbox" contenteditable="true" data-testid="tweetTextarea_0" style="margin:100px;width:500px;min-height:120px;border:1px solid">${text}</div>${longForm?'<div style="height:1600px"></div>':''}<button data-testid="tweetButtonInline" style="margin-left:100px;width:100px;height:44px" disabled>Post</button></main><script>const readText=(${globalThis.OnHoldEditorText.toString()}),editor=document.querySelector('[contenteditable]'),button=document.querySelector('button');button.disabled=!editor.innerText;editor.addEventListener('input',()=>button.disabled=!editor.innerText.trim());button.onclick=async()=>{const text=readText(editor);const response=await fetch('/i/api/graphql/fixture/CreateTweet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({variables:{tweet_text:text}})});if(response.ok&&!${neverClear})setTimeout(()=>editor.innerText='',${clearDelay});};</script>`;
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());assert.equal(url.hostname,'x.com','fixtures must intercept every external request');
 if(url.pathname.includes('CreateTweet')){
  requests.push(route.request().postDataJSON());
  return route.fulfill({json:acknowledge?{data:{create_tweet:{tweet_results:{result:{rest_id:'1900000000000000123',core:{user_results:{result:{core:{screen_name:owner}}}}}}}}}:{errors:[{message:'fixture failure'}]}});
 }
 return route.fulfill({contentType:'text/html;charset=utf-8',body:content(draft)});
});
globalThis.chrome={tabs:{async create({url,active}){assert.equal(active,false,'automation must open background tabs');const page=await context.newPage(),id=++sequence;tabs.set(id,page);await page.goto(url);return {id};},async get(id){return {url:tabs.get(id).url(),active:false,pinned:false};},async remove(id){assert.ok(ackCount>0,'persist the confirmed receipt before attempting to close');assert.equal((await tabs.get(id).locator('[contenteditable]').innerText()).trim(),'','never close before X clears its draft');if(hangClose)return new Promise(()=>{});removed++;await tabs.get(id).close();}},debugger:{
 async attach({tabId}){const session=await context.newCDPSession(tabs.get(tabId));sessions.set(tabId,session);for(const method of ['Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed'])session.on(method,event=>{for(const listener of listeners)listener({tabId},method,event);});},
 async detach({tabId}){await sessions.get(tabId).detach();},
 onEvent:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
 async sendCommand({tabId},method,params){commands.push({method,params});if(method==='Emulation.setFocusEmulationEnabled')emulatedFocus=params.enabled;if(method==='Input.insertText')assert.equal(emulatedFocus,true,'background text input requires page focus emulation');if(method==='Page.bringToFront')assert.fail('publishing must not activate a tab');if(preventFocus&&['Input.dispatchMouseEvent','DOM.focus'].includes(method))return {};if(blockMouseFocus&&method==='Input.dispatchMouseEvent')return {};if(method==='DOM.focus')blockMouseFocus=false;return sessions.get(tabId).send(method,params);}
}};
let job={id:'job',client:'client',account:'example',action:'rewrite_publish',input:{mode:'replicate',schema_version:1,analysis:{topic:'Fixture',structure:'Two paragraphs',tone:'Clear',key_points:['Keep facts']},stage:'ready',text:'清晰的表达，来自真实内容。\n\n保留原意。'}};
const backend=process.env.ONHOLD_E2E_ENDPOINT;
async function api(operation,input={}) {
 const response=await fetch(backend+'/api/admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.ONHOLD_E2E_TOKEN},body:JSON.stringify({operation,input}),signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok)throw Error(value.error||'fixture backend failed');return value;
}
const call=async(op,input)=>{if(op==='finish'){ackCount++;assert.ok(input.result.url);return backend?api(op,input):{saved:true};}assert.equal(op,'begin_publish');assert.equal(input.id,job.id);gateCount++;return backend?api(op,input):{allowed:true};};
const verify=async()=>verifyCount++;
try {
 if(backend){
  const queued=await api('enqueue_rewrite',{account:'example',source:{id:'123',author:'writer',url:'https://x.com/writer/status/123',text:'给 12 位读者：用 Docker 部署网页和 Rust 后台，翻译与评分按需启用。',mode:'replicate'}});
  for(let attempt=0;;attempt++){
   const generated=(await api('jobs')).find(item=>item.id===queued.id);
   if(generated?.state==='failed')throw Error(generated.error);
   if(generated?.input?.stage==='ready'){assert.equal(generated.input.schema_version,1);assert.ok(generated.input.analysis?.key_points?.length);break;}
   if(attempt>150)throw Error('real model generation timed out');await new Promise(resolve=>setTimeout(resolve,1000));
  }
  job={...await api('claim',{account:'example',client:process.env.ONHOLD_E2E_CLIENT}),client:process.env.ONHOLD_E2E_CLIENT};
  assert.equal(job.id,queued.id);
 }
 const result=await runPublication(job,call,'example',verify);
 assert.equal(result.tab_closed,true);assert.equal(result.url,'https://x.com/example/status/1900000000000000123');assert.equal(requests.length,1);assert.equal(requests[0].variables.tweet_text,job.input.text);
 assert.equal(gateCount,1);assert.equal(verifyCount,2);assert.equal(removed,1);
 assert.equal(commands.filter(c=>c.method==='Input.insertText').length,1);
 assert.equal(commands.filter(c=>c.method==='DOM.focus').length,1,'focus the verified editor explicitly without activating the tab');assert.deepEqual(commands.filter(c=>c.method==='Emulation.setFocusEmulationEnabled').map(c=>c.params.enabled),[true,false],'page focus is enabled for this tab only and restored on cleanup');
 assert.equal(commands.filter(c=>c.method==='Input.dispatchMouseEvent'&&c.params.type==='mouseReleased').length,2,'one editor focus click and exactly one send click');
 assert.equal(commands.some(c=>c.method==='Runtime.evaluate'&&/\.click\(|execCommand/.test(c.params.expression)),false,'publishing uses native CDP input events');
 if(backend){
  await api('finish',{id:job.id,client:job.client,result});
  const saved=(await api('jobs')).find(item=>item.id===job.id);
  assert.equal(saved.state,'completed');assert.equal(saved.result.url,result.url);assert.equal(saved.input.text,requests[0].variables.tweet_text);
  console.log('Passed end-to-end: real Codex output -> strict schema/facts -> real backend dispatch -> CDP input -> intercepted X request/receipt -> persisted completed job. No live X request.');
 } else {
 draft='My existing draft';await assert.rejects(runPublication(job,call,'example',verify),/未发送草稿/);assert.equal(requests.length,1);assert.equal(gateCount,1);assert.equal(await tabs.get(sequence).locator('[contenteditable]').innerText(),draft);assert.equal(removed,1,'existing drafts are retained');
 draft='';owner='other';await assert.rejects(runPublication(job,call,'example',verify),/账号已改变/);assert.equal(requests.length,1);
 owner='example';preventFocus=true;await assert.rejects(runPublication(job,call,'example',verify),/未取得焦点/);assert.equal(requests.length,1,'focus failure never sends a post');assert.equal(removed,3,'wrong-account and focus failures close their empty task tabs');assert.equal(commands.filter(c=>c.method==='Input.insertText').length,1,'focus failure never types into another control');preventFocus=false;
 acknowledge=false;await assert.rejects(runPublication(job,call,'example',verify),/未确认发布/);assert.equal(requests.length,2);assert.equal(removed,3,'drafts and failed sends remain, but empty pre-send failures close');assert.equal(listeners.size,0);
 acknowledge=true;
 blockMouseFocus=true;longForm=true;
 const news={...job,input:{mode:'news',stage:'ready',source:{url:'https://news.example/report',title:'官方新闻',text:'官方发布工具。'},text:'官方发布工具。https://news.example/report'}};
 const newsResult=await runPublication(news,call,'example',verify);assert.equal(newsResult.url,'https://x.com/example/status/1900000000000000123');assert.equal(requests.length,3);assert.equal(requests[2].variables.tweet_text,news.input.text);assert.equal(requests[2].variables.reply,undefined,'news is an original post, not a reply to its external source');assert.equal(removed,4);
 neverClear=true;const retained=await runPublication(job,call,'example',verify);assert.equal(retained.url,'https://x.com/example/status/1900000000000000123');assert.equal(retained.tab_closed,false);assert.match(retained.cleanup_warning,/已保留/);assert.equal(removed,4,'a confirmed receipt with a stale draft must retain the tab');assert.equal(requests.length,4,'never resend while waiting for UI cleanup');
 neverClear=false;clearDelay=0;hangClose=true;let timeout;try{const confirmed=await Promise.race([runPublication(job,call,'example',verify),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('a blocked close must not block the publication receipt')),5000);})]);assert.equal(confirmed.url,'https://x.com/example/status/1900000000000000123');assert.equal(confirmed.tab_closed,false);assert.match(confirmed.cleanup_warning,/发送已确认/);assert.equal(requests.length,5);}finally{clearTimeout(timeout);}
 const oldLocation=globalThis.location;globalThis.location={protocol:'https:',hostname:'evil.example',pathname:'/home'};
 assert.throws(()=>inspectPublishPage('example'),/发布页面与任务目标/);globalThis.location=oldLocation;
 }
 if(!backend)console.log('Passed: real CDP mouse and text input on fixture X composer, matched network publication receipt, single send, preserved drafts, wrong-account rejection, failed receipt and origin validation. No live posts.');
} finally {globalThis.chrome=previousChrome;await browser.close();}

import assert from 'node:assert/strict';
import {collectNotificationReplies} from '../extension/notifications.js';
import {collectForYou,inspectForYou} from '../extension/for-you.js';
import {runAutomation} from '../extension/automation.js';
import {runPublication} from '../extension/publisher.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1200,height:900}});
const oldChrome=globalThis.chrome,tabs=new Map(),sessions=new Map(),listeners=new Set(),requests=[],sessionStorage={};let feedLoads=0;
let followWrites=0;
let sequence=0,wrongTarget=false,badReceipt=false,draft='',owner='example',modal=false;
const article=(id,text,extra='',author='writer')=>`<article data-testid="tweet"><a href="/${author}/status/${id}"><time>now</time></a><div data-testid="tweetText">${text}</div>${extra}</article>`;
const feed=()=>`<a data-testid="AppTabBar_Profile_Link" href="/${owner}"></a><main><div role="tablist"><button role="tab" aria-selected="false">For you</button><button role="tab" aria-selected="true">Following</button></div><section>${article('999','Following only')}</section></main><script>const tabs=document.querySelectorAll('[role=tab]');tabs[0].onclick=()=>{tabs[0].setAttribute('aria-selected','true');tabs[1].setAttribute('aria-selected','false');document.querySelector('section').innerHTML=${JSON.stringify(article('101','用 Docker 部署网页和后台，模型按需启用。')+article('101','用 Docker 部署网页和后台，模型按需启用。')+article('102','整理运营记忆后，怎样让内容复盘更有用？')+article('300','Promotion','<span data-testid="promotedIndicator">Ad</span>')+article('301','Paid','<span data-testid="adIndicator">Ad</span>')+article('302','Marketing').replace('<div data-testid="tweetText">','<span>Sponsored</span><div data-testid="tweetText">')+article('400','Incomplete','<a data-testid="tweet-text-show-more-link">Show more</a>')+article('200','Own post','','example'))};};</script>`;
const form=()=>`<div data-testid="tweetTextarea_0" contenteditable="true" style="margin:80px;width:500px;min-height:100px;border:1px solid">${draft}</div><button data-testid="tweetButtonInline" style="margin:0 80px;width:100px;height:40px" disabled>Reply</button>`;
const composer=id=>`<a data-testid="AppTabBar_Profile_Link" href="/${owner}"></a><main data-testid="primaryColumn">${article(id,'目标原帖','<div style="height:1000px"></div>'+(modal?'<button data-testid="reply" style="width:100px;height:40px">Open reply</button>':''))}${modal?'':form()}</main><script>const read=(${globalThis.OnHoldEditorText.toString()});function bind(scope){const editor=scope.querySelector('[contenteditable]'),button=scope.querySelector('[data-testid=tweetButtonInline]');editor.addEventListener('input',()=>button.disabled=!editor.innerText.trim());button.onclick=()=>fetch('/i/api/graphql/fixture/CreateTweet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({variables:{tweet_text:read(editor),reply:{in_reply_to_tweet_id:${JSON.stringify(wrongTarget?'999':id)}}}})}).then(response=>{if(response.ok)editor.innerText='';}).catch(()=>{});}if(${modal})document.querySelector('[data-testid=reply]').onclick=()=>{history.pushState({},'','/compose/post');const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.style='position:fixed;inset:0;background:white;overflow:auto;z-index:20';dialog.innerHTML=${JSON.stringify(form())};document.body.append(dialog);bind(dialog);};else bind(document);</script>`;
await context.route('**/*',async route=>{
 const url=new URL(route.request().url());assert.equal(url.hostname,'x.com');
 if(url.pathname==='/i/api/2/notifications/all.json')return route.fulfill({json:{timeline:{instructions:[{entries:[{entryId:'tweet-201'},{entryId:'tweet-202'},{entryId:'tweet-203'},{entryId:'notification-liked'}]}]},globalObjects:{users:{2:{id_str:'2',screen_name:'writer'},99:{id_str:'99',screen_name:'example'}},tweets:{201:{id_str:'201',user_id_str:'2',in_reply_to_user_id_str:'99',in_reply_to_status_id_str:'123',full_text:'这个功能支持本地部署吗？'},202:{id_str:'202',user_id_str:'2',full_text:'@example 只是提及'},203:{id_str:'203',user_id_str:'2',in_reply_to_user_id_str:'88',in_reply_to_status_id_str:'456',full_text:'回复其他人'},204:{id_str:'204',user_id_str:'99',in_reply_to_user_id_str:'2',in_reply_to_status_id_str:'456',full_text:'我自己的回复被点赞'},205:{id_str:'205',user_id_str:'2',in_reply_to_user_id_str:'99',in_reply_to_status_id_str:'456',full_text:'点赞通知附带的旧回复，不是新回复事件'}}}}});
 if(url.pathname==='/explore/tabs/trending')return route.fulfill({contentType:'text/html;charset=utf-8',body:`<a data-testid="AppTabBar_Profile_Link" href="/${owner}"></a><main><div data-testid="trend"><span data-testid="promotedIndicator">Ad</span></div><button data-testid="trend" onclick="location.href='/search?q=fixture'">热门话题</button></main>`});
 if(url.pathname==='/search')return route.fulfill({contentType:'text/html;charset=utf-8',body:`<a data-testid="AppTabBar_Profile_Link" href="/${owner}"></a><main>${article('701','热门候选低分')+article('702','热门候选高分')}</main>`});
 if(['/notifications','/notifications/mentions'].includes(url.pathname))return route.fulfill({contentType:'text/html;charset=utf-8',body:`<a data-testid="AppTabBar_Profile_Link" href="/${owner}"></a><main>Notifications<div data-testid="notification"><a href="/newfan">新粉丝</a> followed you · 17s</div><div data-testid="notification"><a href="/fan2">另一个粉丝</a><a href="/newfan">新粉丝</a> and 56 others followed you</div><div data-testid="notification"><a href="/liker">点赞者</a> liked your reply<div data-testid="tweetText">followed you 是帖子正文</div></div><div data-testid="notification"><a href="/writer">回复者</a><article>这是正文 followed you</article></div></main><script>fetch('/i/api/2/notifications/all.json');</script>`});
 if(url.pathname==='/i/api/1.1/friendships/create.json'){followWrites++;return route.fulfill({json:{id_str:'77',following:true}});}
 if(['/newfan','/fan2','/formerfan'].includes(url.pathname)){
  const handle=url.pathname.slice(1),following=handle==='fan2',follows=handle!=='formerfan';
  return route.fulfill({contentType:'text/html;charset=utf-8',body:`<a data-testid="AppTabBar_Profile_Link" href="/${owner}"></a><main><div><div data-testid="UserName">@${handle}</div>${follows?'<span data-testid="userFollowIndicator">Follows you</span>':''}</div><button data-testid="77-${following?'unfollow':'follow'}">${following?'Following':'Follow'}</button></main><script>const button=document.querySelector('button');button.onclick=()=>fetch('/i/api/1.1/friendships/create.json',{method:'POST',body:'user_id=77'}).then(()=>{button.textContent='Following';button.dataset.testid='77-unfollow';});</script>`});
 }
 if(url.pathname.includes('CreateTweet')){
  const request=route.request().postDataJSON();requests.push(request);
  return route.fulfill({json:{data:{create_tweet:{tweet_results:{result:{rest_id:'1900000000000000123',legacy:{in_reply_to_status_id_str:badReceipt?'999':request.variables.reply.in_reply_to_tweet_id},core:{user_results:{result:{core:{screen_name:owner}}}}}}}}}});
 }
 if(url.pathname==='/home')feedLoads++;return route.fulfill({contentType:'text/html;charset=utf-8',body:url.pathname==='/home'?feed():composer(url.pathname.split('/').at(-1))});
});
globalThis.chrome={storage:{session:{async get(key){return {[key]:sessionStorage[key]};},async set(value){Object.assign(sessionStorage,value);}}},tabs:{async create({url,active}){assert.equal(active,false,'automation must open background tabs');const page=await context.newPage(),id=++sequence;page.on("pageerror",error=>console.error("fixture page error",error));tabs.set(id,page);await page.goto(url);return {id};},async get(id){return {url:tabs.get(id).url(),active:false,pinned:false};},async remove(id){await tabs.get(id).close();}},debugger:{
 async attach({tabId}){const session=await context.newCDPSession(tabs.get(tabId));sessions.set(tabId,session);for(const method of ['Network.requestWillBeSent','Network.responseReceived','Network.loadingFinished','Network.loadingFailed','Fetch.requestPaused'])session.on(method,event=>{for(const listener of listeners)listener({tabId},method,event);});},
 async detach({tabId}){await sessions.get(tabId).detach();},onEvent:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
 async sendCommand({tabId},method,params){return sessions.get(tabId).send(method,params);}
}};
const backend=process.env.ONHOLD_E2E_ENDPOINT;
async function api(operation,input={}){
 const response=await fetch(backend+'/api/admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.ONHOLD_E2E_TOKEN},body:JSON.stringify({operation,input})});const value=await response.json();if(!response.ok)throw Error(value.error);return value;
}
let collected;
const verify=async()=>{if(backend)await api('heartbeat',{account:'example',client:process.env.ONHOLD_E2E_CLIENT});};
try{
 const languagePage=await context.newPage();
 await languagePage.goto('https://x.com/home');
 await languagePage.setContent('<a data-testid="AppTabBar_Profile_Link" href="/example"></a><main><button role="tab" aria-selected="true">For you</button>'+article('901','This is an original English post.').replace('data-testid="tweetText"','data-testid="tweetText" lang="en"')+article('902','This is a translated Chinese post.','<button>Show original</button>').replace('data-testid="tweetText"','data-testid="tweetText" lang="en"')+article('903','原本就是中文的帖子').replace('data-testid="tweetText"','data-testid="tweetText" lang="zh"')+'</main>');
 const languageSnapshot=await languagePage.evaluate('('+inspectForYou.toString()+')("example","for_you",0,"en")');
 assert.deepEqual(languageSnapshot.posts.map(post=>post.id),['901'],'English discovery skips non-English originals and translated Chinese posts');
 await languagePage.close();
 let discovery={id:'discovery',client:'client',account:'example',action:'capture_for_you',input:{limit:2,known_ids:[]}};
 if(backend){
  const plan=await api('save_automation',{account:'example',action:'auto_reply',interval_minutes:5,limit:2});await api('control_automation',{account:'example',id:plan.id,enabled:true});
  const queued=await api('run_automation',{account:'example',id:plan.id});discovery={...await api('claim',{account:'example',client:process.env.ONHOLD_E2E_CLIENT}),client:process.env.ONHOLD_E2E_CLIENT};assert.equal(discovery.id,queued.id);
 }
 const batch=await collectForYou(discovery,async(op,input)=>{if(op==='automation_can_run')return backend?api(op,input):{allowed:true};assert.equal(op,'queue_feed_replies');collected=input.posts;return backend?api(op,input):{queued:input.posts.length};},'example',verify,async()=>{assert.fail('comments must never depend on a decision score');});
 assert.deepEqual(collected.map(post=>post.id),['101','102'],'explicit For You selection skips Following, duplicates, own posts, ads, truncated text');assert.equal(batch.queued,2);
 let job={id:'reply',client:'client',account:'example',action:'rewrite_publish',input:{mode:'reply',stage:'ready',source:collected[0],text:'把基础部署和可选模型分开，首次启动会更清楚。'}};
 if(backend){
  await api('finish',{id:discovery.id,client:discovery.client});
  for(let attempt=0;;attempt++){
   await verify();const jobs=(await api('jobs')).filter(item=>item.input?.mode==='reply');
   const failed=jobs.find(item=>item.state==='failed');if(failed)throw Error(failed.error);
   if(jobs.length===2&&jobs.every(item=>item.input?.stage==='ready'))break;
   if(attempt>150)throw Error('real reply generation timed out');await new Promise(resolve=>setTimeout(resolve,1000));
  }
  for(let index=0;index<2;index++){
   job={...await api('claim',{account:'example',client:discovery.client}),client:discovery.client};assert.equal(job.input.mode,'reply');
   const result=await runPublication(job,api,'example',verify);await api('finish',{id:job.id,client:job.client,result});
   const saved=(await api('jobs')).find(item=>item.id===job.id);assert.equal(saved.state,'completed');assert.equal(saved.result.reply_to,job.input.source.id);assert.equal(saved.input.telemetry.generations.length,1);assert.ok(saved.input.telemetry.generations[0].usage.total_tokens>0);assert.ok(saved.input.telemetry.generations[0].duration_ms>0);
  }
  const state=await api('automation',{account:'example'});assert.equal(state.tasks[0].last_job.result.reply_progress.completed,2);
  console.log('Passed: For You -> two independent backend tasks -> real Codex JSON replies -> native CDP composer -> intercepted X reply/parent receipts -> persisted completion. No live X requests.');
 }else{
  sessionStorage.forYouPage=null;let batches=[];const pageCall=async(op,input)=>{if(op==='automation_can_run')return {allowed:true};batches.push(input.posts.map(post=>post.id));return {queued:input.posts.length};};
  const single={...discovery,input:{limit:1,known_ids:[]}};const before=feedLoads;await collectForYou(single,pageCall,'example',verify);await collectForYou({...single,input:{limit:1,known_ids:['101']}},pageCall,'example',verify);assert.deepEqual(batches,[['101'],['102']]);assert.equal(feedLoads,before+1,'the same page snapshot is consumed before refresh');await collectForYou({...single,input:{limit:1,known_ids:['101','102']}},pageCall,'example',verify);assert.equal(feedLoads,before+2,'refresh happens only after all eligible posts from the page were processed');assert.deepEqual(batches.at(-1),[]);
  const oldScoringJob={...discovery,input:{limit:1,scope:'for_you',publication_mode:'replicate',known_ids:[]}};
  await assert.rejects(collectForYou(oldScoringJob,async(op)=>{assert.equal(op,'automation_can_run');return {allowed:true};},'example',verify),/评分发文已停用/);
  let notificationPosts;const notifications={id:'notifications',client:'client',account:'example',action:'capture_notifications',input:{owner_uid:'99',task_id:'notify-plan',limit:1,known_ids:[]}};
  await collectNotificationReplies(notifications,async(op,input)=>{if(op==='automation_can_run')return {allowed:true};assert.equal(op,'queue_feed_replies');notificationPosts=input.posts;return {queued:input.posts.length};},'example',verify);assert.deepEqual(notificationPosts.map(post=>post.id),['201']);assert.ok([...tabs.values()].some(page=>page.url().includes('/notifications/mentions')),'reply discovery reads mentions, separately from likes and follows');
  let followTargets;await collectNotificationReplies({...notifications,input:{...notifications.input,publication_mode:'follow_back',limit:5}},async(op,input)=>{if(op==='automation_can_run')return {allowed:true};assert.equal(op,'queue_notification_follows');followTargets=input.targets;return {queued:input.targets.length};},'example',verify);assert.deepEqual(followTargets,['newfan','fan2'],'single and grouped follow notifications supply only explicit accounts; likes and tweet text never trigger follow/reply');
  const followResult=await runAutomation({id:'follow-job',client:'client',account:'example',action:'follow_back',input:{task_id:'follow-plan',scope:'notifications',targets:[...followTargets,'formerfan'],limit:5}},async(op,input)=>{if(op==='automation_can_run')return {allowed:true};assert.equal(op,'automation_progress');assert.equal(input.target,'newfan');return {saved:true};},'example',verify);assert.deepEqual(followResult.completed,['newfan']);assert.deepEqual(followResult.skipped,['fan2','formerfan']);assert.equal(followWrites,1,'follow execution rechecks following and follows-you before a single confirmed background write');
  const call=async(op)=>{assert.ok(['begin_publish','finish'].includes(op));return op==='finish'?{saved:true}:{allowed:true};};
  await assert.rejects(runPublication({...job,input:{...job.input,source:null}},call,'example',verify),/回复目标缺失/);
  const result=await runPublication(job,call,'example',verify);assert.equal(result.reply_to,'101');assert.equal(requests.length,1);
  modal=true;assert.equal((await runPublication(job,call,'example',verify)).reply_to,'101');assert.equal(requests.length,2,'reply modal route without an article is accepted only after opening the verified source reply button');
  wrongTarget=true;await assert.rejects(runPublication(job,call,'example',verify),/原帖目标不匹配/);assert.equal(requests.length,2,'wrong target blocked BEFORE network request');wrongTarget=false;
  badReceipt=true;await assert.rejects(runPublication(job,call,'example',verify),/回执的原帖不匹配/);assert.equal(requests.length,3);badReceipt=false;
  draft='已有草稿';await assert.rejects(runPublication(job,call,'example',verify),/未发送草稿/);assert.equal(requests.length,3);
  draft='';owner='other';await assert.rejects(runPublication(job,call,'example',verify),/账号已改变/);assert.equal(requests.length,3);
  assert.equal(listeners.size,0);console.log('Passed: explicit For You collection, per-post batch, reply focus/input, request target interception, parent receipt, preserved drafts and wrong-account guard. No live X requests.');
 }
}finally{globalThis.chrome=oldChrome;await browser.close();}

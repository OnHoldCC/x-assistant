import assert from 'node:assert/strict';
import {extensionVersion} from '../app/src/shared/extension-version.ts';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const port=process.env.ONHOLD_OPERATIONS_TEST_PORT||'21440',base='http://127.0.0.1:'+port,server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',port,'--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:['ignore','pipe','pipe']});let browser;
const at=Date.UTC(2026,9,28,12),metric=value=>({value,delta:null,approximate:false,delta_approximate:false,observed_at:at,baseline_at:null});
const points=n=>Array.from({length:n},(_,i)=>({date:new Date(at-(n-1-i)*86400000).toISOString().slice(0,10),metrics:{impressions:100+i*15+(i%3)*80,likes:5+i%7,engagements:20+i%19,engagement_rate:3+i%3,profile_visits:5+i%4,new_follows:3+i%5,unfollows:i%2,net_follows:3+i%5-i%2,replies:2+i%4,reposts:i%3,bookmarks:i%2,shares:i%2,posts:1+i%2}}));
const snap=(n,key)=>{const series=points(n),metrics=Object.fromEntries(Object.keys(series[0].metrics).filter(key=>!['net_follows','engagement_rate'].includes(key)).map(key=>[key,{value:series.reduce((sum,p)=>sum+p.metrics[key],0),raw:'',approximate:false}]));metrics.engagement_rate={value:metrics.engagements.value/metrics.impressions.value*100,raw:'',approximate:false};return {data:{period:key==='7d'?'7D':'3M',period_key:key,available_periods:['7d','14d','28d','90d','365d'],metrics,series},observed_at:at,source:'https://x.com/i/account_analytics'};};
const week=snap(7,'7d'),quarter=snap(90,'90d');
const fixture={accounts:[{handle:'example',first_seen:at,last_seen:at}],account:'example',posts:[],metrics:{followers:{...metric(100),delta:10},following:{...metric(156),delta:-2},views:{...metric(1200),delta:-10},likes:{...metric(0),delta:0},replies:metric(null)},series:[],days:7,analytics:quarter,analytics_periods:{'7d':week,'90d':quarter},creator:{account:'example',snapshot:{data:{account:'example',state:'ineligible',verified_followers:{current:{value:492},target:500},verified_impressions:{current:{value:291},target:500000,days:90}},observed_at:at,source:'https://x.com/i/jf/creators/original_content_rewards'},assumptions:null}};
try{
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({headless:true,channel:'chromium'});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({fixture,at,extensionVersion})=>{
  if(sessionStorage.getItem('analytics-fixture')==='missing'){fixture.analytics=null;fixture.analytics_periods={};}
  if(sessionStorage.getItem('analytics-fixture')==='zero'){for(const snapshot of [fixture.analytics,...Object.values(fixture.analytics_periods)]){for(const metric of Object.values(snapshot.data.metrics))metric.value=0;for(const point of snapshot.data.series)for(const key of Object.keys(point.metrics))point.metrics[key]=0;}}
  const creatorMode=sessionStorage.getItem('creator-fixture');if(creatorMode==='missing'){fixture.creator.snapshot=null;for(const snapshot of [fixture.analytics,...Object.values(fixture.analytics_periods)])snapshot.data.metrics.verified_followers={value:538,raw:'538',approximate:false};}if(creatorMode==='met'){fixture.creator.snapshot.data.state='eligible';fixture.creator.snapshot.data.verified_followers.current.value=500;fixture.creator.snapshot.data.verified_impressions.current.value=500000;fixture.creator.calibration={payout:20,currency:'USD',impressions:1000,start_date:'2026-10-01',end_date:'2026-10-14',period:'2W',verified_only:false,observed_at:at};}if(creatorMode==='partial'){fixture.creator.snapshot.data={account:'example',state:'unknown',verified_followers:{current:{value:0},target:500}};}
  localStorage.setItem('onhold-setup-complete','1');window.isTauri=true;window.requests=[];window.loadedVersion=sessionStorage.getItem('extension-fixture')==='outdated'?'1.0.0':extensionVersion;window.reviews=[];window.savedBookmarks=[];window.logs=[{id:1,at,level:'info',account:'example',kind:'ingest',message:'官方统计已更新'}];window.config={provider:'codex_cli',cli_path:'',model:'',endpoint:'https://api.openai.com/v1',api_style:'responses',key_saved:false};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
  window.__TAURI_INTERNALS__={transformCallback:()=>1,invoke:async(command,args={})=>{
   window.requests.push({command,...args});if(command==='plugin:event|listen')return 1;if(command==='plugin:event|unlisten')return;
   if(command==='model_config')return {...window.config};
   if(command==='save_model_config'){window.config={...args.config,key_saved:args.config.provider==='responses_api'};return {...window.config};}
   if(command==='inspect_model')return {ready:true,message:'codex-cli 0.164.0'};
   if(command==='analyze_memory'){if(JSON.stringify(args.context).includes('secret-key'))throw Error('key leaked');window.reviews=[{id:'review1',at,provider:args.expectedConfig.provider,question:args.question,content:'事实：所选周期曝光上升。建议：用两篇案例做下一轮验证，关注主页访问与净增关注。',adopted:false}];return {id:'review1'};}
   if(command==='export_memory')return '/Downloads/OnHold-memory-example.json';
   if(command!=='admin')return;
   const {operation,input}=args;
   if(operation==='pairing')return {endpoint:'http://127.0.0.1:18431',extension:'/test/browser-extension',mobile:false};
   if(operation==='dashboard')return fixture;
   if(operation==='connections')return [{id:'fixture',account:'example',online:true,transport:'websocket',login_state:'logged_in',analytics_supported:window.analyticsSupported!==false,extension_version:window.loadedVersion,last_seen:at,error:''}];
   if(operation==='job_records'){const pageInput=input,rows=(window.publicationJobs||[]).filter(job=>job.account===pageInput.account&&(!pageInput.source||pageInput.source==='all'||(pageInput.source==='automation'?!!job.input?.task_id:!job.input?.task_id))&&(pageInput.state==='all'||job.state===pageInput.state)&&[job.id,job.action,job.error,job.input?.text,job.input?.source?.text].join(' ').toLowerCase().includes(pageInput.search.trim().toLowerCase()));const offset=Math.min(pageInput.offset,Math.floor(Math.max(0,rows.length-1)/20)*20);return {items:structuredClone(rows.slice(offset,offset+20)),total:rows.length,offset};}
   if(operation==='job_logs')return {items:window.executionLogFixture?[{id:1,at,stage:'created',message:'任务已创建'},{id:2,at:at+1000,stage:'model',message:'模型调用结束 · 150 tokens · 2500ms'},{id:3,at:at+3000,stage:'failed',message:'No tab with given id 123456.'}]:[{id:1,at:Date.now(),stage:'created',message:'任务已创建'}],total:window.executionLogFixture?3:1,offset:0};
   if(operation==='jobs')return structuredClone(window.publicationJobs||[]);
   if(operation==='schedule_publication'){const job=window.publicationJobs.find(job=>job.id===input.id);job.input.publish_at=input.run_at;return {saved:true};}
   if(operation==='retry_rewrite'){const job=window.publicationJobs.find(job=>job.id===input.id);job.state='queued';job.error=null;return {saved:true};}
   if(operation==='logs')return window.logs.filter(log=>log.id>(input.after||0));
   if(operation==='bookmarks'){const items=window.savedBookmarks.filter(item=>(!input.search||item.post.text.includes(input.search))&&(!input.tag||item.tags.includes(input.tag))),offset=input.offset||0;return {account:'example',items:items.slice(offset,offset+50),tags:['选题'],total:items.length,next_offset:offset+50<items.length?offset+50:null};}
   if(operation==='remove_bookmark'){window.savedBookmarks=window.savedBookmarks.filter(item=>item.post.id!==input.id);return {saved:true};}
   if(operation==='relationships')return {account:'example',items:[],runs:[],total:0,next_offset:null,sync:null};
   if(operation==='automation')return {account:'example',block:null,tasks:[]};
   if(operation==='memory_context')return {account:'example',official_metrics:fixture.analytics_periods['7d'].data.metrics,posts:[],bookmarks:[],preferences:{notes:'用真实案例讲清楚产品价值'},previous_reviews:window.reviews};
   if(operation==='reviews')return window.reviews;
   if(operation==='adopt_review'){window.reviews[0].adopted=input.adopted;return {saved:true};}
   return {saved:true};
  }};
 },{fixture,at,extensionVersion});
 await page.goto(base);page.setDefaultTimeout(8000);
 const chart=page.getByRole('img',{name:'多指标官方趋势',exact:true});await chart.locator('canvas').waitFor();
 await page.getByRole('region',{name:'账号与帖子观测',exact:true}).waitFor();
 assert.equal(await page.locator('.metrics-grid > .n-card').count(),5,'profile metrics and official totals share the page');
 assert.equal(await page.getByRole('tablist',{name:'统计来源',exact:true}).count(),0,'the source switch is removed');
 assert.equal(await page.getByText('重点帖子',{exact:true}).count(),0,'the highlighted-post section is removed');
 for(const name of ['已采集转发','已采集书签','可比帖评论率'])assert.equal(await page.getByText(name,{exact:true}).count(),0,'removed overview card: '+name);
 assert.equal(await page.getByRole('button',{name:'采集运营数据',exact:true}).count(),1,'one collection action serves the combined overview');
 const officialCard=title=>page.locator('.metrics-grid > .n-card').filter({has:page.getByText(title,{exact:true})});
 for(const [title,key] of [['官方曝光量','impressions'],['官方点赞','likes'],['官方评论','replies']])assert.equal(await officialCard(title).locator('.business-number').innerText(),week.data.metrics[key].value.toLocaleString('zh-CN'),'cards use the same official period as the chart');
 for(const title of ['已采集浏览量','已采集点赞','已采集评论'])assert.equal(await page.getByText(title,{exact:true}).count(),0,'partial post samples are not presented as account totals');
 await page.screenshot({path:'app/screenshots/merged-overview-desktop.png',fullPage:true,animations:'disabled'});

 assert.equal(await page.locator('.analytics-legend > button').count(),13);
 assert.ok(await page.locator('.n-menu').count()>0,'the native Naive menu is mounted');
 assert.equal(await page.locator('.ant-btn,[data-ui-base="antd"]').count(),0);
 assert.ok(await page.locator('html').evaluate(n=>n.classList.contains('dark')));
 const bodyFont=await page.locator('body').evaluate(n=>getComputedStyle(n).fontFamily);
 assert.equal(await page.locator('.analytics-legend button').first().evaluate(n=>getComputedStyle(n).fontFamily),bodyFont);
 await page.evaluate(()=>document.fonts.ready);assert.ok(await page.locator('.onhold-brand').first().evaluate(n=>getComputedStyle(n).fontFamily.includes('Launch Rounded')));
 const metricSelector=page.getByRole('group',{name:'选择曲线指标',exact:true});
 await metricSelector.getByRole('button').filter({hasText:'曝光量'}).click();await page.getByRole('img',{name:'曝光量官方趋势',exact:true}).waitFor();assert.equal(await metricSelector.locator('button[aria-pressed=true]').count(),1);
 await page.getByRole('button',{name:'全部指标',exact:true}).click();await chart.waitFor();
 await page.screenshot({path:'app/screenshots/vue-reference-chart-desktop.png',fullPage:true,animations:'disabled'});
 await page.getByRole('combobox',{name:'官方统计周期'}).click();await page.getByRole('option',{name:'3M',exact:true}).click();await page.getByText('3M ·',{exact:false}).first().waitFor();assert.equal(await officialCard('官方点赞').locator('.business-number').innerText(),quarter.data.metrics.likes.value.toLocaleString('zh-CN'),'changing the chart period also changes the top cards');
 await page.getByRole('combobox',{name:'趋势时间粒度'}).click();await page.getByRole('option',{name:'每周',exact:true}).click();await chart.locator('canvas').waitFor();
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).hover();await page.getByRole('tooltip').waitFor();assert.match(await page.getByRole('tooltip').innerText(),/492.*500/);assert.match(await page.getByRole('tooltip').innerText(),/291.*500,000/);await page.mouse.move(0,0);
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).click();let dialog=page.getByRole('dialog',{name:'创作者中心',exact:true});await dialog.waitFor();assert.equal(await dialog.getByRole('progressbar',{name:'认证粉丝进度',exact:true}).getAttribute('aria-valuenow'),'98.4');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'连接正常，管理账号与模型',exact:true}).click();dialog=page.getByRole('dialog',{name:'账号与模型',exact:true});await dialog.waitFor();
 await dialog.getByRole('combobox',{name:'调用方式'}).click();await page.getByRole('option',{name:'自带 API Key',exact:true}).click();
 await dialog.getByLabel('模型名称',{exact:true}).fill('test-model');await dialog.getByLabel('API Key',{exact:true}).fill('secret-key');await dialog.getByRole('button',{name:'保存模型',exact:true}).click();await dialog.getByText('模型设置已保存',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('API Key',{exact:true}).inputValue(),'');assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('secret-key'));await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 for(const hash of ['posts','bookmarks']){await page.goto(base+'/#'+hash);await page.getByRole('region',{name:'账号与帖子观测',exact:true}).waitFor();}assert.equal(await page.evaluate(()=>requests.filter(r=>['bookmarks','memory_context'].includes(r.operation)).length),0);
 await page.goto(base+'/#author');await page.getByRole('link',{name:'Telegram https://t.me/On_Hold_CC',exact:true}).waitFor();await page.getByText('v0.9.5',{exact:true}).click();await page.getByText('增加已关注、粉丝、待回关与未回关名单，支持分页续传、搜索及勾选创建暂停任务。',{exact:true}).waitFor();
 await page.evaluate(({at})=>{window.executionLogFixture=true;window.publicationJobs=Array.from({length:21},(_,i)=>({id:'execution-'+i,account:'example',action:'rewrite_publish',state:'failed',created_at:at-i*1000,updated_at:at+3000,error:'执行失败 '+i,input:{mode:i%2?'reply':'news',task_id:'plan',stage:'sending',telemetry:{generations:[{duration_ms:2500,usage:{input_tokens:100,output_tokens:50,total_tokens:150,cached_input_tokens:20}}],send_started_at:at+2500}}}));},{at});
 await page.goto(base+'/#logs');
 await page.getByRole('region',{name:'任务执行明细',exact:true}).waitFor();
 await page.getByRole('heading',{name:'执行明细日志',exact:true}).waitFor();
 await page.getByText('No tab with given id 123456.',{exact:true}).waitFor();
 await page.getByText('模型调用结束 · 150 tokens · 2500ms',{exact:true}).waitFor();
 assert.equal(await page.getByText('执行失败',{exact:true}).count(),1,'timeline has a readable stage name');
 await page.getByRole('button',{name:'收起明细',exact:true}).click();
 await page.waitForTimeout(2300);assert.equal(await page.getByRole('heading',{name:'执行明细日志',exact:true}).count(),0,'quiet polling preserves collapsed state');
 await page.getByRole('button',{name:'执行明细',exact:true}).first().click();await page.getByRole('heading',{name:'执行明细日志',exact:true}).waitFor();
 await page.getByRole('button',{name:'暂停日志刷新',exact:true}).click();
 await page.waitForTimeout(200);const pausedRequests=await page.evaluate(()=>requests.filter(r=>r.operation==='job_records'||r.operation==='job_logs').length);
 await page.waitForTimeout(2300);assert.equal(await page.evaluate(()=>requests.filter(r=>r.operation==='job_records'||r.operation==='job_logs').length),pausedRequests);
 await page.getByRole('button',{name:'继续日志刷新',exact:true}).click();
 await page.getByRole('searchbox',{name:'筛选执行明细',exact:true}).fill('执行失败 20');await page.getByText('任务 ID：execution-20',{exact:true}).waitFor();
 await page.getByRole('searchbox',{name:'筛选执行明细',exact:true}).fill('');await page.getByText('任务 ID：execution-0',{exact:true}).waitFor();
 const executionPages=page.getByLabel('执行任务分页',{exact:true});await executionPages.getByText('2',{exact:true}).click();await page.getByText('任务 ID：execution-20',{exact:true}).waitFor();
 await page.setViewportSize({width:375,height:812});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await page.getByRole('heading',{name:'执行明细日志',exact:true}).waitFor();
 await page.screenshot({path:'app/screenshots/execution-logs-mobile.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{window.executionLogFixture=false;window.publicationJobs=[];});
 await page.getByRole('tab',{name:'系统事件',exact:true}).click();await page.getByText('官方统计已更新',{exact:true}).waitFor();await page.evaluate(({at})=>logs.push({id:2,at,level:'error',account:'example',kind:'automation.limited',message:'关注受限，账号任务已暂停'}),{at});await page.getByText('关注受限，账号任务已暂停',{exact:true}).waitFor();
 for(const hash of ['overview','automation','tasks','logs','author']){await page.setViewportSize({width:375,height:812});await page.goto(base+'/#'+hash);await page.locator('.n-card').first().waitFor();await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),hash+' fits a phone');}
 await page.screenshot({path:'app/screenshots/vue-native-mobile.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/#overview');
 await page.evaluate(()=>sessionStorage.setItem('creator-fixture','missing'));await page.reload();await page.getByRole('button',{name:'查看创作者进度',exact:true}).hover();await page.getByRole('tooltip').waitFor();await page.getByRole('tooltip').getByText('538',{exact:true}).waitFor();await page.mouse.move(0,0);
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).click();dialog=page.getByRole('dialog',{name:'创作者中心',exact:true});await dialog.getByText('尚未采集',{exact:true}).waitFor();await dialog.getByRole('button',{name:'采集资格数据',exact:true}).click();assert.ok(await page.evaluate(()=>requests.some(r=>r.operation==='enqueue'&&r.input.action==='capture_creator')));await page.keyboard.press('Escape');
 await page.evaluate(()=>sessionStorage.setItem('creator-fixture','met'));await page.reload();await page.getByRole('progressbar',{name:'创作者资格总进度'}).waitFor();assert.equal(await page.getByRole('progressbar',{name:'创作者资格总进度'}).getAttribute('aria-valuenow'),'100');
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).click();dialog=page.getByRole('dialog',{name:'创作者中心',exact:true});await dialog.getByText('重新校准',{exact:true}).click();await dialog.getByLabel('结算金额',{exact:true}).fill('40');await dialog.getByLabel('统计开始',{exact:true}).fill('2026-10-01');await dialog.getByLabel('统计结束',{exact:true}).fill('2026-10-14');assert.equal(await dialog.getByRole('button',{name:'保存校准',exact:true}).isDisabled(),true);await dialog.getByLabel('该金额对应上述统计时间段',{exact:true}).check();await dialog.getByRole('button',{name:'保存校准',exact:true}).click();await page.waitForFunction(()=>requests.some(r=>r.operation==='save_earnings_calibration'));const calibrated=await page.evaluate(()=>requests.find(r=>r.operation==='save_earnings_calibration').input);assert.equal(calibrated.payout,40);assert.equal(calibrated.confirmed,true);await page.keyboard.press('Escape');
 await page.evaluate(()=>{sessionStorage.removeItem('creator-fixture');sessionStorage.setItem('analytics-fixture','missing');});await page.reload();await page.getByRole('img',{name:'趋势数据尚未采集',exact:true}).waitFor();assert.equal(await page.locator('.analytics-legend strong [role="img"]').count(),12);assert.equal(await page.locator('.metrics-grid [aria-label="数值未采集"]').count(),3,'missing official data never falls back to observed post totals');assert.equal(await page.getByRole('img',{name:'多指标官方趋势',exact:true}).isVisible(),false);
 await page.evaluate(()=>sessionStorage.setItem('analytics-fixture','zero'));await page.reload();await page.getByRole('img',{name:'多指标官方趋势',exact:true}).locator('canvas').waitFor();assert.equal(await page.locator('.analytics-legend strong [role="img"]').count(),0);for(const number of await page.locator('.analytics-legend strong').all())assert.match(await number.innerText(),/^0%?$/);for(const title of ['官方曝光量','官方点赞','官方评论'])assert.equal(await officialCard(title).locator('.business-number').innerText(),'0');
 await page.evaluate(()=>sessionStorage.removeItem('analytics-fixture'));await page.reload();
 await page.evaluate(()=>{window.publicationJobs=[{id:'publication-1',account:'example',action:'rewrite_publish',state:'rewriting',created_at:Date.now(),updated_at:Date.now(),error:null,input:{stage:'rewrite',source:{author:'writer',id:'123',url:'https://x.com/writer/status/123',text:'原帖内容'}}},{id:'other-account-job',account:'other',action:'rewrite_publish',state:'queued',created_at:Date.now(),updated_at:Date.now(),error:null,input:{stage:'rewrite'}}];});
 await page.goto(base+'/#tasks');await page.getByRole('region',{name:'任务记录列表',exact:true}).waitFor();
 await page.getByText('Codex CLI 正在润色原文',{exact:true}).waitFor({timeout:6000});assert.equal(await page.getByText('@other',{exact:true}).count(),0);
 await page.evaluate(()=>{const job=window.publicationJobs[0];job.state='queued';job.input.stage='ready';job.input.text='改写后的清晰表达。';});
 await page.getByText('待设置时间',{exact:true}).waitFor({timeout:6000});
 const scheduled=Date.now()+3600000,date=new Date(scheduled),dateInput=new Date(scheduled-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
 await page.getByRole('region',{name:'任务记录列表',exact:true}).getByRole('button',{name:'编辑',exact:true}).click();
 await page.getByLabel('发布时间 publication-1',{exact:true}).fill(dateInput);await page.getByRole('button',{name:'安排发布',exact:true}).click();
 await page.keyboard.press('Escape');await page.getByText('等待发布',{exact:true}).waitFor();const scheduleRequest=(await page.evaluate(()=>requests)).find(request=>request.operation==='schedule_publication');assert.equal(scheduleRequest.input.account,'example');assert.equal(scheduleRequest.input.id,'publication-1');assert.ok(scheduleRequest.input.run_at>Date.now());
 await page.screenshot({path:'app/screenshots/scheduled-queue-desktop.png',fullPage:true,animations:'disabled'});
 await page.evaluate(()=>{const job=window.publicationJobs[0];job.state='running';job.input.stage='sending';});
 await page.getByText('正在 X 首页输入并发布…',{exact:true}).waitFor({timeout:6000});assert.equal(await page.getByLabel('发布时间 publication-1',{exact:true}).count(),0);
 await page.evaluate(()=>{const job=window.publicationJobs[0];job.state='completed';job.result={url:'https://x.com/example/status/999'};});
 await page.getByRole('link',{name:'查看已发布帖子',exact:true}).waitFor({timeout:6000});
 await page.evaluate(()=>{const job=window.publicationJobs[0];job.state='failed';job.error='未收到明确发布结果';job.result=null;});
 await page.getByText('已尝试发送，请到 X 核对；不会自动重发。',{exact:true}).waitFor({timeout:6000});assert.equal(await page.getByRole('button',{name:'重试任务',exact:true}).count(),0);
 await page.evaluate(()=>{const job=window.publicationJobs[0];job.input.stage='ready';job.error='页面加载失败，未发送';});
 await page.getByRole('button',{name:'重试任务',exact:true}).click({timeout:6000});await page.getByText('等待发布',{exact:true}).waitFor();assert.ok((await page.evaluate(()=>requests)).some(request=>request.operation==='retry_rewrite'));
 await page.evaluate(()=>{const job=window.publicationJobs[0];job.input.mode='similar';job.state='rewriting';job.input.stage='rewrite';job.input.publish_at=null;job.input.text=null;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(window.failCopy)throw Error('clipboard denied');window.copiedText=text;}}});});
 await page.getByText('Codex CLI 正在生成同类文章',{exact:true}).waitFor({timeout:6000});await page.getByText('生成中',{exact:true}).waitFor();
 await page.evaluate(()=>{const job=window.publicationJobs[0];job.state='queued';job.input.stage='ready';job.input.text='同一主题，用全新的结构展开。\n\n清晰的结尾。';});
 await page.getByText('待设置时间',{exact:true}).waitFor({timeout:6000});
 await page.getByRole('region',{name:'任务记录列表',exact:true}).getByRole('button',{name:'查看',exact:true}).click();
 await page.getByText('原文',{exact:true}).click();await page.getByText('原帖内容',{exact:true}).waitFor();
 await page.getByText('同类文章正文',{exact:true}).click();await page.getByRole('button',{name:'复制正文',exact:true}).click();await page.getByText('正文已复制',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.copiedText),'同一主题，用全新的结构展开。\n\n清晰的结尾。');
 assert.equal(await page.evaluate(()=>window.publicationJobs[0].input.publish_at),null,'copying a generated article never schedules it');
 await page.evaluate(()=>window.failCopy=true);await page.getByRole('button',{name:'复制正文',exact:true}).click();await page.getByText('复制失败，请展开正文后手动复制',{exact:true}).waitFor();
 await page.evaluate(()=>window.failCopy=false);await page.getByRole('button',{name:'复制正文',exact:true}).click();await page.getByText('正文已复制',{exact:true}).waitFor();assert.equal(await page.getByText('复制失败，请展开正文后手动复制',{exact:true}).count(),0,'successful retry clears the copy error');
 await page.screenshot({path:'app/screenshots/similar-article-desktop.png',fullPage:true,animations:'disabled'});
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:375,height:812});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'scheduled task editor fits the phone');await page.screenshot({path:'app/screenshots/scheduled-queue-mobile.png',fullPage:true,animations:'disabled'});
 await page.goto(base+'/#overview');assert.equal(await page.getByRole('button',{name:'采集运营数据',exact:true}).isEnabled(),true,'future publication tasks must not block manual capture');
 const deltaTag=title=>page.locator('.metrics-grid > .n-card').filter({has:page.getByText(title,{exact:true})}).locator('.n-tag');
 const color=async title=>(await deltaTag(title).evaluate(n=>getComputedStyle(n).color)).match(/[\d.]+/g).slice(0,3).map(Number);
 const red=await color('当前粉丝'),green=await color('当前关注');
 assert.ok(red[0]>red[1]&&red[0]>red[2],'positive observed growth is red');assert.ok(green[1]>green[0]&&green[1]>green[2],'negative observed growth is green');
 assert.equal(await deltaTag('当前粉丝').innerText(),'+10');assert.equal(await deltaTag('当前关注').innerText(),'-2');
 assert.equal(await officialCard('官方点赞').locator('.n-tag').count(),0,'official period totals never carry unrelated observation deltas');
 await page.evaluate(()=>window.analyticsSupported=false);
 await page.getByText('30 天',{exact:true}).click();await page.waitForFunction(()=>requests.some(r=>r.operation==='dashboard'&&r.input.days===30));await officialCard('官方点赞').getByRole('img',{name:'数值未采集',exact:true}).waitFor();assert.equal(await officialCard('官方点赞').locator('.business-number').count(),0,'missing 30-day data never reuses 7-day totals');
 await page.getByRole('alert').filter({hasText:'官方分析需要浏览器连接'}).waitFor();
 await page.getByRole('button',{name:'采集运营数据',exact:true}).click();
 assert.equal((await page.evaluate(()=>requests.filter(r=>r.operation==='enqueue'))).at(-1).input.action,'capture','the combined action still collects observations when official capture is unavailable');
 await page.locator('.analytics-legend').scrollIntoViewIfNeeded();await page.screenshot({path:'app/screenshots/merged-overview-mobile.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('Passed: native Soybean/Naive UI shell, reference chart, periods, creator/calibration, model secret handling, logs, missing/zero data and safe publication lifecycle.');
}finally{if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

import assert from 'node:assert/strict';
import {extensionVersion} from '../app/src/shared/extension-version.ts';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21440',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21440','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:['ignore','pipe','pipe']});let browser;
const at=Date.UTC(2026,9,28,12),metric=value=>({value,delta:null,approximate:false,delta_approximate:false,observed_at:at,baseline_at:null});
const points=n=>Array.from({length:n},(_,i)=>({date:new Date(at-(n-1-i)*86400000).toISOString().slice(0,10),metrics:{impressions:100+i*15+(i%3)*80,likes:5+i%7,engagements:20+i%19,engagement_rate:3+i%3,profile_visits:5+i%4,new_follows:3+i%5,unfollows:i%2,net_follows:3+i%5-i%2,replies:2+i%4,reposts:i%3,bookmarks:i%2,shares:i%2,posts:1+i%2}}));
const snap=(n,key)=>{const series=points(n),metrics=Object.fromEntries(Object.keys(series[0].metrics).filter(key=>!['net_follows','engagement_rate'].includes(key)).map(key=>[key,{value:series.reduce((sum,p)=>sum+p.metrics[key],0),raw:'',approximate:false}]));metrics.engagement_rate={value:metrics.engagements.value/metrics.impressions.value*100,raw:'',approximate:false};return {data:{period:key==='7d'?'7D':'3M',period_key:key,available_periods:['7d','14d','28d','90d','365d'],metrics,series},observed_at:at,source:'https://x.com/i/account_analytics'};};
const week=snap(7,'7d'),quarter=snap(90,'90d');
const fixture={accounts:[{handle:'example',first_seen:at,last_seen:at}],account:'example',posts:[],metrics:{followers:metric(100),views:metric(1200)},series:[],days:7,analytics:quarter,analytics_periods:{'7d':week,'90d':quarter},creator:{account:'example',snapshot:{data:{account:'example',state:'ineligible',verified_followers:{current:{value:492},target:500},verified_impressions:{current:{value:291},target:500000,days:90}},observed_at:at,source:'https://x.com/i/jf/creators/original_content_rewards'},assumptions:null}};
try{
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({headless:true,channel:'chromium'});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({fixture,at,extensionVersion})=>{
  const creatorMode=sessionStorage.getItem('creator-fixture');if(creatorMode==='missing')fixture.creator.snapshot=null;if(creatorMode==='met'){fixture.creator.snapshot.data.state='eligible';fixture.creator.snapshot.data.verified_followers.current.value=500;fixture.creator.snapshot.data.verified_impressions.current.value=500000;fixture.creator.calibration={payout:20,currency:'USD',impressions:1000,start_date:'2026-10-01',end_date:'2026-10-14',period:'2W',verified_only:false,observed_at:at};}if(creatorMode==='partial'){fixture.creator.snapshot.data={account:'example',state:'unknown',verified_followers:{current:{value:0},target:500}};}
  localStorage.setItem('onhold-setup-complete','1');window.isTauri=true;window.requests=[];window.loadedVersion=sessionStorage.getItem('extension-fixture')==='outdated'?'1.0.0':extensionVersion;window.reviews=[];window.logs=[{id:1,at,level:'info',account:'example',kind:'ingest',message:'官方统计已更新'}];window.config={provider:'codex_cli',cli_path:'',model:'',endpoint:'https://api.openai.com/v1',api_style:'responses',key_saved:false};
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
   if(operation==='connections')return [{id:'fixture',account:'example',online:true,transport:'websocket',login_state:'logged_in',analytics_supported:true,extension_version:window.loadedVersion,last_seen:at,error:''}];
   if(operation==='jobs')return [];
   if(operation==='logs')return window.logs.filter(log=>log.id>(input.after||0));
   if(operation==='bookmarks')return {account:'example',items:[],tags:[],total:0,next_offset:null};
   if(operation==='automation')return {account:'example',block:null,tasks:[]};
   if(operation==='memory_context')return {account:'example',official_metrics:fixture.analytics_periods['7d'].data.metrics,posts:[],bookmarks:[],preferences:{notes:'用真实案例讲清楚产品价值'},previous_reviews:window.reviews};
   if(operation==='reviews')return window.reviews;
   if(operation==='adopt_review'){window.reviews[0].adopted=input.adopted;return {saved:true};}
   return {saved:true};
  }};
 },{fixture,at,extensionVersion});
 await page.goto(base);await page.getByRole('img',{name:'多指标官方趋势',exact:true}).waitFor();assert.ok(await page.locator('.recharts-line-curve').count()>=8);
 assert.equal(await page.getByRole('link',{name:'连接与设置',exact:true}).count(),0);assert.equal(await page.locator('.analytics-card').getAttribute('data-slot'),null);
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).hover();await page.getByRole('tooltip').waitFor();assert.match(await page.getByRole('tooltip').innerText(),/492.*500/);assert.match(await page.getByRole('tooltip').innerText(),/291.*500,000/);await page.mouse.move(0,0);
 assert.equal(await page.locator('.creator-panel').count(),0,'progress does not take space in the page');await page.getByRole('button',{name:'查看创作者进度',exact:true}).click();await page.getByRole('dialog',{name:'创作者中心',exact:true}).waitFor();
 assert.equal(await page.getByRole('progressbar',{name:'认证粉丝进度',exact:true}).getAttribute('value'),'98.4');await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'创作者中心',exact:true}).waitFor({state:'hidden'});
 await page.getByRole('img',{name:'软件免费使用标识',exact:true}).waitFor();assert.ok(await page.getByRole('img',{name:'软件免费使用标识',exact:true}).evaluate(img=>img.complete&&img.naturalWidth===336));assert.ok(!(await page.locator('body').innerText()).includes('永久免费'),'the announcement is an image, with an accessible descriptive label');
 await page.locator('.analytics-selectors button').filter({hasText:'曝光量'}).click();await page.getByRole('img',{name:'曝光量官方趋势',exact:true}).waitFor();assert.equal(await page.locator('.recharts-line-curve').count(),1);
 await page.getByRole('button',{name:'全部指标',exact:true}).click();assert.ok(await page.locator('.recharts-line-curve').count()>=8);
 await page.getByRole('combobox',{name:'官方统计周期'}).click();await page.getByRole('option',{name:'3M',exact:true}).click();await page.getByText('3M ·',{exact:false}).waitFor();await page.getByRole('combobox',{name:'趋势时间粒度'}).click();await page.getByRole('option',{name:'每周',exact:true}).click();assert.ok(await page.locator('.recharts-line-curve').count()>=8);
 await page.screenshot({path:'app/screenshots/operations-0.9-desktop.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'连接正常，管理账号与模型',exact:true}).click();const dialog=page.getByRole('dialog',{name:'账号与模型',exact:true});await dialog.waitFor();
 await dialog.locator('[data-slot=select-trigger]').filter({hasText:'本机 Codex CLI'}).click();await page.getByRole('option',{name:'自带 API Key',exact:true}).click();
 await dialog.getByLabel('模型名称',{exact:true}).fill('test-model');await dialog.getByLabel('API Key',{exact:true}).fill('secret-key');await dialog.getByRole('button',{name:'保存模型',exact:true}).click();await dialog.getByText('模型设置已保存',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('API Key',{exact:true}).inputValue(),'');assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('secret-key'));
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.getByRole('link',{name:'内容复盘',exact:true}).first().click();await page.getByRole('button',{name:'准备复盘',exact:true}).click();await page.getByLabel('确认模型发送范围',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>requests)).filter(r=>r.command==='analyze_memory').length,0,'preview never sends the data');await page.getByRole('button',{name:'确认并发送',exact:true}).click();await page.getByText('复盘已保存在本地',{exact:true}).waitFor();await page.getByLabel('我采用了这次复盘建议',{exact:true}).check();assert.equal((await page.evaluate(()=>reviews))[0].adopted,true);
 await page.getByRole('link',{name:'作者',exact:true}).first().click();await page.getByRole('link',{name:'Telegram https://t.me/On_Hold_CC',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Telegram https://t.me/On_Hold_CC',exact:true}).count(),1);assert.equal(await page.locator('.release-notes details[open]').count(),0);await page.locator('.release-notes summary').first().click();assert.equal(await page.locator('.release-notes details[open]').count(),1);await page.screenshot({path:'app/screenshots/author-0.9.png',fullPage:true,animations:'disabled'});
 await page.getByRole('link',{name:'系统日志',exact:true}).first().click();await page.getByText('官方统计已更新',{exact:true}).waitFor();await page.evaluate(({at})=>logs.push({id:2,at,level:'error',account:'example',kind:'automation.limited',message:'关注受限，账号任务已暂停'}),{at});await page.getByText('关注受限，账号任务已暂停',{exact:true}).waitFor({timeout:6000});
 for(const hash of ['overview','posts','bookmarks','automation','logs','author']){await page.setViewportSize({width:375,height:812});await page.goto(base+'/#'+hash);await page.getByRole('img',{name:'软件免费使用标识',exact:true}).waitFor();await page.locator({overview:'.analytics-card',posts:'.content-panel',bookmarks:'.bookmark-library',automation:'.automation-manager',logs:'.system-log',author:'.author-page'}[hash]).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),hash+' has no horizontal overflow');}
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/#overview');
 await page.evaluate(()=>sessionStorage.setItem('creator-fixture','missing'));await page.reload();
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).click();await page.locator('.creator-panel.creator-empty').getByText('尚未采集',{exact:true}).waitFor();
 for(const width of [1440,375]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('.creator-panel progress,.creator-panel .creator-earnings').count(),0);assert.equal(await page.locator('.creator-panel').evaluate(n=>getComputedStyle(n).position),'static');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.screenshot({path:'app/screenshots/creator-empty-mobile.png',fullPage:true,animations:'disabled'});
 await page.evaluate(()=>sessionStorage.setItem('creator-fixture','partial'));await page.reload();
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).click();await page.getByRole('progressbar',{name:'认证粉丝进度',exact:true}).waitFor();assert.equal(await page.getByRole('progressbar',{name:'认证粉丝进度',exact:true}).getAttribute('value'),'0');assert.equal(await page.getByRole('progressbar',{name:'认证主页曝光进度',exact:true}).count(),0,'unknown criteria do not produce indeterminate progress');
 await page.keyboard.press('Escape');
 const popup=await browser.newPage({viewport:{width:380,height:600}});popup.on('pageerror',error=>errors.push(error.message));
 await popup.addInitScript(()=>{window.chrome={runtime:{getURL:path=>'https://extension.invalid/'+path,sendMessage:async({type})=>({ok:true,data:type==='CDP_STATUS'?{configured:true,endpoint:'http://127.0.0.1:18431',cdpAccount:'example',cdpWs:'connected',cdpLoginState:'logged_in'}:{account:'example',postCount:0,lastCapture:null,metrics:{},job:null,creator:{account:'example',snapshot:null,assumptions:null}}})},tabs:{create:async()=>{}},permissions:{request:async()=>true}};});
 await popup.goto(base+'/bridge.html');await popup.getByRole('button',{name:'查看创作者进度',exact:true}).click();await popup.locator('.creator-empty').getByText('尚未采集',{exact:true}).waitFor();assert.equal(await popup.locator('.creator-panel progress,.creator-panel .creator-earnings').count(),0);assert.ok(await popup.locator('.creator-empty').evaluate(n=>n.getBoundingClientRect().height)<=80);
 await popup.screenshot({path:'app/screenshots/creator-empty-popup.png',fullPage:true,animations:'disabled'});
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>sessionStorage.setItem('creator-fixture','met'));await page.reload();
 await page.getByRole('progressbar',{name:'创作者资格总进度',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'查看创作者进度',exact:true}).getAttribute('data-complete'),'true');assert.equal(await page.getByRole('progressbar',{name:'创作者资格总进度',exact:true}).getAttribute('aria-valuenow'),'100');
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).hover();await page.getByRole('tooltip').waitFor();assert.match(await page.getByRole('tooltip').innerText(),/500,000.*500,000/);await page.mouse.move(0,0);
 await page.locator('.analytics-legend > button').filter({hasText:'奖励参考'}).click();await page.getByRole('img',{name:'奖励参考估算趋势',exact:true}).waitFor();assert.equal(await page.locator('.recharts-line-curve').count(),1);assert.match(await page.locator('.analytics-legend > button').filter({hasText:'奖励参考'}).innerText(),/29.90/);
 await page.screenshot({path:'app/screenshots/curve-first-gold-progress.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'查看创作者进度',exact:true}).click();await page.locator('.reward-calibration > summary').click();
 await page.getByLabel('结算金额',{exact:true}).fill('40');await page.getByLabel('统计开始',{exact:true}).fill('2026-10-01');await page.getByLabel('统计结束',{exact:true}).fill('2026-10-14');assert.equal(await page.getByRole('button',{name:'保存校准',exact:true}).isDisabled(),true);await page.getByLabel('该金额对应上述统计时间段',{exact:true}).check();await page.getByRole('button',{name:'保存校准',exact:true}).click();await page.waitForFunction(()=>window.requests.some(r=>r.operation==='save_earnings_calibration'));
 const calibrationRequest=(await page.evaluate(()=>window.requests)).find(r=>r.operation==='save_earnings_calibration');assert.equal(calibrationRequest.input.payout,40);assert.equal(calibrationRequest.input.currency,'USD');assert.equal(calibrationRequest.input.start_date,'2026-10-01');assert.equal(calibrationRequest.input.end_date,'2026-10-14');assert.equal(calibrationRequest.input.confirmed,true);await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'创作者中心',exact:true}).waitFor({state:'hidden'});

 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>{sessionStorage.setItem('extension-fixture','outdated');sessionStorage.removeItem('creator-fixture');});await page.reload();
 const upgrade=page.getByRole('dialog');await upgrade.getByRole('heading',{name:'更新 X 助手',exact:true}).waitFor();
 await upgrade.getByRole('button',{name:'打开扩展页',exact:true}).click();await upgrade.getByRole('heading',{name:'重载现有助手',exact:true}).waitFor();assert.ok((await page.evaluate(()=>requests)).some(r=>r.command==='open_extension_installation'));
 await upgrade.getByRole('button',{name:'检查更新并连接',exact:true}).click();await upgrade.getByRole('status').filter({hasText:'等待浏览器确认'}).waitFor();assert.equal(await upgrade.getByRole('heading',{name:'助手已更新',exact:true}).count(),0,'opening the extension page does not prove it was reloaded');
 await page.evaluate(version=>window.loadedVersion=version,extensionVersion);await upgrade.getByRole('heading',{name:'助手已更新',exact:true}).waitFor({timeout:8000});await upgrade.getByRole('button',{name:'关闭',exact:true}).last().click();await upgrade.waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'更新助手',exact:true}).count(),0);
 await page.screenshot({path:'app/screenshots/topbar-gold-and-creator.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('Passed: official multi-line chart, metric isolation, source periods and weekly aggregation, creator progress, global sweep GIF, top connection indicator, secure model form, explicit memory preview/adoption, author links and folded releases, live logs and responsive pages.');
}finally{if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

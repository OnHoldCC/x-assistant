import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21434';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21434','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:['ignore','pipe','pipe']});
server.stderr.on('data',data=>process.stderr.write(data));
let browser;
const at=Date.now(), metric=(value,approximate=false)=>({value,delta:null,approximate,delta_approximate:false,baseline_at:null,observed_at:at});
const post=(id,text,views,replies)=>({id,handle:'example',text,created_at:new Date(at-Number(id)*1000).toISOString(),hashtags:['OnHold'],first_seen:at,last_seen:at,url:'https://x.com/example/status/'+id,metrics:{views:metric(views),likes:metric(10),replies:metric(replies),reposts:metric(2),bookmarks:metric(null)}});
const posts=[post('123','触达高的内容',1000,10),post('124','讨论多的内容',100,20),post('125','尚未读到浏览量',null,0)];
const dashboard={accounts:[{handle:'example',first_seen:at,last_seen:at},{handle:'other',first_seen:at,last_seen:at}],account:'example',posts,metrics:{followers:metric(0),views:metric(1100),replies:metric(30)},series:[],days:7,analytics:null};
const clients=[{id:'client',account:'example',last_seen:at,online:true,transport:'websocket',login_state:'logged_in',error:'',capture_interval_seconds:300,analytics_supported:true}];
const jobs=[{id:'other',account:'other',action:'capture',state:'failed',error:'other account error',created_at:at,updated_at:at},{id:'retry',account:'example',action:'capture',state:'failed',error:'X 页面读取超时',created_at:at,updated_at:at},{id:'ok',account:'example',action:'capture',state:'completed',error:null,created_at:at,updated_at:at}];
try {
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview did not start');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,channel:'chromium'});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({dashboard,clients,jobs})=>{
    window.isTauri=true;window.requests=[];window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
      window.requests.push({command,...args});
      if(command.startsWith('plugin:event|'))return 1;
      if(command==='admin'&&args.operation==='pairing')return {mobile:true};
      if(command!=='remote_admin')throw Error('手机不应调用本机后台');
      if(args.endpoint==='https://unavailable.example')throw Error('后台无法连接');
      if(args.operation==='dashboard')return {...dashboard,account:args.input.account||dashboard.account};
      if(args.operation==='connections')return clients;
      if(args.operation==='jobs')return jobs;
      if(args.operation==='enqueue')return {id:'new'};
      if(args.operation==='automation')return {plans:[],jobs:[],block:null};
      if(['logs','reviews'].includes(args.operation))return [];
      if(args.operation==='memory_context')return {account:'example',preferences:null,posts:[],bookmarks:[],previous_reviews:[]};
      if(args.operation==='bookmarks')return {items:[],tags:[],total:0};
      if(args.operation==='pairing')throw Error('远程模式不应读取配对密钥');
      return {};
    }};
  },{dashboard,clients,jobs});
  await page.goto(base);
  await page.getByRole('heading',{name:'连接工作空间',exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>window.requests)).filter(r=>r.operation==='dashboard').length,0,'phone must not load an empty local database before pairing');
  assert.equal(await page.getByRole('button',{name:'打开扩展管理页'}).count(),0);
  await page.getByLabel('HTTPS 后台地址',{exact:true}).fill('http://insecure.example');await page.getByLabel('配对密钥',{exact:true}).fill('a'.repeat(64));await page.getByRole('button',{name:'连接后台',exact:true}).click();await page.getByRole('alert').filter({hasText:'HTTPS'}).waitFor();
  await page.getByLabel('HTTPS 后台地址',{exact:true}).fill('https://unavailable.example');await page.getByRole('button',{name:'连接后台',exact:true}).click();await page.getByRole('alert').filter({hasText:'后台无法连接'}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('onhold-remote')),null,'failed authentication must not replace the workspace');
  await page.getByLabel('HTTPS 后台地址',{exact:true}).fill('https://workspace.example');await page.getByRole('button',{name:'连接后台',exact:true}).click();await page.getByRole('heading',{name:'运营概览',exact:true}).waitFor();
  const nav=page.getByRole('navigation',{name:'主导航',exact:true});assert.equal(await nav.getByRole('link').count(),5);
  await page.screenshot({path:'app/screenshots/mobile-overview.png',fullPage:true,animations:'disabled'});
  await nav.getByRole('link',{name:'内容复盘',exact:true}).click();await page.getByRole('tab',{name:'帖子表现',exact:true}).click();await page.getByLabel('帖子表现',{exact:true}).waitFor();assert.equal(await page.getByRole('tablist',{name:'统计周期'}).count(),0,'content snapshot must not imply a selected publishing window');
  await page.getByRole('combobox',{name:'帖子排序'}).click();await page.getByRole('option',{name:'评论率优先',exact:true}).click();assert.match(await page.locator('.mobile-post-title').first().innerText(),/讨论多/);
  await page.getByRole('button',{name:'讨论多的内容',exact:true}).click();await page.getByRole('dialog',{name:'帖子详情'}).waitFor();await page.getByRole('link',{name:'查看原帖与评论',exact:false}).waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement?.classList.contains('mobile-post-title'));assert.equal(await page.getByRole('button',{name:'讨论多的内容',exact:true}).evaluate(n=>n===document.activeElement),true);
  await page.getByRole('combobox',{name:'帖子排序'}).click();await page.getByRole('option',{name:'最新发布',exact:true}).click();assert.match(await page.locator('.mobile-post-title').first().innerText(),/触达高/);
  await page.getByRole('tab',{name:'话题对比',exact:true}).click();await page.getByLabel('话题表现对比',{exact:true}).waitFor();assert.match(await page.getByLabel('话题表现对比',{exact:true}).innerText(),/可比 2 \/ 3 条/);
  await page.getByRole('searchbox',{name:'搜索帖子',exact:true}).fill('not-found');await page.getByRole('heading',{name:'暂无话题',exact:true}).waitFor();await page.getByRole('searchbox',{name:'搜索帖子',exact:true}).fill('');
  await page.goto(base+'/#tasks');await page.getByText('X 页面读取超时',{exact:true}).waitFor();assert.equal(await page.getByText('other account error',{exact:true}).count(),0,'task history must match the current account');
  await page.getByRole('button',{name:'重新采集',exact:true}).click();assert.ok((await page.evaluate(()=>window.requests)).some(r=>r.operation==='enqueue'&&r.input.account==='example'));
  await page.getByRole('combobox',{name:'任务状态'}).click();await page.getByRole('option',{name:'已完成',exact:true}).click();assert.equal(await page.getByText('X 页面读取超时',{exact:true}).count(),0);await page.getByText('数据已写入',{exact:true}).waitFor();
  for(const [view,title] of [['overview','运营概览'],['posts','内容复盘'],['accounts','账号管理'],['automation','自动化'],['logs','系统日志']]){
    for(const width of [375,390,767,812]){
      await page.setViewportSize({width,height:844});await page.goto(base+'/#'+view);await page.getByRole('heading',{name:title,exact:true,level:1}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view} overflow at ${width}`);
      if(width<768){assert.equal(await page.getByRole('button',{name:'切换侧栏',exact:true}).isVisible(),false);for(const link of await nav.getByRole('link').all())assert.ok(await link.evaluate(n=>n.getBoundingClientRect().height)>=44);}
      if(view==='posts')await page.getByRole('tab',{name:'帖子表现',exact:true}).click();
      if(width===390)await page.screenshot({path:'app/screenshots/mobile-'+view+'.png',fullPage:true,animations:'disabled'});
    }
  }
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  for(const [view,title] of [['overview','运营概览'],['posts','内容复盘'],['accounts','账号管理'],['automation','自动化'],['logs','系统日志']]){await page.goto(base+'/#'+view);await page.getByRole('heading',{name:title,exact:true,level:1}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`200% text overflow in ${view}: `+JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(n=>({tag:n.tagName,cls:n.className?.toString(),text:n.textContent?.slice(0,40),right:n.getBoundingClientRect().right})).filter(n=>n.right>innerWidth+1).slice(0,12))));}
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/#settings');assert.equal(await page.getByRole('button',{name:'打开扩展管理页'}).count(),0);assert.equal(await page.getByRole('button',{name:'使用本机数据'}).count(),0);await page.getByText('远程工作空间',{exact:true}).click();
  assert.equal((await page.evaluate(()=>window.requests)).filter(r=>r.command==='admin'&&r.operation!=='pairing').length,0);
  // Same endpoint updates also reload data, even when the account and route do not change.
  const before=(await page.evaluate(()=>window.requests)).length;await page.getByLabel('配对密钥',{exact:true}).fill('b'.repeat(64));await page.getByRole('button',{name:'切换工作空间',exact:true}).click();await page.getByRole('heading',{name:'运营概览',exact:true}).waitFor();assert.ok((await page.evaluate(()=>window.requests)).slice(before).some(r=>r.operation==='dashboard'&&r.token==='b'.repeat(64)));
  // Popup state fixture uses the actual bundled React page without changing a real browser profile.
  const popup=await browser.newPage({viewport:{width:380,height:800}});popup.setDefaultTimeout(8000);popup.on('pageerror',e=>errors.push(e.message));
  await popup.addInitScript(({at})=>{
    window.bridgeCalls=[];window.bridgeMetrics={followers:{value:0},following:{value:40},views:{value:null},likes:{value:390},replies:{value:290},reposts:{value:15}};window.bridgeStatus={endpoint:'http://127.0.0.1:18431',configured:true,cdpAccount:'example',cdpWs:'connected',cdpLoginState:'logged_in'};
    window.chrome={runtime:{getURL:path=>'https://extension.invalid/'+path,sendMessage:async(message)=>{window.bridgeCalls.push(message);if(message.type==='CDP_STATUS')return {ok:true,data:window.bridgeStatus};if(message.type==='CDP_OVERVIEW')return {ok:true,data:{account:'example',postCount:3,lastCapture:at,metrics:window.bridgeMetrics,job:{state:'completed',error:null,updated_at:at}}};return {ok:true,data:{}};}},tabs:{create:async(input)=>{window.bridgeCalls.push(input);}},permissions:{request:async()=>true}};
  },{at});
  await popup.goto(base+'/bridge.html');await popup.getByText('采集就绪',{exact:true}).waitFor();await popup.getByLabel('已采集数据',{exact:true}).waitFor();assert.match(await popup.getByLabel('已采集数据',{exact:true}).innerText(),/粉丝\s*0[\s\S]*浏览量\s*—/);await popup.getByRole('button',{name:'立即采集',exact:true}).click();await popup.getByRole('status').filter({hasText:'运营数据采集已排队'}).waitFor();
  await popup.getByLabel('插件设置',{exact:true}).click();await popup.getByRole('button',{name:'手动配对',exact:true}).click();await popup.getByLabel('后台地址',{exact:true}).fill('http://127.0.0.1:19000');await popup.waitForTimeout(5200);assert.equal(await popup.getByLabel('后台地址',{exact:true}).inputValue(),'http://127.0.0.1:19000','polling must preserve an unsaved endpoint');
  await popup.evaluate(()=>window.bridgeStatus.cdpLoginState='logged_out');await popup.getByText('需要重新登录',{exact:true}).waitFor({timeout:8000});assert.equal(await popup.getByRole('button',{name:'立即采集',exact:true}).count(),0);await popup.getByRole('button',{name:'手动配对',exact:true}).click();await popup.getByRole('button',{name:'重新绑定 X 账号',exact:true}).click();assert.ok((await popup.evaluate(()=>window.bridgeCalls)).some(r=>r.type==='CDP_CONNECT'&&r.data.pickX===true));
  await popup.evaluate(()=>window.bridgeStatus.cdpWs='disconnected');await popup.getByText('未连接',{exact:true}).waitFor({timeout:8000});await popup.screenshot({path:'app/screenshots/plugin-offline.png',fullPage:true,animations:'disabled'});
  await popup.evaluate(()=>{window.bridgeStatus.cdpWs='connected';window.bridgeStatus.cdpLoginState='logged_in';window.bridgeMetrics.followers={value:1200};window.bridgeMetrics.views={value:566000,approximate:true};});await popup.getByText('采集就绪',{exact:true}).waitFor({timeout:8000});await popup.getByLabel('已采集数据',{exact:true}).getByText('≈56.6万',{exact:true}).waitFor({timeout:8000});await popup.locator('main.bridge-shell').screenshot({path:'app/screenshots/plugin-connected.png',animations:'disabled'});assert.ok(await popup.locator('main.bridge-shell').evaluate(n=>n.getBoundingClientRect().height)<=600,'normal plugin overview should fit Chrome popup height');await popup.locator('main.bridge-shell').screenshot({path:'app/screenshots/plugin-connected.png',animations:'disabled'});
  assert.ok(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await popup.evaluate(()=>document.documentElement.style.fontSize='200%');assert.ok(await popup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'popup enlarged text must wrap');
  assert.deepEqual(errors,[]);
  console.log('Passed: mobile native workspace gating/authentication, bottom navigation, post/comment review, sort/search, account-scoped task retry/filter, responsive 375–812, popup data/states/reconnect/draft preservation.');
} finally {if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

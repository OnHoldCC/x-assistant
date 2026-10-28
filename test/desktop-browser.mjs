import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21436',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21436','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:['ignore','pipe','pipe']});
server.stderr.on('data',data=>process.stderr.write(data));let browser;
const at=Date.now(),metric=value=>({value,delta:null,approximate:false,delta_approximate:false,baseline_at:null,observed_at:at});
const dashboard={accounts:[{handle:'example',first_seen:at,last_seen:at},{handle:'other',first_seen:at,last_seen:at}],account:'example',posts:[],metrics:{followers:metric(0),views:metric(0),replies:metric(null)},series:[],days:7,analytics:null};
try{
 for(let i=0;;i++){if(server.exitCode!==null)throw Error('preview exited');try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview did not start');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:'chromium'});const page=await browser.newPage({viewport:{width:1320,height:940}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({dashboard,at})=>{
  window.isTauri=true;window.calls=[];window.hostAttempts=0;window.connected=false;window.firstCapture=false;window.jobs=[];window.holdEnqueue=false;
  window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{
   window.calls.push({command,...args});
   if(command==='open_browser_connection'||command==='open_extension_installation')return;
   if(command!=='admin')throw Error('桌面本机模式不应调用远程后台');
   if(args.operation==='pairing'){if(++window.hostAttempts===1)throw Error('启动读取失败');return {extension:'/test/user-data/browser-extension',endpoint:'http://127.0.0.1:18431',mobile:false};}
   if(args.operation==='dashboard')return window.firstCapture?{...dashboard,account:args.input.account||dashboard.account}:{...dashboard,account:null,accounts:[]};
   if(args.operation==='connections')return window.connected?[{id:'client',account:'example',online:true,transport:'websocket',login_state:'logged_in',last_seen:at,error:'',capture_interval_seconds:300,analytics_supported:true}]:[];
   if(args.operation==='jobs')return structuredClone(window.jobs);
   if(args.operation==='enqueue'){
    if(window.holdEnqueue)await new Promise(resolve=>window.releaseEnqueue=resolve);
    const task={id:'job-'+window.jobs.length,account:args.input.account,action:args.input.action,state:'queued',created_at:at,updated_at:at,error:null};window.jobs.unshift(task);return {id:task.id};
   }
   return {};
  }};
 },{dashboard,at});
 await page.goto(base);await page.getByRole('alert').filter({hasText:'启动读取失败'}).waitFor();await page.getByRole('button',{name:'重试',exact:true}).click();await page.getByText('安装 X 助手',{exact:true}).waitFor();
 await page.getByRole('button',{name:'打开扩展管理页',exact:true}).click();await page.waitForFunction(()=>window.calls.some(c=>c.command==='open_extension_installation'));
 await page.getByRole('button',{name:'已安装，下一步',exact:false}).click();await page.getByRole('button',{name:'连接 X 助手插件',exact:true}).click();assert.ok((await page.evaluate(()=>window.calls)).some(c=>c.command==='open_browser_connection'));
 await page.evaluate(()=>{window.connected=true;window.firstCapture=true;});await page.getByRole('button',{name:'进入运营后台',exact:true}).waitFor({timeout:6000});
 await page.evaluate(()=>window.connected=false);await page.getByText('连接你的 X 账号',{exact:true}).waitFor({timeout:6000});assert.equal(await page.getByRole('button',{name:'进入运营后台',exact:true}).count(),0,'disconnected onboarding must return to the connection step');
 await page.evaluate(()=>window.connected=true);await page.getByRole('button',{name:'进入运营后台',exact:true}).click({timeout:6000});await page.getByRole('heading',{name:'运营概览',exact:true}).waitFor();
 await page.getByRole('tab',{name:'账号分析',exact:true}).click();await page.getByRole('button',{name:'采集运营数据',exact:true}).click();assert.equal((await page.evaluate(()=>window.jobs))[0].action,'capture_analytics');await page.getByText('@example 采集已排队',{exact:true}).waitFor();
 await page.goto(base+'/#tasks');await page.getByRole('table',{name:'采集任务记录',exact:true}).getByText('采集官方分析',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'新建采集任务',exact:true}).count(),0);assert.ok(await page.getByRole('link',{name:'自动化',exact:true}).first().evaluate(n=>n.getBoundingClientRect().height)>=48);
 await page.evaluate(()=>{window.jobs[0].state='failed';window.jobs[0].error='分析页不可用';});assert.equal(await page.getByRole('button',{name:'刷新数据',exact:true}).count(),0);await page.getByText('分析页不可用',{exact:true}).waitFor({timeout:6000});await page.getByRole('button',{name:'重新采集',exact:true}).click();assert.equal((await page.evaluate(()=>window.jobs))[0].action,'capture_analytics','retry preserves the original task type');
 await page.evaluate(()=>window.jobs[0].state='completed');
 await page.getByRole('link',{name:'运营概览',exact:true}).first().click();await page.getByRole('tab',{name:'观测数据',exact:true}).click();
 await page.evaluate(()=>window.holdEnqueue=true);await page.getByRole('button',{name:'立即采集',exact:true}).click({timeout:6000});await page.waitForFunction(()=>typeof window.releaseEnqueue==='function');
 const before=(await page.evaluate(()=>window.calls)).filter(c=>c.operation==='enqueue').length;
 await page.getByRole('combobox',{name:'当前账号',exact:true}).click();await page.getByRole('option',{name:'@other',exact:true}).click();await page.getByRole('combobox',{name:'当前账号',exact:true}).getByText('@other',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'立即采集',exact:true}).isDisabled(),true,'a dashboard refresh must not unlock an in-flight submission');
 await page.evaluate(()=>window.releaseEnqueue());await page.getByRole('status').filter({hasText:'@example 采集已排队'}).waitFor();await page.waitForFunction(()=>window.calls.filter(c=>c.operation==='dashboard').at(-1)?.input.account==='other');
 assert.equal(await page.getByRole('combobox',{name:'当前账号',exact:true}).getByText('@other',{exact:true}).isVisible(),true,'completed old-account submissions must refresh the current account');assert.equal((await page.evaluate(()=>window.calls)).filter(c=>c.operation==='enqueue').length,before);
 assert.deepEqual(errors,[]);console.log('Passed: desktop native bootstrap retry, installation/connection commands, disconnect recovery during onboarding, official analytics enqueue/retry, pending submission and account switching.');
}finally{if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

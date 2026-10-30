import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21437',server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21437','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:['ignore','pipe','pipe']});
server.stderr.on('data',data=>process.stderr.write(data));let browser;
const at=Date.now(),metric=value=>({value,delta:null,approximate:false,observed_at:at,baseline_at:null,delta_approximate:false});
let fixture={metrics:{},series:[]};
try{
 for(let i=0;;i++){if(server.exitCode!==null)throw Error('preview exited');try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview did not start');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:'chromium'});const page=await browser.newPage({viewport:{width:1320,height:940}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('onhold-setup-complete','1'));
 await page.route('**/api/admin',route=>{
  const {operation}=route.request().postDataJSON();
  const value=operation==='dashboard'?{accounts:[{handle:'example',first_seen:at,last_seen:at}],account:'example',posts:[],analytics:null,days:7,...fixture}:operation==='pairing'?{}:[];
  return route.fulfill({json:value});
 });
 const visit=async()=>{await page.goto(base);await page.getByRole('region',{name:'账号与帖子观测',exact:true}).waitFor();};
 for(const metrics of [{},{views:metric(947)},{views:metric(0)}]){
  fixture.metrics=metrics;fixture.series=[];await visit();
  assert.equal(await page.getByRole('heading',{name:'观测趋势',exact:true}).count(),0);
  assert.equal(await page.locator('.welcome').count(),0);assert.equal(await page.getByText('重点帖子',{exact:true}).count(),0);assert.equal(await page.getByRole('tablist',{name:'统计来源',exact:true}).count(),0);await page.getByRole('img',{name:'趋势数据尚未采集',exact:true}).waitFor();
 }
 await page.setViewportSize({width:375,height:812});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('Passed: observed overview omits the removed welcome/trend panels for missing, zero and populated metrics, and fits mobile width.');
}finally{if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

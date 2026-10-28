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
 const visit=async()=>{await page.goto(base);await page.getByRole('heading',{name:'运营概览',exact:true}).waitFor();await page.getByRole('tab',{name:'观测数据',exact:true}).click();};
 await visit();await page.getByRole('status').filter({hasText:'尚未采到浏览量数据'}).waitFor();assert.equal(await page.getByRole('img',{name:'浏览量观测净增趋势'}).count(),0);
 fixture.metrics={views:metric(947)};await visit();await page.getByRole('status').filter({hasText:'已采到数据，等待对比'}).waitFor();
 const point=(label,value,approximate=false)=>({at,label,values:{views:value},approximate:{views:approximate}});
 for(const value of [0,12,-3]){
  fixture.series=[point('10/26',null),point('10/27',null),point('10/28',value)];await visit();
  await page.getByRole('status').filter({hasText:'浏览量净增 '+value}).waitFor();
  assert.equal(await page.getByRole('img',{name:'浏览量观测净增趋势'}).count(),0,'one point is a compact summary, not a full chart');
  if(value===0)await page.screenshot({path:'app/screenshots/trend-single-zero.png',fullPage:true,animations:'disabled'});
 }
 for(const values of [[0,0,0],[1,12,8],[-3,-1,-2]]){
  fixture.series=values.map((value,i)=>point('10/'+(26+i),value));await visit();
  const chart=page.getByRole('img',{name:'浏览量观测净增趋势',exact:true});await chart.waitFor();await chart.locator('.recharts-area-dots circle').first().waitFor();
  assert.equal(await chart.locator('.recharts-area-dots circle').count(),3);
  const d=await chart.locator('.recharts-area-curve').getAttribute('d');assert.ok(d.includes('C'),'monotone interpolation renders a smooth curve');
  const bounds=await chart.boundingBox();for(const dot of await chart.locator('.recharts-area-dots circle').all()){const r=await dot.boundingBox();assert.ok(r.y>=bounds.y&&r.y+r.height<=bounds.y+bounds.height);}
  if(values[0]===1)await page.screenshot({path:'app/screenshots/trend-curve-desktop.png',fullPage:true,animations:'disabled'});
 }
 fixture.series=[point('10/26',0),point('10/27',null),point('10/28',4)];await visit();await page.locator('.recharts-area-dots circle').first().waitFor();assert.equal(await page.locator('.recharts-area-dots circle').count(),2,'missing observations must never become fake zero points');
 fixture.series=[point('10/28',0,true)];await visit();await page.getByRole('status').filter({hasText:'浏览量净增 ≈0'}).waitFor();
 await page.setViewportSize({width:375,height:812});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('Passed: missing metric vs missing comparison, compact single zero/positive/negative observations and smooth zero/positive/negative curves, missing-day gaps, approximation labels and mobile width.');
}finally{if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

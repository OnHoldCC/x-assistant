import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21446';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21446','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:['ignore','pipe','pipe']});
let browser;
try {
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(server.exitCode!==null||i>100)throw Error('preview unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.setDefaultTimeout(8000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('onhold-setup-complete','1');window.isTauri=true;
  window.__TAURI_INTERNALS__={invoke:async(command,args={})=>{
   if(command!=='admin')return {};
   if(args.operation==='pairing')return {};
   if(args.operation==='connections'||args.operation==='jobs')return [];
   if(args.operation==='dashboard')return {accounts:[{handle:'example',first_seen:1,last_seen:Date.now()}],account:'example',posts:[],metrics:{},series:[],days:args.input.days,analytics:null,task_stats:[
    {action:'capture',input:{},completed:130,failed:4,tokens:0,missing_usage:0},
    {action:'rewrite_publish',input:{mode:'reply',scope:'for_you'},completed:7,failed:2,tokens:350,missing_usage:1},
    {action:'rewrite_publish',input:{mode:'news'},completed:3,failed:1,tokens:0,missing_usage:1},
   ]};
   return {};
  }};
 });
 await page.goto(base+'/#/');
 const table=page.getByRole('region',{name:'任务成功失败及 Token 统计'});
 await table.getByRole('cell',{name:'自动评论',exact:true}).waitFor();
 const reply=table.getByRole('row').filter({hasText:'自动评论'});
 assert.deepEqual(await reply.getByRole('cell').allTextContents(),['自动评论','7','2','≥ 350']);
 assert.ok((await table.getByRole('row').filter({hasText:'采集账号与帖子'}).textContent()).includes('130'));
 assert.ok((await table.getByRole('row').filter({hasText:'新闻发文'}).textContent()).includes('未记录'));
 await page.getByText('合计：成功 140 · 失败 7 · 消耗 ≥ 350 Token',{exact:true}).waitFor();
 await page.getByText('今日',{exact:true}).click();
 assert.equal(await page.getByRole('radio',{name:'今日',exact:true}).isChecked(),true);
 assert.deepEqual(await reply.getByRole('cell').allTextContents(),['自动评论','7','2','≥ 350'],'period changes do not change lifetime totals');
 for(const width of [1440,375]){
  await page.setViewportSize({width,height:1100});await table.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the table scrolls inside its card on mobile');
  await page.screenshot({path:`/tmp/onhold-overview-tasks-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1100});
 await page.getByRole('button',{name:'主题模式',exact:true}).click();
 await page.getByRole('button',{name:'主题模式',exact:true}).click();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.n-card')).backgroundColor.match(/\d+/g)?.slice(0,3).every(value=>Number(value)>200));
 await page.screenshot({path:'/tmp/onhold-overview-tasks-theme.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Passed: per-task success/failure totals, partial and missing Token usage, lifetime totals across date filters, and desktop/mobile layout. Fixture only.');
} finally {
 if(browser)await browser.close();
 if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
}

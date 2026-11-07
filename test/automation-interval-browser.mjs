import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21445';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21445','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:'ignore'});
let browser;
try {
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({headless:true,channel:'chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  localStorage.setItem('onhold-setup-complete','1');window.isTauri=true;window.saves=[];
  window.plans=['auto_reply','reply_notifications'].map((action,index)=>({id:action,enabled:true,state:'waiting',next_run:Date.now(),last_run:null,config:{action,interval_minutes:index?90:1,...(index?{}:{interval_seconds:25}),limit:1,after_days:7,scope:index?'notifications':'for_you',targets:[]}}));
  window.__TAURI_INTERNALS__={invoke:async(command,{operation,input}={})=>{
   if(command!=='admin'||operation==='pairing')return {};
   if(operation==='dashboard')return {accounts:[{handle:'example'}],account:'example',posts:[],metrics:{},series:[],days:7,analytics:null};
   if(operation==='automation')return {account:'example',tasks:structuredClone(window.plans),block:null};
   if(operation==='save_automation'){window.saves.push(input);let plan=window.plans.find(p=>p.id===input.id);if(!plan){plan={id:'image-plan'};window.plans.push(plan);}plan.config=input;plan.enabled=false;plan.state='paused';return {id:plan.id};}
   return [];
  }};
 });
 await page.goto(base+'/#/automation');
 const table=page.getByRole('region',{name:'自动化任务列表',exact:true});
 for(const [name,initial] of [['自动评论（For You）',['0','0','25']],['自动回复（通知）',['1','30','0']]]){
  const row=table.getByRole('row').filter({hasText:name});
  await row.getByRole('button',{name:'编辑',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'编辑自动化任务',exact:true});
  const fields=['执行间隔小时','执行间隔分钟','执行间隔秒'].map(label=>dialog.getByLabel(label,{exact:true}));
  for(let i=0;i<3;i++)assert.equal(await fields[i].inputValue(),initial[i]);
  for(const field of fields)await field.fill('0');
  await dialog.getByRole('button',{name:'保存并保持暂停',exact:true}).click();
  await dialog.locator('form').getByText('执行间隔应为1秒至7天，分和秒应为0–59的整数',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.saves.length),name==='自动评论（For You）'?0:1);
  for(let i=0;i<3;i++)await fields[i].fill(['2','3','4'][i]);
  await page.setViewportSize({width:375,height:900});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  for(const field of fields){const box=await field.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=375);}
  await page.screenshot({path:'/tmp/onhold-custom-interval-mobile.png',fullPage:true});
  await dialog.getByRole('button',{name:'保存并保持暂停',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  await row.getByText('2 小时 3 分钟 4 秒',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.saves.at(-1).interval_seconds),7384);
  assert.equal(await page.evaluate(()=>window.plans.find(p=>p.id===window.saves.at(-1).id).enabled),false);
  await row.getByRole('button',{name:'编辑',exact:true}).click();
  for(let i=0;i<3;i++)assert.equal(await fields[i].inputValue(),['2','3','4'][i]);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  await page.setViewportSize({width:1440,height:1000});
 }
 await page.getByRole('button',{name:'新增自动化任务',exact:true}).click();
 const create=page.getByRole('dialog',{name:'新增自动化任务',exact:true});
 await create.getByRole('combobox',{name:'任务类型',exact:true}).click();
 await page.getByRole('option',{name:'搞笑图文（自动发布）',exact:true}).click();
 assert.equal(await create.getByLabel('执行间隔小时',{exact:true}).inputValue(),'1');
 await create.getByText('每轮生成图片',{exact:true}).waitFor();
 await create.getByLabel('执行间隔小时',{exact:true}).fill('');await create.getByLabel('执行间隔分钟',{exact:true}).fill('');await create.getByLabel('执行间隔秒',{exact:true}).fill('15');
 await create.getByRole('button',{name:'创建并保持暂停',exact:true}).click();await create.waitFor({state:'hidden'});
 assert.deepEqual(await page.evaluate(()=>{const plan=window.plans.find(p=>p.config.action==='auto_image');return {enabled:plan.enabled,language:plan.config.language,seconds:plan.config.interval_seconds,limit:plan.config.limit};}),{enabled:false,language:'en',seconds:15,limit:1});
 await page.getByRole('button',{name:'新增自动化任务',exact:true}).click();
 await create.getByRole('combobox',{name:'任务类型',exact:true}).click();
 await page.getByRole('option',{name:'吃瓜热点（微博 / 贴吧）',exact:true}).click();
 await create.getByLabel('选题要求',{exact:true}).waitFor();
 assert.equal(await create.getByRole('checkbox',{name:'联网核实公开原帖',exact:true}).isChecked(),true);
 assert.equal(await create.getByRole('checkbox',{name:'正文附来源链接',exact:true}).isChecked(),true);
 await create.getByRole('button',{name:'创建并保持暂停',exact:true}).click();await create.waitFor({state:'hidden'});
 assert.deepEqual(await page.evaluate(()=>{const p=window.saves.at(-1);return {action:p.action,source:p.news_source,search:p.allow_news_search,link:p.include_source_link,language:p.language,limit:p.limit};}),{action:'auto_post',source:'gossip',search:true,link:true,language:'en',limit:1});
 await table.getByRole('row').filter({hasText:'吃瓜热点（微博 / 贴吧）'}).getByText('微博＋贴吧',{exact:true}).waitFor();
 await page.getByRole('button',{name:'新增自动化任务',exact:true}).click();
 await create.getByRole('combobox',{name:'任务类型',exact:true}).click();
 await page.getByRole('option',{name:'孙笑川吧梗图（自动发布）',exact:true}).click();
 assert.equal(await create.getByLabel('执行间隔分钟',{exact:true}).inputValue(),'2');
 assert.equal(await create.getByLabel('执行间隔小时',{exact:true}).inputValue(),'0');
 await create.getByRole('button',{name:'创建并保持暂停',exact:true}).click();await create.waitFor({state:'hidden'});
 assert.deepEqual(await page.evaluate(()=>{const p=window.saves.at(-1);return {action:p.action,seconds:p.interval_seconds,limit:p.limit,language:p.language};}),{action:'auto_meme',seconds:120,limit:1,language:'en'});
 assert.deepEqual(errors,[]);
 console.log('Passed: custom intervals and mobile layout; Weibo/Tieba hotspot creation, English language, source/search settings and paused save.');
} finally {
 if(browser)await browser.close();
 if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
}

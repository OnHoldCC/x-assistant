import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {extensionVersion} from '../app/src/shared/extension-version.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21446';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21446','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:'ignore'});let browser;
try{
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({headless:true,channel:'chromium'});
 const page=await browser.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({extensionVersion})=>{
  const mode=sessionStorage.getItem('upgrade-fixture')||'restart';window.messages=[];let reloading=false,attempts=0;
  window.chrome={runtime:{sendMessage:async(_id,message)=>{
   window.messages.push(message);
   if(message.type==='ONHOLD_DISCOVER'){
    if(reloading&&attempts++===0)throw Error('Service worker restarting');
    return {ok:true,protocol:1,version:mode==='current'||reloading?extensionVersion:'1.5.15',reload:mode!=='legacy'};
   }
   if(message.type==='ONHOLD_RELOAD'){
    if(mode==='busy')return {ok:false,error:'当前账号有执行中的任务，请等待结束后升级'};
    reloading=true;return {ok:true,data:{reloading:true}};
   }
   assertUnexpected(message.type);
   function assertUnexpected(type){if(type!=='ONHOLD_PAIR')throw Error('Unexpected '+type);}
   return {ok:true,version:extensionVersion,data:{account:'fixture'}};
  }}};
 },{extensionVersion});
 await page.route('**/api/admin',route=>{const {operation}=route.request().postDataJSON();return route.fulfill({json:operation==='pairing'?{token:'fixture-token'}:[]});});
 const visit=async mode=>{await page.goto(base);await page.evaluate(mode=>sessionStorage.setItem('upgrade-fixture',mode),mode);await page.goto(base+'/#/connect?upgrade=1');await page.reload();};
 await visit('restart');await page.getByRole('status').filter({hasText:`助手 ${extensionVersion} 已加载并重新连接`}).waitFor();
 let messages=await page.evaluate(()=>window.messages);assert.equal(messages.filter(m=>m.type==='ONHOLD_RELOAD').length,1);assert.equal(messages.at(-1).type,'ONHOLD_PAIR');assert.equal(messages.find(m=>m.type==='ONHOLD_RELOAD').data.token,'fixture-token');
 await visit('busy');await page.getByRole('status').filter({hasText:'执行中的任务'}).waitFor();messages=await page.evaluate(()=>window.messages);assert.equal(messages.filter(m=>m.type==='ONHOLD_PAIR').length,0,'active work prevents reload/reconnect');
 await visit('legacy');await page.getByRole('status').filter({hasText:'不支持自动重载'}).waitFor();messages=await page.evaluate(()=>window.messages);assert.equal(messages.filter(m=>m.type==='ONHOLD_RELOAD').length,0,'old clients receive a clear one-time manual fallback');
 await visit('current');await page.getByRole('status').filter({hasText:`助手 ${extensionVersion} 已加载并重新连接`}).waitFor();messages=await page.evaluate(()=>window.messages);assert.equal(messages.filter(m=>m.type==='ONHOLD_RELOAD').length,0,'matching versions reconnect without unnecessary reloads');
 assert.deepEqual(errors,[]);console.log('Passed: authenticated upgrade page, transient worker restart, loaded-version verification, busy refusal, old-client fallback and idempotent reconnect. Fixture only.');
}catch(error){if(browser){const pages=browser.contexts().flatMap(context=>context.pages());for(const page of pages)console.error(await page.locator('body').innerText(),await page.evaluate(()=>window.messages));}throw error;}finally{if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

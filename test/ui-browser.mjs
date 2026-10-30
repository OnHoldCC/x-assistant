import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const port=process.env.ONHOLD_UI_TEST_PORT||'21432',base=`http://127.0.0.1:${port}/ui.html`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',port,'--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:['ignore','pipe','pipe']});
let browser;
try{
 for(let i=0;;i++){if(server.exitCode!==null)throw Error('preview exited');try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview unavailable');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,channel:'chromium'});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.getByRole('button',{name:'主要操作',exact:true}).waitFor();assert.equal(await page.locator('.n-button--primary-type').count()>0,true);assert.equal(await page.getByRole('button',{name:'禁用',exact:true}).isDisabled(),true);
 await page.getByLabel('搜索',{exact:true}).fill('保留输入');assert.equal(await page.getByLabel('搜索',{exact:true}).inputValue(),'保留输入');await page.getByRole('checkbox',{name:'保留选择'}).check();
 await page.getByRole('button',{name:'打开抽屉',exact:true}).click();await page.getByRole('dialog',{name:'原生抽屉',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByText('框架来源',{exact:true}).click();await page.getByRole('link',{name:'查看源仓库',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'查看源仓库'}).getAttribute('href'),'https://github.com/soybeanjs/soybean-admin');
 for(const width of [375,390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log('Passed: native Naive UI component preview, controls, drawer, source link and responsive layout.');
}finally{if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

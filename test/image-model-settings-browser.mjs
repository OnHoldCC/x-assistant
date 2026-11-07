import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21447';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21447','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:'ignore'});
let browser;
try {
 for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(server.exitCode!==null||i>100)throw Error('preview unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[],saves=[];
 let imageConfig={provider:'codex_cli',endpoint:'https://api.openai.com/v1',model:'gpt-image-2',key_saved:false};
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('onhold-setup-complete','1'));
 await page.route('**/api/admin',async route=>{
  const {operation,input}=route.request().postDataJSON();let result={};
  if(operation==='dashboard')result={accounts:[{handle:'example'}],account:'example',posts:[],metrics:{},series:[],days:7,analytics:null};
  if(['jobs','connections'].includes(operation))result=[];
  if(operation==='automation')result={account:'example',tasks:[],block:null};
  if(operation==='model_config')result={provider:'codex_cli',model:'',endpoint:'https://api.openai.com/v1',api_style:'responses',key_saved:false,cli_path:''};
  if(operation==='image_model_config')result=imageConfig;
  if(operation==='save_image_model_config'){saves.push(input);imageConfig={...input.config,key_saved:true};result=imageConfig;}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto(base+'/#/automation?settings=1');
 await page.getByText('AI 生图',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('生图 API Key',{exact:true}).count(),0);
 await page.getByRole('button',{name:'保存生图设置',exact:true}).click();
 await page.getByText('生图设置已保存；实际可用性将在首次生图时验证',{exact:true}).waitFor();
 assert.equal(saves[0].config.provider,'codex_cli');assert.equal(saves[0].apiKey,null);
 await page.getByRole('combobox',{name:'生图调用方式',exact:true}).click();
 await page.getByRole('option',{name:'OpenAI 兼容图片 API',exact:true}).click();
 const key=page.getByLabel('生图 API Key',{exact:true});
 assert.equal(await page.getByLabel('生图模型',{exact:true}).inputValue(),'gpt-image-2');
 assert.equal(saves.length,1,'selecting a provider does not save credentials');
 await key.fill('fixture-image-secret');await page.getByRole('button',{name:'保存生图设置',exact:true}).click();
 await page.getByText('生图设置已保存；实际可用性将在首次生图时验证',{exact:true}).waitFor();
 assert.equal(saves[1].apiKey,'fixture-image-secret');assert.equal(await key.inputValue(),'');
 await page.getByRole('button',{name:'保存生图设置',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('button.n-button--loading'));
 assert.equal(saves.at(-1).apiKey,null,'empty key preserves the stored credential');
 await page.setViewportSize({width:375,height:1000});await key.scrollIntoViewIfNeeded();
 const box=await key.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=375);
 await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
 await page.screenshot({path:'/tmp/onhold-ai-image-settings-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Passed: AI image API settings save independently, clear the secret field, preserve an existing key and fit mobile. No live model calls.');
} finally {
 if(browser)await browser.close();
 if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
}

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {extensionVersion} from '../app/src/shared/extension-version.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:21445';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','21445','--strictPort'],{cwd:new URL('../app/',import.meta.url),stdio:'ignore'});
let browser;
try {
  for(let i=0;;i++){try{if((await fetch(base)).ok)break;}catch{}if(i>100)throw Error('preview unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({headless:true,channel:'chromium'});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),calls=[],errors=[];
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  let connected=false,finished=false,loadedVersion=extensionVersion;
  let failPair=true;
  await page.exposeFunction('pairFixture',async()=>{if(failPair)throw Error('连接失败样本');connected=true;return {ok:true,data:{account:'fixture'}};});
  await page.addInitScript(({extensionVersion})=>{window.open=()=>{throw Error('连接不应打开新窗口');};window.browserPrefs={hideAds:true,translationEnabled:false};window.failPrefs=false;window.preferenceCalls=[];window.chrome={runtime:{sendMessage:async(_id,message)=>{
    if(message.type==='ONHOLD_DISCOVER')return {ok:true,protocol:1,version:extensionVersion,browserSettings:true};
    if(message.type==='ONHOLD_BROWSER_SETTINGS'){
      window.preferenceCalls.push(message);
      if(window.failPrefs)return {ok:false,error:'设置保存失败样本'};
      if(typeof message.data.hideAds==='boolean')window.browserPrefs.hideAds=message.data.hideAds;
      return {ok:true,data:{...window.browserPrefs}};
    }
    return await new Promise((resolve,reject)=>{window.releasePair=()=>window.pairFixture().then(resolve,reject);});
  }}};},{extensionVersion});
  await page.route('**/api/admin',async route=>{
    const {operation,input}=route.request().postDataJSON();calls.push({operation,input});
    const values={
      pairing:{endpoint:base,token:'fixture'},
      dashboard:{accounts:connected?[{handle:'fixture'}]:[],account:connected?'fixture':null,posts:finished?[{id:'123',author:'fixture',text:'真实采集样本',metrics:{},created_at:null}]:[],metrics:{},series:[],days:7,analytics:null},
      connections:connected?[{id:'browser',account:'fixture',online:true,transport:'websocket',login_state:'logged_in',extension_version:loadedVersion}]:[],
      jobs:finished?[{id:'capture-fixture',account:'fixture',action:'capture',state:'completed',error:null}]:[],
      enqueue:{id:'capture-fixture'},
      model_config:{provider:'codex_cli',cli_path:'',model:'',endpoint:'https://api.openai.com/v1',api_style:'responses',key_saved:false},
      local_models:{translation:{enabled:false,ready:false},scoring:{enabled:false,ready:false}},
    };
    if(operation==='enqueue')finished=true;
    await route.fulfill({contentType:'application/json',body:JSON.stringify(values[operation]??[])});
  });
  await page.goto(base);
  await page.getByText('安装 X 助手',{exact:true}).waitFor();
  assert.equal(await page.locator('.n-step').count(),2,'onboarding has only install and connect');
  await page.getByRole('button',{name:'查看插件安装步骤',exact:true}).click();
  await page.getByRole('status').filter({hasText:'chrome://extensions'}).waitFor();
  await page.getByRole('button',{name:'已安装，下一步',exact:true}).click();
  await page.getByRole('button',{name:'连接 X 助手插件',exact:true}).click();
  await page.getByRole('status').filter({hasText:'等待浏览器连接'}).waitFor();
  await page.waitForFunction(()=>typeof window.releasePair==='function');
  assert.equal(page.context().pages().length,1,'connection waits in the same tab');
  assert.equal(await page.getByRole('button',{name:'连接 X 助手插件',exact:true}).isDisabled(),true);
  await page.evaluate(()=>window.releasePair());await page.getByRole('status').filter({hasText:'连接失败样本'}).waitFor();
  failPair=false;await page.evaluate(()=>window.releasePair=null);await page.getByRole('button',{name:'连接 X 助手插件',exact:true}).click();
  await page.waitForFunction(()=>typeof window.releasePair==='function');await page.evaluate(()=>window.releasePair());
  await page.getByRole('region',{name:'账号与帖子观测',exact:true}).waitFor();
  await page.waitForFunction(()=>localStorage.getItem('onhold-setup-complete')==='1');
  assert.equal(calls.filter(item=>item.operation==='enqueue').length,1,'connecting starts the first collection automatically');
  assert.equal(calls.find(item=>item.operation==='enqueue').input.account,'fixture');
  assert.equal(await page.getByRole('button',{name:'采集首批数据',exact:true}).count(),0);
  await page.screenshot({path:'app/screenshots/docker-onboarding.png',fullPage:true});
  await page.goto(base+'/#settings');
  const settings=page.getByRole('dialog',{name:'账号与模型',exact:true});await settings.waitFor();
  await settings.getByText('可选本地模型',{exact:true}).waitFor();
  assert.equal(await settings.getByText('远程工作空间',{exact:true}).count(),0);assert.equal(await settings.getByText('连接工作空间',{exact:true}).count(),0,'the browser uses its current backend without a second workspace form');
  assert.equal(await settings.getByText('未启用',{exact:true}).count(),1);
  assert.equal(await settings.getByRole('button',{name:'复制安装指令',exact:true}).count(),1);
  assert.equal(calls.filter(item=>['translation','scoring','download_model'].includes(item.operation)).length,0);
  const ads=settings.getByRole('switch',{name:'隐藏 X 广告帖',exact:true});await ads.waitFor();await page.waitForFunction(()=>document.querySelector('[role="switch"][aria-label="隐藏 X 广告帖"]')?.getAttribute('aria-disabled')!=='true');
  assert.equal(await ads.getAttribute('aria-checked'),'true');
  await ads.click();await settings.getByRole('status').filter({hasText:'已保存，当前浏览器的 X 页面立即生效。'}).waitFor();assert.equal(await ads.getAttribute('aria-checked'),'false');
  const saved=(await page.evaluate(()=>window.preferenceCalls)).find(call=>call.data.hideAds===false);assert.equal(saved.data.endpoint,base);assert.equal(saved.data.token,'fixture');
  await page.evaluate(()=>window.failPrefs=true);await ads.click();await settings.getByText('设置保存失败样本',{exact:true}).waitFor();assert.equal(await ads.getAttribute('aria-checked'),'false','failed saves preserve the actual switch value');
  await page.screenshot({path:'app/screenshots/backend-browser-settings.png',fullPage:true});
  await page.setViewportSize({width:375,height:812});
  await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  loadedVersion='1.0.0';
  await page.goto(base+'/#overview');
  const upgrade=page.getByRole('dialog',{name:'更新 X 助手',exact:true});await upgrade.waitFor({timeout:15000});
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
  await upgrade.getByRole('button',{name:'复制扩展管理地址',exact:true}).click();
  await page.getByText('重载现有助手',{exact:true}).waitFor();
  loadedVersion=extensionVersion;
  await page.getByText('助手已更新',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Passed: web bootstrap without Tauri, extension guidance, connection, ID-only enqueue response, first capture validation and entry into dashboard.');
} finally {if(browser)await browser.close();if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}}

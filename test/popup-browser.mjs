import assert from 'node:assert/strict';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const port=process.env.ONHOLD_POPUP_TEST_PORT||'21440',base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,[path.resolve('app/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',port,'--strictPort'],{cwd:path.resolve('app'),stdio:['ignore','pipe','pipe']});
server.stderr.on('data',data=>process.stderr.write(data));
let browser;
try {
  for(let i=0;;i++) {
    if(server.exitCode!==null)throw Error('Preview exited');
    try{if((await fetch(base)).ok)break;}catch{}
    if(i>100)throw Error('Preview did not start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch({headless:true,channel:'chromium'});
  const page=await browser.newPage({viewport:{width:380,height:600}}),errors=[];
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    window.popupCalls=[];
    window.popupStatus={configured:true,endpoint:'http://127.0.0.1:18431',cdpAccount:'example',cdpWs:'connected',cdpLoginState:'logged_in'};
    window.chrome={runtime:{getURL:path=>'https://extension.invalid/'+path,sendMessage:async message=>{
      window.popupCalls.push(message);
      return {ok:true,data:message.type==='CDP_STATUS'?window.popupStatus:{account:'example',postCount:0,lastCapture:null,metrics:{followers:{value:0}},job:null,creator:{account:'example',snapshot:null,assumptions:null}}};
    }},tabs:{create:async input=>window.popupCalls.push(input)},permissions:{request:async()=>true}};
  });
  await page.goto(base+'/bridge.html');await page.getByText('采集就绪',{exact:true}).waitFor();
  assert.equal(await page.locator('.creator-panel,.bridge-creator .creator-progress-track').count(),0,'unknown qualification has no empty tracks or earnings panels');
  assert.match(await page.getByLabel('已采集数据',{exact:true}).innerText(),/粉丝\s*0[\s\S]*浏览量/);
  assert.equal(await page.getByLabel('已采集数据',{exact:true}).getByRole('img',{name:'数值未采集',exact:true}).count(),5,'missing metrics use skeletons while known zeros remain numbers');
  for(const width of [320,380,420]) {
    await page.setViewportSize({width,height:600});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'popup fits '+width);
    const aligned=await page.locator('.bridge-shell > header').evaluate(header=>{
      const box=header.getBoundingClientRect();
      return [...header.children].every(child=>{const rect=child.getBoundingClientRect();return rect.top>=box.top&&rect.bottom<=box.bottom;})&&box.height<=60;
    });
    assert.ok(aligned,'popup toolbar stays in one row at '+width);
  }
  await page.setViewportSize({width:380,height:600});
  await page.locator('main.bridge-shell').screenshot({path:'app/screenshots/popup-refined-connected.png',animations:'disabled'});
  await page.getByRole('button',{name:'查看创作者进度',exact:true}).click();
  await page.getByRole('dialog',{name:'创作者中心',exact:true}).waitFor();
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'立即采集',exact:true}).click();
  assert.ok(await page.evaluate(()=>window.popupCalls.some(call=>call.type==='CDP_COLLECT')));
  await page.evaluate(()=>window.popupStatus={configured:true,endpoint:'http://127.0.0.1:18431',cdpWs:'disconnected'});
  await page.getByRole('button',{name:'连接 X 助手插件',exact:true}).waitFor({timeout:8000});
  assert.equal(await page.getByLabel('已采集数据',{exact:true}).count(),0,'disconnect clears account data');
  assert.equal(await page.getByLabel('创作者资格',{exact:true}).count(),0,'offline popup focuses on connecting the workspace');
  await page.locator('main.bridge-shell').screenshot({path:'app/screenshots/popup-refined-offline.png',animations:'disabled'});
  await page.evaluate(()=>document.documentElement.classList.add('extension-popup'));
  await page.setViewportSize({width:160,height:600});
  assert.equal(await page.locator('html').evaluate(node=>node.getBoundingClientRect().width),380,'the extension declares its own popup width before Chrome sizes its viewport');
  assert.ok(await page.locator('header').evaluate(node=>node.getBoundingClientRect().height<=60),'popup controls stay on one row during intrinsic sizing');
  assert.ok(await page.locator('body').evaluate(node=>node.getBoundingClientRect().height<600),'offline popup height follows its content');
  await page.setViewportSize({width:380,height:600});
  await page.locator('main.bridge-shell').screenshot({path:'app/screenshots/popup-native-offline.png',animations:'disabled'});
  await page.evaluate(()=>document.documentElement.classList.remove('extension-popup'));
  await page.getByLabel('插件设置',{exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'手动配对',exact:true}).count(),0);
  assert.equal(await page.getByText('翻译与广告设置',{exact:true}).count(),0);
  await page.getByRole('button',{name:'后台设置',exact:true}).click();
  assert.ok(await page.evaluate(()=>window.popupCalls.some(call=>call.url==='http://127.0.0.1:18431/#/settings')));
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'连接 X 助手插件',exact:true}).click();
  assert.ok(await page.evaluate(()=>window.popupCalls.some(call=>call.type==='CDP_CONNECT'&&call.data.pickX===true)));
  await page.evaluate(()=>window.popupStatus={configured:false,cdpWs:'disconnected'});
  await page.getByRole('button',{name:'打开后台并自动连接',exact:true}).waitFor({timeout:8000});
  await page.getByRole('button',{name:'打开后台并自动连接',exact:true}).click();
  assert.ok(await page.evaluate(()=>window.popupCalls.some(call=>call.url==='http://127.0.0.1:18431/#/connect')));
  assert.equal(await page.getByRole('textbox').count(),0,'popup no longer exposes endpoint or token forms');
  assert.deepEqual(errors,[]);
  console.log('Passed: popup layout at 320/380/420px, unknown/zero metrics, creator drawer, collection, offline data clearing, central settings navigation, saved reconnect and automatic initial pairing entry.');
} finally {
  if(browser)await browser.close();
  if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;}
}

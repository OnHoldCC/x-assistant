import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createCdpBridge} from '../extension/cdp-bridge.js';
import {DEFAULTS,validateSettings,translationAllowed,translationHosts} from '../extension/core.js';
import {LANGUAGES} from '../extension/languages.mjs';

test('plugin reload requires the paired origin/token, waits for idle and replies before restarting',async()=>{
 let external,busy=false,prepared=0,reloaded=0;const timers=[];
 const origin='http://127.0.0.1:18431',token='a'.repeat(64),storage={cdpConfig:{endpoint:origin,token}};
 const context=vm.createContext({DEFAULTS,validateSettings,translationAllowed,translationHosts,LANGUAGES,URL,console,
  setTimeout:callback=>timers.push(callback),
  createCdpBridge:()=>({resume:async()=>{},prepareReload:async()=>{if(busy)throw Error('任务执行中');prepared++;}}),
  chrome:{runtime:{id:'fixture',getManifest:()=>({version:'1.5.16',action:{default_icon:{}}}),reload:()=>reloaded++,onMessageExternal:{addListener:fn=>external=fn},onInstalled:{addListener(){}},onMessage:{addListener(){}},onConnect:{addListener(){}}},action:{setIcon:async()=>{}},
   storage:{local:{setAccessLevel:async()=>{},get:async()=>storage,set:async()=>{},remove:async()=>{}}},scripting:{getRegisteredContentScripts:async()=>[]},permissions:{onRemoved:{addListener(){}}},alarms:{clear(){}}},
 });
 vm.runInContext(fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
 const send=(data={},url=origin+'/')=>new Promise(resolve=>{if(!external({type:'ONHOLD_RELOAD',data:{endpoint:origin,token,...data}},{url},resolve))resolve(null);});
 assert.equal(await send({},'https://x.com/home'),null);
 assert.equal(await send({endpoint:'http://localhost:18431'}),null);
 assert.equal((await send({token:'wrong'})).ok,false);assert.equal(prepared,0);assert.equal(timers.length,0);
 busy=true;assert.equal((await send()).ok,false);assert.equal(timers.length,0);
 busy=false;const result=await send();assert.equal(result.ok,true);assert.equal(result.data.reloading,true);assert.equal(result.version,'1.5.16');assert.equal(prepared,1);assert.equal(reloaded,0);
 assert.equal(timers.length,1);timers[0]();assert.equal(reloaded,1);
 assert.equal(storage.cdpConfig.token,token,'reload preserves the existing pairing');
});

test('reload readiness rejects active work and reserves the idle worker until restart',async()=>{
 const previousChrome=globalThis.chrome,previousFetch=globalThis.fetch;
 let jobs=[{account:'owner',state:'rewriting'}];
 globalThis.chrome={storage:{local:{get:async()=>({cdpConfig:{endpoint:'http://127.0.0.1:18431',token:'a'.repeat(64)}})},session:{get:async()=>({cdpAccount:'owner'})}},alarms:{onAlarm:{addListener(){}}},debugger:{onDetach:{addListener(){}}}};
 globalThis.fetch=async(_url,request)=>{assert.equal(JSON.parse(request.body).operation,'jobs');return Response.json(jobs);};
 try{
  const bridge=createCdpBridge();await assert.rejects(bridge.prepareReload(),/执行中/);assert.equal((await bridge.status()).busy,false);
  jobs=[];await bridge.prepareReload();assert.equal((await bridge.status()).busy,true);await assert.rejects(bridge.prepareReload(),/执行任务/);
 }finally{globalThis.chrome=previousChrome;globalThis.fetch=previousFetch;}
});

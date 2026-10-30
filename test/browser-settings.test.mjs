import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DEFAULTS,validateSettings,translationAllowed,translationHosts} from '../extension/core.js';
import {LANGUAGES} from '../extension/languages.mjs';

test('backend browser preferences require the paired local origin and token, and only update ads',async()=>{
 let external;
 const origin='http://127.0.0.1:18431',token='a'.repeat(64),notifications=[],bridgeCalls=[];
 const storage={config:{...DEFAULTS,readingTarget:'ja',autoTranslate:true},cdpConfig:{endpoint:origin,token}};
 const context=vm.createContext({DEFAULTS,validateSettings,translationAllowed,translationHosts,LANGUAGES,URL,console,
  createCdpBridge:()=>({resume:async()=>{},save:async data=>bridgeCalls.push({save:data}),connect:async data=>{bridgeCalls.push({connect:data});return {account:'example'};}}),
  fetch:()=>{throw Error('preferences must not contact a translation model');},
  chrome:{
   runtime:{id:'fixture',getURL:()=> 'chrome-extension://fixture/',getManifest:()=>({version:'1.5.13',action:{default_icon:{}}}),onMessageExternal:{addListener(fn){external=fn;}},onInstalled:{addListener(){}},onMessage:{addListener(){}},onConnect:{addListener(){}}},
   action:{setIcon:async()=>{}},storage:{local:{setAccessLevel:async()=>{},get:async()=>storage,set:async value=>Object.assign(storage,value),remove:async()=>{}}},
   scripting:{getRegisteredContentScripts:async()=>[]},permissions:{contains:async()=>true,onRemoved:{addListener(){}}},alarms:{clear(){}},
   tabs:{query:async()=>[{id:1,url:'https://x.com/home'}],sendMessage:async(id,data)=>notifications.push({id,data})},
  },
 });
 vm.runInContext(fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
 const send=(data={},url=origin+'/#/settings',type='ONHOLD_BROWSER_SETTINGS')=>new Promise(resolve=>{
  if(!external({type,data:{endpoint:origin,token,...data}},{url},resolve))resolve(null);
 });
 assert.equal(await send({},'https://x.com/home'),null);
 assert.equal(await send({},'http://127.0.0.1:18432/'),null);
 assert.equal((await send({token:'wrong'})).ok,false);
 assert.equal((await send({endpoint:'http://localhost:18431'})),null);
 const discovery=await send({},origin+'/','ONHOLD_DISCOVER');assert.equal(discovery.browserSettings,true);
 const current=await send();assert.equal(current.data.hideAds,true);assert.equal(current.data.translationEnabled,false);
 assert.equal((await send({hideAds:'false'})).ok,false);
 const changed=await send({hideAds:false,autoTranslate:true});assert.equal(changed.ok,true);assert.equal(changed.data.hideAds,false);
 assert.equal(storage.config.hideAds,false);assert.equal(storage.config.readingTarget,'ja');
 for(const key of ['autoTranslate','composeTranslate','allWebsites'])assert.equal(storage.config[key],false);
 assert.equal(notifications.length,1);assert.equal(notifications[0].data.config.hideAds,false,'open X tabs receive the saved preference');
 assert.deepEqual(bridgeCalls,[],'reading or saving settings never rebinds the current account');
 const paired=await send({},origin+'/#/connect','ONHOLD_PAIR');assert.equal(paired.ok,true);assert.equal(paired.data.account,'example');assert.equal(bridgeCalls.length,2,'automatic connection still saves the backend-supplied configuration then binds X');
});

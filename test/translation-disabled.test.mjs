import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DEFAULTS, validateSettings, translationAllowed, translationHosts} from '../extension/core.js';
import {LANGUAGES} from '../extension/languages.mjs';

test('legacy translation settings cannot reactivate automatic, manual, streamed or draft translation', async () => {
 const old={...DEFAULTS,autoTranslate:true,composeTranslate:true,allWebsites:true};
 const saved=validateSettings(old);
 for(const key of ['autoTranslate','composeTranslate','allWebsites'])assert.equal(saved[key],false);
 let messageHandler,connectHandler,streamHandler;const registered=[],requests=[];
 const context=vm.createContext({DEFAULTS,validateSettings,translationAllowed,translationHosts,LANGUAGES,URL,console,
  createCdpBridge:()=>({resume:async()=>{}}),
  fetch:async(...args)=>{requests.push(args);throw Error('unexpected local model request');},
  chrome:{
   runtime:{id:'fixture',getURL:()=> 'chrome-extension://fixture/',getManifest:()=>({action:{default_icon:{}}}),onMessageExternal:{addListener(){}},onInstalled:{addListener(){}},onMessage:{addListener(fn){messageHandler=fn;}},onConnect:{addListener(fn){connectHandler=fn;}}},
   action:{setIcon:async()=>{}},storage:{local:{setAccessLevel:async()=>{},get:async()=>({config:old}),set:async()=>{},remove:async()=>{}}},
   scripting:{getRegisteredContentScripts:async()=>[{id:'local-page-translation'}],unregisterContentScripts:async value=>registered.push(value)},
   permissions:{contains:async()=>true,onRemoved:{addListener(){}}},alarms:{clear(){}},
  },
 });
 vm.runInContext(fs.readFileSync(new URL('../extension/background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
 const own={id:'fixture',url:'chrome-extension://fixture/settings.html'};
 const x={id:'fixture',url:'https://x.com/home',tab:{id:1,url:'https://x.com/home'}};
 const send=(message,sender=own)=>new Promise(resolve=>messageHandler(message,sender,resolve));
 const settings=await send({type:'GET_SETTINGS'});
 for(const key of ['autoTranslate','composeTranslate','allWebsites'])assert.equal(settings.data.config[key],false);
 const publicConfig=await send({type:'GET_PUBLIC_CONFIG'},x);
 assert.equal(publicConfig.data.translatePageAllowed,false);
 for(const message of [{type:'TRANSLATE',text:'hello',automatic:false},{type:'TRANSLATE',text:'hello',automatic:true},{type:'TRANSLATE_DRAFT',text:'hello'},{type:'ANALYZE_POST',text:'hello',toChinese:true,manual:true}]){
  const result=await send(message);assert.equal(result.ok,false);assert.match(result.error,/翻译已停用|翻译已关闭/);
 }
 const streamed=new Promise(resolve=>connectHandler({name:'local-translation-stream',sender:own,onDisconnect:{addListener(){}},onMessage:{addListener(fn){streamHandler=fn;}},postMessage:resolve}));
 await streamHandler({type:'TRANSLATE',text:'hello'});
 assert.match((await streamed).error,/翻译已停用/);
 assert.equal(registered.length,1,'old website injection is unregistered');
 assert.deepEqual(requests,[],'translation cannot reach or start a local model');
});

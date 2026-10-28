import test from 'node:test';
import assert from 'node:assert/strict';
import {bridgeConfig,createCdpBridge} from '../extension/cdp-bridge.js';
test('CDP pairing accepts only explicit local backends and valid connection keys',()=>{
 const token='a'.repeat(64);assert.deepEqual(bridgeConfig({endpoint:'http://127.0.0.1:18431',token}),{endpoint:'http://127.0.0.1:18431',token});
 for(const endpoint of ['https://evil.example','http://127.0.0.1.evil.example','http://user:pass@127.0.0.1:18431','http://127.0.0.1:18431/path','file:///tmp/data','http://127.0.0.1:18431/#x'])assert.throws(()=>bridgeConfig({endpoint,token}));
 assert.throws(()=>bridgeConfig({endpoint:'http://127.0.0.1:18431',token:'short'}));
});
test('CDP reports a stopped backend, wrong service and invalid key before attaching to X',async t=>{
 const previous=globalThis.chrome;let attached=0;
 globalThis.chrome={storage:{local:{get:async()=>({cdpConfig:{endpoint:'http://127.0.0.1:18431',token:'a'.repeat(64)}})}},alarms:{onAlarm:{addListener(){}}},debugger:{onDetach:{addListener(){}},attach(){attached++;}}};
 t.after(()=>{if(previous===undefined)delete globalThis.chrome;else globalThis.chrome=previous;});
 const bridge=createCdpBridge();
 const fetch=t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Failed to fetch');});
 await assert.rejects(bridge.connect(),/请先打开 OnHold 运营后台/);
 fetch.mock.mockImplementation(async()=>Response.json({service:'x-local-ops'}));
 await assert.rejects(bridge.connect(),/不是 OnHold 运营后台/);
 fetch.mock.mockImplementation(async url=>url.endsWith('/health')?Response.json({service:'onhold-admin'}):Response.json({error:'连接密钥无效，请在插件中重新配对'},{status:401}));
 await assert.rejects(bridge.connect(),/连接密钥无效/);
 assert.equal(attached,0);
});
test('popup overview scopes account data and never exposes the pairing key or post content',async t=>{
 const previous=globalThis.chrome, requests=[],cache={};let account='example',offline=false;
 globalThis.chrome={storage:{local:{get:async()=>({cdpConfig:{endpoint:'http://127.0.0.1:18431',token:'a'.repeat(64)},...cache}),set:async value=>Object.assign(cache,value)},session:{get:async()=>({cdpAccount:account})}},alarms:{onAlarm:{addListener(){}}},debugger:{onDetach:{addListener(){}}}};
 t.after(()=>{if(previous===undefined)delete globalThis.chrome;else globalThis.chrome=previous;});
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
   if(offline)throw Error('offline');const request=JSON.parse(options.body);requests.push(request);if(request.operation==='creator')return Response.json({account:'example',snapshot:null,assumptions:null});
   return Response.json(request.operation==='dashboard'?{account:'example',accounts:[{handle:'other',last_seen:9},{handle:'example',last_seen:42}],posts:[{text:'private post'}],metrics:{followers:{value:0},following:{value:3},views:{value:null},likes:{value:0},replies:{value:2},reposts:{value:4}}}:[{account:'other',state:'failed',error:'other error'},{account:'example',state:'completed',error:null,updated_at:43}]);
 });
 const bridge=createCdpBridge(),summary=await bridge.overview();
 assert.equal(summary.account,'example');assert.equal(summary.postCount,1);assert.equal(summary.lastCapture,42);assert.equal(summary.metrics.followers.value,0);assert.equal(summary.metrics.following.value,3);assert.equal(summary.metrics.likes.value,0);assert.equal(summary.metrics.reposts.value,4);assert.equal(summary.metrics.views.value,null);assert.equal(summary.job.state,'completed');
 assert.deepEqual(requests[0],{operation:'dashboard',input:{account:'example',days:7}});
 assert.ok(!JSON.stringify(summary).includes('private post'));assert.ok(!JSON.stringify(summary).includes('a'.repeat(64)));
 offline=true;assert.equal((await bridge.overview()).stale,true);account='missing';await assert.rejects(bridge.overview(),/打开 OnHold 桌面端/);offline=false;
 account=undefined;const before=requests.length;assert.equal(await bridge.overview(),null);assert.equal(requests.length,before);
});
test('a delayed detach event cannot clear a replacement connection to the same X tab',async t=>{
 const previous=globalThis.chrome;let detach,attached=true;const state={cdpTab:7,cdpAccount:'example',cdpWs:'connected'};
 globalThis.chrome={storage:{session:{get:async()=>({...state}),remove:async keys=>{for(const key of keys)delete state[key];},set:async value=>Object.assign(state,value)}},alarms:{onAlarm:{addListener(){}}},debugger:{onDetach:{addListener(handler){detach=handler;}},sendCommand:async(_target,method,input)=>{assert.equal(method,'Runtime.evaluate');assert.equal(input.expression,'0');if(!attached)throw Error('not attached');return {result:{value:0}};}}};
 t.after(()=>{if(previous===undefined)delete globalThis.chrome;else globalThis.chrome=previous;});
 createCdpBridge();await detach({tabId:7});assert.equal(state.cdpAccount,'example');assert.equal(state.cdpWs,'connected');
 attached=false;await detach({tabId:7});assert.equal(state.cdpAccount,undefined);assert.equal(state.cdpWs,'disconnected');
});

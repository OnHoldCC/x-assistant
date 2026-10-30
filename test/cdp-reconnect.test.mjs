import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../extension/cdp-bridge.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function','function')+'\nglobalThis.makeBridge=createCdpBridge;';
const flush=async()=>{for(let i=0;i<120;i++)await Promise.resolve();};
function fixture({local,session,attached=true}={}) {
 const state={local:local||{cdpConfig:{endpoint:'http://127.0.0.1:18431',token:'a'.repeat(64)},cdpClient:'fixture-client',cdpAutoConnect:true,cdpBinding:{account:'owner',tabId:7}},session:session||{cdpTab:7,cdpAccount:'owner'},online:true,validKey:true,owner:'owner',tabs:[{id:7,url:'https://x.com/home',lastAccessed:1}],created:[],attached:new Set(attached?[7]:[]),attachCount:0,learned:0,sockets:[],timers:new Map(),intervals:new Map(),alarms:new Map()};
 let nextTimer=1,onDetach,onAlarm;
 const storage=data=>({get:async keys=>Object.fromEntries([].concat(keys).filter(key=>key in data).map(key=>[key,data[key]])),set:async value=>Object.assign(data,value),remove:async keys=>{for(const key of [].concat(keys))delete data[key];}});
 class Socket {
  static OPEN=1;
  constructor(){this.readyState=0;state.sockets.push(this);queueMicrotask(()=>{if(!state.online)this.onerror?.();else {this.readyState=1;this.onopen?.();}});}
  send(raw){const value=JSON.parse(raw);if(value.token)queueMicrotask(()=>this.onmessage?.({data:JSON.stringify(state.validKey?{type:'ready'}:{type:'error',error:'连接密钥无效，请重新配对'})}));else if(value.type==='heartbeat')queueMicrotask(()=>this.onmessage?.({data:'{"type":"heartbeat"}'}));}
  close(){if(this.readyState===3)return;this.readyState=3;queueMicrotask(()=>this.onclose?.());}
 }
 const context=vm.createContext({URL,Date,JSON,Promise,console,WebSocket:Socket,AbortSignal,
  setTimeout:(fn,ms)=>{const id=nextTimer++;state.timers.set(id,{fn,ms});return id;},clearTimeout:id=>state.timers.delete(id),setInterval:(fn,ms)=>{const id=nextTimer++;state.intervals.set(id,{fn,ms});return id;},clearInterval:id=>state.intervals.delete(id),
  sessionFromCookies:()=>({uid:'99',cookie:'fixture',csrf:'fixture'}),learnRequests:async()=>{state.learned++;},cleanupPublicationTabs:async()=>({closed:0}),
  fetch:async(url,options)=>{if(!state.online)throw new TypeError('offline');if(url.endsWith('/health'))return Response.json({service:'onhold-admin'});if(!state.validKey)return Response.json({error:'连接密钥无效'},{status:401});const operation=JSON.parse(options.body).operation;if(operation==='creator')return Response.json({account:state.cachedOwner||'owner'});if(operation==='refresh_x_session'&&state.noCache)return Response.json({error:'请重新连接以学习 X 接口'},{status:400});return Response.json({});},
  chrome:{storage:{local:storage(state.local),session:storage(state.session)},runtime:{getManifest:()=>({version:'1.5.18'})},
   alarms:{onAlarm:{addListener:fn=>onAlarm=fn},create:async(name,value)=>state.alarms.set(name,value),clear:async name=>state.alarms.delete(name)},
   debugger:{onDetach:{addListener:fn=>onDetach=fn},attach:async({tabId})=>{state.attached.add(tabId);state.attachCount++;},detach:async({tabId})=>{state.attached.delete(tabId);},sendCommand:async({tabId},method,input)=>{if(!state.attached.has(tabId))throw Error('Debugger is not attached');if(method==='Network.getCookies')return {cookies:[]};if(input.expression==='0')return {result:{value:0}};return {result:{value:{handle:state.owner,source:'https://x.com/home',posts:[],profile:{}}}};}},
   tabs:{get:async id=>{const tab=state.tabs.find(tab=>tab.id===id);if(!tab)throw Error('No tab');return tab;},query:async()=>state.tabs,create:async value=>{const tab={id:31,url:value.url,lastAccessed:2};state.created.push(value);state.tabs.push(tab);return tab;}}}
 });
 vm.runInContext(source,context);
 state.bridge=context.makeBridge();
 state.detach=async()=>{state.attached.clear();await onDetach({tabId:state.session.cdpTab});await flush();};
 state.retry=async()=>{await flush();const pending=[...state.timers].sort((a,b)=>a[1].ms-b[1].ms)[0];assert.ok(pending,'a retry is scheduled');state.timers.delete(pending[0]);pending[1].fn();await state.bridge.resume().catch(()=>{});await flush();};
 state.wake=async()=>{onAlarm({name:'onhold-cdp'});await flush();};
 return state;
}

test('backend restart retries the socket with backoff and ignores late closes without reattaching X',async()=>{
 const s=fixture();await s.bridge.resume();await flush();assert.equal(s.session.cdpWs,'connected');const old=s.sockets[0];
 s.online=false;old.close();await flush();assert.equal([...s.timers.values()][0].ms,1000);await s.retry();assert.equal([...s.timers.values()][0].ms,2000);
 s.online=true;await s.retry();assert.equal(s.session.cdpWs,'connected');assert.equal(s.attachCount,0);assert.equal(s.learned,0);assert.equal(s.created.length,0);assert.equal(s.timers.size,0);
 old.onclose();await flush();assert.equal(s.session.cdpWs,'connected');assert.equal(s.timers.size,0);
});
test('browser restart restores the persisted account and detached debugging connection',async()=>{
 const s=fixture({session:{},attached:false});await s.bridge.resume();await flush();assert.equal(s.session.cdpAccount,'owner');assert.equal(s.session.cdpWs,'connected');assert.equal(s.attachCount,1);assert.equal(s.local.cdpBinding.account,'owner');
 await s.detach();assert.equal(s.session.cdpAccount,'owner');await s.retry();assert.equal(s.session.cdpWs,'connected');assert.equal(s.attachCount,2);
});
test('closing the bound tab creates at most one background connection page while waiting for login',async()=>{
 const s=fixture();await s.bridge.resume();await flush();s.tabs=[];s.owner='';await s.detach();await s.retry();assert.equal(s.created.length,1);assert.equal(s.created[0].active,false);assert.equal(s.session.cdpWs,'disconnected');
 s.owner='owner';await s.retry();assert.equal(s.created.length,1);assert.equal(s.session.cdpAccount,'owner');assert.equal(s.session.cdpWs,'connected');
});
test('manual disconnect stays disconnected even if the backend is offline or Chrome restarts',async()=>{
 const s=fixture();await s.bridge.resume();await flush();s.online=false;await assert.rejects(s.bridge.disconnect());await flush();assert.equal(s.local.cdpAutoConnect,false);assert.equal(s.session.cdpAccount,undefined);assert.equal(s.timers.size,0);assert.equal(s.alarms.size,0);
 const count=s.sockets.length;await s.wake();assert.equal(s.sockets.length,count);
 const restarted=fixture({local:s.local,session:{},attached:false});await restarted.bridge.resume();assert.equal(restarted.sockets.length,0);assert.equal(restarted.attachCount,0);
});
test('automatic recovery never binds a different account or submits its credentials',async()=>{
 const s=fixture({session:{},attached:false});s.owner='other';await assert.rejects(s.bridge.resume(),/账号不匹配/);await flush();assert.equal(s.learned,0);assert.equal(s.sockets.length,0);assert.equal(s.local.cdpBinding.account,'owner');assert.equal(s.session.cdpAccount,undefined);
});
test('invalid pairing stops retries until the pairing is changed',async()=>{
 const s=fixture();s.validKey=false;await assert.rejects(s.bridge.resume(),/密钥/);await flush();assert.equal(s.session.cdpReconnectBlocked,true);assert.equal(s.timers.size,0);const count=s.sockets.length;await s.wake();assert.equal(s.sockets.length,count);
 s.validKey=true;await s.bridge.save({endpoint:'http://127.0.0.1:18431',token:'b'.repeat(64)});await s.bridge.resume();await flush();assert.equal(s.session.cdpWs,'connected');
});

test('recovery reuses UID-verified cached read templates, or learns once when absent',async()=>{
 const cached=fixture({session:{},attached:false});await cached.bridge.resume();await flush();assert.equal(cached.learned,0);assert.equal(cached.session.cdpWs,'connected');
 const fresh=fixture({session:{},attached:false});fresh.noCache=true;await fresh.bridge.resume();await flush();assert.equal(fresh.learned,1);assert.equal(fresh.session.cdpWs,'connected');
 const mismatch=fixture({session:{},attached:false});mismatch.cachedOwner='other';await assert.rejects(mismatch.bridge.resume(),/UID/);assert.equal(mismatch.learned,0);assert.equal(mismatch.sockets.length,0);
});

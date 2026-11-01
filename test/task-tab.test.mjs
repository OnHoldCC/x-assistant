import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskTab} from '../extension/task-tab.js';
const busy=()=>Error('Tabs cannot be edited right now (user may be dragging a tab).');
function setup(t,create){const oldChrome=globalThis.chrome,oldTimer=globalThis.setTimeout,delays=[];t.after(()=>{globalThis.chrome=oldChrome;globalThis.setTimeout=oldTimer;});globalThis.chrome={tabs:{create}};globalThis.setTimeout=(fn,ms)=>{delays.push(ms);queueMicrotask(fn);return 0;};return delays;}
test('task pages wait for a temporary Chrome tab lock without restarting their task',async t=>{
 let calls=0;const options={url:'about:blank',active:false};const delays=setup(t,async value=>{assert.equal(value,options);if(++calls<4)throw busy();return {id:12};});assert.deepEqual(await createTaskTab(options),{id:12});assert.equal(calls,4);assert.deepEqual(delays,[250,500,750]);
});
test('persistent tab locks are bounded and unrelated errors are not retried',async t=>{
 let calls=0;const delays=setup(t,async()=>{calls++;throw busy();});await assert.rejects(createTaskTab({}),/Chrome 标签页暂时被锁定/);assert.equal(calls,9);assert.equal(delays.reduce((a,b)=>a+b,0),6500);
 const denied=Error('Permission denied');globalThis.chrome.tabs.create=async()=>{calls++;throw denied;};await assert.rejects(createTaskTab({}),error=>error===denied);assert.equal(calls,10);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadVideo} from '../extension/video-upload.js';

test('video upload waits beyond 90 seconds for Post and the matching media receipt',async t=>{
 let clock=0,checks=0,heartbeats=0;
 const oldNow=Date.now,oldTimer=globalThis.setTimeout;
 t.after(()=>{Date.now=oldNow;globalThis.setTimeout=oldTimer;});
 Date.now=()=>clock;globalThis.setTimeout=fn=>{clock+=250;queueMicrotask(fn);return 0;};
 const ids=new Set();
 const command=async(method,params)=>method==='Runtime.evaluate'?{result:{objectId:'transfer'}}:method==='Runtime.callFunctionOn'?{result:{value:params.arguments?1:true}}:{};
 const call=async()=>{heartbeats++;return {offset:0,total:1,bytes:[1]};};
 const inspect=async()=>{checks++;if(clock>=110000)ids.add('456');return {ready:true,mediaReady:clock>=100000,enabled:clock>=105000};};
 assert.equal(await uploadVideo({id:'job'},command,call,'example',inspect,ids,()=>''),'456');
 assert.ok(clock>=110000&&checks>360&&heartbeats>20);
 ids.clear();clock=0;
 await assert.rejects(uploadVideo({id:'job'},command,call,'example',async()=>({ready:true,mediaReady:true,enabled:true}),ids,()=>''),/等待5分钟.*媒体回执0条/);
 assert.equal(clock,300000,'never send when Post is ready but the media receipt is missing');
});

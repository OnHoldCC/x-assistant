import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectTikTokVideo,downloadTikTokVideo} from '../extension/tiktok.js';

function page(t,change={}){
 const old={document:globalThis.document,location:globalThis.location};
 const item={id:'123',author:{uniqueId:'creator'},desc:'A kitten playing',video:{duration:8,playAddr:'https://v16.tiktokcdn-us.com/video.mp4',downloadAddr:'https://v16.tiktokcdn-us.com/watermarked.mp4'},...change};
 globalThis.location={protocol:'https:',hostname:'www.tiktok.com',pathname:'/@creator/video/123'};
 globalThis.document={getElementById:()=>({textContent:JSON.stringify({__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:item}}}})})};
 t.after(()=>{for(const [key,value] of Object.entries(old)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
 return item;
}
test('TikTok extraction matches the current video and selects the playback version',t=>{
 page(t);const video=inspectTikTokVideo();assert.equal(video.id,'123');assert.equal(video.source,'https://www.tiktok.com/@creator/video/123');assert.equal(video.url,'https://v16.tiktokcdn-us.com/video.mp4');
});
test('TikTok extraction rejects mismatched, private, advertised and unavailable videos',t=>{
 const item=page(t);
 for(const key of ['privateItem','isAd','isProhibited','takeDown']){item[key]=true;globalThis.document.getElementById=()=>({textContent:JSON.stringify({__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:item}}}})});assert.throws(inspectTikTokVideo,/不可下载/);item[key]=false;}
 item.id='456';assert.throws(inspectTikTokVideo,/不匹配/);
 globalThis.location.pathname='/';assert.throws(inspectTikTokVideo,/具体/);
 globalThis.location.hostname='evil.example';assert.throws(inspectTikTokVideo,/视频页/);
});
test('TikTok extraction rejects unsafe media URLs and never falls back to a watermarked download',t=>{
 const item=page(t);
 for(const url of ['', 'http://v16.tiktokcdn-us.com/video.mp4','https://tiktokcdn-us.com.evil.example/v.mp4','https://127.0.0.1/a','https://user:pass@v16.tiktokcdn-us.com/a','https://v16.tiktokcdn-us.com:444/a']){
  item.video.playAddr=url;
  globalThis.document.getElementById=()=>({textContent:JSON.stringify({__DEFAULT_SCOPE__:{'webapp.video-detail':{itemInfo:{itemStruct:item}}}})});
  assert.throws(inspectTikTokVideo,/可信的播放地址/);
 }
});
test('plugin downloads only after permission and inspection, detaches, and reports completion',async t=>{
 const old=globalThis.chrome,actions=[];
 t.after(()=>{if(old===undefined)delete globalThis.chrome;else globalThis.chrome=old;});
 const video={id:'123',author:'creator',source:'https://www.tiktok.com/@creator/video/123',url:'https://v16.tiktokcdn-us.com/video.mp4'};
 globalThis.chrome={permissions:{contains:async()=>true},tabs:{query:async()=>[{id:7,url:video.source}]},debugger:{attach:async()=>actions.push('attach'),sendCommand:async()=>({result:{value:video}}),detach:async()=>actions.push('detach')},downloads:{download:async input=>{actions.push('download');assert.equal(input.url,video.url);assert.equal(input.filename,'OnHold/TikTok/123.mp4');return 42;},search:async input=>{assert.equal(input.id,42);return [{state:'complete',filename:'/Downloads/OnHold/TikTok/123.mp4',fileSize:2048,mime:'video/mp4'}];}}};
 const result=await downloadTikTokVideo();assert.equal(result.bytes,2048);assert.deepEqual(actions,['attach','detach','download']);assert.equal(result.url,undefined,'do not return signed CDN URLs to the popup');
 actions.length=0;chrome.permissions.contains=async()=>false;await assert.rejects(downloadTikTokVideo(),/允许/);assert.deepEqual(actions,[]);
 chrome.permissions.contains=async()=>true;chrome.debugger.sendCommand=async()=>({exceptionDetails:{exception:{description:'资料尚未加载'}}});await assert.rejects(downloadTikTokVideo(),/尚未加载/);assert.deepEqual(actions,['attach','detach']);
 actions.length=0;chrome.debugger.attach=async()=>{throw Error('Another debugger is already attached');};await assert.rejects(downloadTikTokVideo(),/already attached/);assert.deepEqual(actions,[],'never detach someone else’s debugger');
});
test('plugin surfaces interrupted or invalid downloads without starting a second download',async t=>{
 const old=globalThis.chrome;let count=0;
 t.after(()=>{if(old===undefined)delete globalThis.chrome;else globalThis.chrome=old;});
 globalThis.chrome={permissions:{contains:async()=>true},tabs:{query:async()=>[{id:7,url:'https://www.tiktok.com/@creator/video/123'}]},debugger:{attach:async()=>{},detach:async()=>{},sendCommand:async()=>({result:{value:{id:'123',url:'https://v16.tiktokcdn-us.com/video.mp4'}}})},downloads:{download:async()=>++count,search:async()=>[{state:'interrupted',error:'NETWORK_FAILED'}]}};
 await assert.rejects(downloadTikTokVideo(),/NETWORK_FAILED/);assert.equal(count,1);
 chrome.downloads.search=async()=>[{state:'complete',fileSize:10,mime:'text/html'}];await assert.rejects(downloadTikTokVideo(),/有效视频/);assert.equal(count,2);
});

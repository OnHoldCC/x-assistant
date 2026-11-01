import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadTikTokVideo} from '../extension/tiktok.js';
test('plugin sends only the current TikTok page URL to the backend',async t=>{
 const old=globalThis.chrome;t.after(()=>{if(old===undefined)delete globalThis.chrome;else globalThis.chrome=old;});
 globalThis.chrome={tabs:{query:async()=>[{id:7,url:'https://www.tiktok.com/@creator/video/123?tracking=1'}]}};
 const result=await downloadTikTokVideo(async url=>{assert.equal(url,'https://www.tiktok.com/@creator/video/123?tracking=1');return {filename:'/backend/media/source.mp4',bytes:1234};});
 assert.equal(result.filename,'/backend/media/source.mp4');
 await assert.rejects(downloadTikTokVideo(async()=>{throw Error('TikTok 拒绝视频下载');}),/拒绝视频下载/);
});
test('plugin refuses homepages, non-TikTok URLs and malformed video targets without contacting the backend',async t=>{
 const old=globalThis.chrome;t.after(()=>{if(old===undefined)delete globalThis.chrome;else globalThis.chrome=old;});
 for(const url of ['https://www.tiktok.com/','https://evil.example/@creator/video/123','https://www.tiktok.com.evil.example/@creator/video/123','https://www.tiktok.com/@creator/video/not-a-number']){
  globalThis.chrome={tabs:{query:async()=>[{id:7,url}]}};
  await assert.rejects(downloadTikTokVideo(async()=>assert.fail('invalid URLs must not reach the backend')),/具体的 TikTok 视频/);
 }
});

test('video plans skip known clips and queue only one new URL with owned capture context',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);
 const {collectTikTokVideos}=await import('../extension/tiktok.js');let calls=0,verifications=0;
 globalThis.chrome={tabs:{create:async()=>assert.fail('direct video URLs do not open browser tabs')}};
 await collectTikTokVideos({id:'capture',client:'client',input:{known_ids:['123'],source_urls:['https://www.tiktok.com/@cats/video/123','https://www.tiktok.com/@cats/video/456','https://www.tiktok.com/@cats/video/789']}},async(operation,input,timeout)=>{
  calls++;assert.equal(operation,'download_tiktok_video');assert.deepEqual(input,{account:'example',url:'https://www.tiktok.com/@cats/video/456',capture_job:'capture',client:'client'});assert.equal(timeout,90000);
 },'example',async()=>verifications++);
 assert.equal(calls,1);assert.equal(verifications,1);
 await assert.rejects(collectTikTokVideos({input:{source_urls:['https://evil.example/']}},async()=>assert.fail(),'example',async()=>{}),/来源页面无效/);
});
test('TikTok page capture closes its reader and rejects verification pages without downloading',async t=>{
 const old=globalThis.chrome;t.after(()=>globalThis.chrome=old);const {collectTikTokVideos}=await import('../extension/tiktok.js');let removed=0,detached=0,downloads=0,blocked=false;
 globalThis.chrome={tabs:{create:async options=>{assert.equal(options.active,false);return {id:7};},remove:async()=>removed++},debugger:{attach:async()=>{},detach:async()=>detached++,sendCommand:async()=>({result:{value:blocked?{blocked:true,urls:[]}:{urls:['https://www.tiktok.com/@cats/video/456','https://evil.example/@cats/video/789']}}})}};
 const job={id:'capture',client:'client',input:{source_urls:['https://www.tiktok.com/search?q=cats'],known_ids:[]}};
 await collectTikTokVideos(job,async()=>downloads++,'example',async()=>{});assert.equal(downloads,1);assert.equal(removed,1);assert.equal(detached,1);
 blocked=true;await assert.rejects(collectTikTokVideos(job,async()=>assert.fail(),'example',async()=>{}),/安全验证/);assert.equal(removed,2);assert.equal(detached,2);
});

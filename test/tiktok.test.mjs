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

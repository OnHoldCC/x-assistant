import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:420,height:1000}});
const dist=path.resolve('app/dist');
await context.route('**/*',route=>{
 const url=new URL(route.request().url());assert.equal(url.origin,'http://127.0.0.1:18439','fixture must not contact live services');
 const file=path.join(dist,decodeURIComponent(url.pathname));assert.ok(file.startsWith(dist+path.sep));
 return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.gif':'image/gif','.png':'image/png','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream'});
});
await context.addInitScript(()=>{
 window.downloadCalls=0;window.captionRetries=0;window.captionReads=0;
 const result=(status='queued')=>({download_id:'fixture-video',filename:'/backend/media/source.mp4',caption_status:status,caption_text:status==='ready'?'One piece of confetti decided gravity was optional.':'',caption_reason:status==='rejected'?'涉及国家政治':'',caption_error:status==='failed'?'模型调用失败':'',caption_file:'/backend/media/caption.txt',caption_job:{id:'fixture-video',account:'example',action:'video_caption',state:status==='failed'?'failed':['ready','rejected'].includes(status)?'completed':'queued',created_at:1000,updated_at:2000,error:null,input:{stage:status==='rejected'?'skipped':'ready',telemetry:{generations:[{duration_ms:1000,usage:{input_tokens:100,output_tokens:20,cached_input_tokens:60,total_tokens:120}}]}},result:{sent:false}}});
 const saved=value=>{localStorage.setItem('caption-fixture',JSON.stringify(value));return {ok:true,data:value};};
 window.chrome={permissions:{request:async()=>{throw Error('backend downloads must not request browser download permission');}},tabs:{create:async()=>{}},runtime:{sendMessage:async message=>{
  if(message.type==='CDP_STATUS')return {ok:true,data:{configured:true,cdpWs:'disconnected'}};
  if(message.type==='TIKTOK_LAST')return {ok:true,data:JSON.parse(localStorage.getItem('caption-fixture')||'null')};
  if(message.type==='TIKTOK_DOWNLOAD'){window.downloadCalls++;if(window.downloadError)return {ok:false,error:window.downloadError};return saved(window.videoMode==='china'?{caption_status:'rejected',caption_reason:'涉及中国人物或中国相关话题，已自动过滤',caption_text:'',skipped:true}:window.videoMode==='unavailable'?{caption_status:'unavailable',caption_reason:'CDN HTTP 403',skipped:true}:result(window.videoMode||'queued'));}
  if(message.type==='TIKTOK_STATUS'){window.captionReads++;return saved(result('ready'));}
  if(message.type==='TIKTOK_RETRY'){window.captionRetries++;return saved(result('queued'));}
  throw Error('Unexpected fixture operation: '+message.type);
 }}};
 Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copiedCaption=text}});
});
try{
 const page=await context.newPage();await page.goto('http://127.0.0.1:18439/bridge.html');
 const button=page.getByRole('button',{name:'下载视频并生成英文配文'});await button.click();await page.getByRole('status').filter({hasText:'后端已保存：/backend/media/source.mp4'}).waitFor();
 assert.equal(await button.isEnabled(),false,'pending captions cannot accidentally redownload');
 const caption=page.getByRole('textbox',{name:'配套英文文案'});await caption.waitFor();assert.equal(await caption.inputValue(),'One piece of confetti decided gravity was optional.');
 await page.getByText('生成 1 秒 · 120 tokens',{exact:true}).waitFor();await page.getByRole('button',{name:'复制英文文案'}).click();assert.equal(await page.evaluate(()=>window.copiedCaption),await caption.inputValue());
 assert.equal(await page.evaluate(()=>window.downloadCalls),1);await page.reload();await caption.waitFor();assert.equal(await page.evaluate(()=>window.downloadCalls),0,'reopening reads saved progress without another download');
 await page.evaluate(()=>window.videoMode='failed');await button.click();await page.getByRole('button',{name:'重试配文（不重新下载）'}).click();await caption.waitFor();assert.equal(await page.evaluate(()=>window.downloadCalls),1);assert.equal(await page.evaluate(()=>window.captionRetries),1);
 await page.evaluate(()=>window.videoMode='rejected');await button.click();await page.getByText('内容已排除：涉及国家政治',{exact:true}).waitFor();assert.equal(await caption.count(),0);assert.equal(await page.getByRole('button',{name:'复制英文文案'}).count(),0);
 await page.evaluate(()=>window.videoMode='china');await button.click();await page.getByText('内容已排除：涉及中国人物或中国相关话题，已自动过滤',{exact:true}).waitFor();assert.equal(await page.getByRole('status').filter({hasText:'后端已保存'}).count(),0);await page.reload();await page.getByText('内容已排除：涉及中国人物或中国相关话题，已自动过滤',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.captionReads),0,'filtered results without a download ID never poll a nonexistent caption job');
 await page.evaluate(()=>window.videoMode='unavailable');await button.click();await page.getByText('下载未完成：CDN HTTP 403',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'重试配文（不重新下载）'}).count(),0);assert.equal(await page.getByRole('status').filter({hasText:'后端已保存'}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('Passed: automatic queued captions, copy, usage, reopen, retry without redownload and rejected content. Mock services only.');
}finally{await browser.close();}

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
 window.allowDownloads=true;window.downloadCalls=0;
 window.chrome={permissions:{request:async()=>window.allowDownloads},tabs:{create:async()=>{}},runtime:{sendMessage:async message=>{
  if(message.type==='CDP_STATUS')return {ok:true,data:{configured:true,cdpWs:'disconnected'}};
  if(message.type==='TIKTOK_DOWNLOAD'){window.downloadCalls++;return window.downloadError?{ok:false,error:window.downloadError}:{ok:true,data:{filename:'/Downloads/OnHold/TikTok/123.mp4'}};}
  throw Error('Unexpected fixture operation: '+message.type);
 }}};
});
try{
 const page=await context.newPage();await page.goto('http://127.0.0.1:18439/bridge.html');
 const button=page.getByRole('button',{name:'下载当前 TikTok 视频'});await button.click();await page.getByRole('status').filter({hasText:'已下载：/Downloads/OnHold/TikTok/123.mp4'}).waitFor();
 assert.equal(await page.evaluate(()=>window.downloadCalls),1);
 await page.evaluate(()=>window.allowDownloads=false);await button.click();await page.getByText('未允许文件下载',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.downloadCalls),1);
 await page.evaluate(()=>{window.allowDownloads=true;window.downloadError='请先打开一条具体的 TikTok 视频';});await button.click();await page.getByText('请先打开一条具体的 TikTok 视频',{exact:true}).waitFor();
 assert.equal(await button.isEnabled(),true);assert.ok(await page.getByText('选题排除国家政治和血腥内容。下载后还需检查画面及片尾。',{exact:true}).isVisible());
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('Passed: TikTok popup download success, denied permission, recoverable errors and narrow layout. Mock services only.');
}finally{await browser.close();}

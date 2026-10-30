import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try {
 await page.addInitScript(()=>{
  window.calls=[];window.pendingAnalyses=[];window.rewrites=[];window.pendingRewrites=[];window.savedBookmark=null;
  window.chrome={runtime:{getURL:file=>'https://x.com/'+file,onMessage:{addListener(){}},async sendMessage(message){
   if(message.type==='BOOKMARK_GET')return {ok:true,data:{saved:false,tags:[]}};
   if(message.type==='BOOKMARK_SAVE'){window.savedBookmark=message.data;return {ok:true,data:{saved:!message.data.remove}};}
   if(message.type==='QUEUE_REWRITE'){rewrites.push(message.data);const error=await new Promise(resolve=>pendingRewrites.push(resolve));return error?{ok:false,error}:{ok:true,data:{id:'rewrite-'+rewrites.length,duplicate:false}};}
   calls.push(message);const failure=await new Promise(resolve=>pendingAnalyses.push(resolve));
   return failure?{ok:false,error:failure}:{ok:true,data:{potential:{score:48,rows:[{label:'信息价值',score:45}]},keywords:[]}};
  }}};
 });
 const post=id=>`<article data-testid="tweet" id="${id}"><div data-testid="tweetText">这是关于本机翻译的测试帖子。 #原文</div><a href="https://x.com/example/status/${id==='first'?'123':'124'}/analytics" aria-label="1000 views">1000</a><button data-testid="like" aria-label="10 Likes">10</button><button data-testid="reply" aria-label="2 Replies">2</button><button data-testid="retweet" aria-label="1 Repost">1</button></article>`;
 await page.route('https://x.com/assets/nunito-variable.ttf',route=>route.fulfill({contentType:'font/ttf',body:fs.readFileSync('extension/assets/nunito-variable.ttf')}));
 await page.route('https://x.com/**',route=>route.request().url().endsWith('/assets/nunito-variable.ttf')?route.fallback():route.fulfill({contentType:'text/html;charset=utf-8',body:'<style>body{font:18px system-ui;background:#fff}main{width:600px;margin:80px 100px}article{overflow:hidden;position:relative;padding:20px;border:1px solid #ddd;min-height:160px;margin:24px 0}</style><main>'+post('first')+post('second')+'</main>'}));
 await page.goto('https://x.com/home');
 for(const file of ['translation-ui.js','x-reading-source.js','metrics-core.js','onhold-ui.js','post-border.js'])await page.addScriptTag({path:path.resolve('extension',file)});
 const firstTop=await page.locator('#first').evaluate(node=>node.getBoundingClientRect().top);
 await page.locator('#first').hover();const row=page.locator('#first onhold-post-border');await row.waitFor();
 assert.equal(await page.locator('#first').evaluate(node=>node.getBoundingClientRect().top),firstTop);
 assert.equal(await row.locator('.row').evaluate(node=>getComputedStyle(node).flexDirection),'column');
 assert.equal(await row.locator('.score').count(),0,'the scoring model entry point is removed');
 assert.equal(await row.locator('.metrics').textContent(),'加权互动率1.76%');
 assert.ok(await row.evaluate(node=>{const rail=node.getBoundingClientRect(),post=node.parentElement.getBoundingClientRect();return rail.left>=post.right||rail.right<=post.left;}));
 assert.ok(await row.evaluate(host=>{const r=host.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===host;}));
 assert.equal(await row.locator('.details').count(),0,'the obsolete detail panel is removed');
 assert.equal(await row.getByRole('button',{name:'详情 ›',exact:true}).count(),0);
 assert.equal(await row.getByRole('button',{name:'收藏到 OnHold',exact:true}).count(),0,'retired local bookmark control is removed');
 await row.getByRole('button',{name:'一键改写',exact:true}).click();await page.waitForFunction(()=>pendingRewrites.length===1);
 assert.equal(await row.getByRole('button',{name:'入队中…',exact:true}).isDisabled(),true);
 await page.evaluate(()=>pendingRewrites.shift()('后台暂时不可用'));
 await row.getByText('后台暂时不可用',{exact:true}).waitFor();assert.equal(await row.getByRole('button',{name:'一键改写',exact:true}).isEnabled(),true);
 await row.getByRole('button',{name:'一键改写',exact:true}).click();await page.waitForFunction(()=>pendingRewrites.length===1);
 await page.locator('#second').hover();await page.evaluate(()=>pendingRewrites.shift()());
 assert.equal(await page.locator('#second onhold-post-border .queue-rewrite').textContent(),'一键改写','late results do not mark a different post as queued');
 await page.locator('#first').hover();assert.equal(await row.locator('.queue-rewrite').textContent(),'已入队');assert.equal(await row.locator('.queue-rewrite').isDisabled(),true);
 const queued=await page.evaluate(()=>rewrites);assert.equal(queued.length,2);assert.equal(queued[1].id,'123');assert.equal(queued[1].url,'https://x.com/example/status/123');assert.match(queued[1].text,/#原文/);
 assert.equal(queued[1].mode,'rewrite');
 await row.getByRole('button',{name:'发同款',exact:true}).click();await page.waitForFunction(()=>pendingRewrites.length===1);
 assert.equal(await row.locator('.queue-similar').getAttribute('aria-busy'),'true');
 await page.locator('#second').hover();await page.locator('#first').hover();
 assert.equal(await row.locator('.queue-similar').isDisabled(),true,'returning to a post keeps its pending generation locked');
 assert.equal((await page.evaluate(()=>rewrites)).length,3);
 await page.evaluate(()=>pendingRewrites.shift()());await page.waitForFunction(()=>document.querySelector('#first onhold-post-border')?.shadowRoot.querySelector('.queue-similar').textContent==='已入队');
 assert.equal((await page.evaluate(()=>rewrites))[2].mode,'replicate');
 assert.equal(await row.locator('.queue-rewrite').textContent(),'已入队','generation and rewrite keep separate states');
 await page.waitForTimeout(450);assert.equal(await page.evaluate(()=>calls.length),0,'browsing posts never invokes a scoring model');
 await page.evaluate(()=>{const dialog=document.createElement('div');dialog.id='native-dialog';dialog.setAttribute('role','dialog');dialog.style.cssText='position:fixed;inset:0;background:white';document.body.append(dialog);});
 await page.waitForTimeout(500);assert.equal(await page.locator('onhold-post-border').count(),0,'native dialogs suspend the overlay');
 await page.evaluate(()=>document.querySelector('#native-dialog').remove());await page.locator('#first').hover();await row.waitFor();
 await page.evaluate(()=>document.fonts.ready);assert.ok((await row.evaluate(node=>getComputedStyle(node).fontFamily)).includes('Launch Rounded'));
 if(process.env.WRITING_SCREENSHOT_DIR){fs.mkdirSync(process.env.WRITING_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.WRITING_SCREENSHOT_DIR,'帖子一键改写.png')});}
 await page.locator('#second').hover();await page.locator('#second [data-testid="tweetText"]').evaluate(node=>node.textContent+=' 新内容');await page.locator('#first').hover();assert.equal(await page.evaluate(()=>calls.length),0);
 await page.setViewportSize({width:375,height:812});await page.waitForFunction(()=>{const n=document.querySelector('onhold-post-border');if(!n)return false;const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;});
 assert.deepEqual(errors,[]);
 console.log('Passed: removed scoring, side positioning, font preservation, removed details, removed local bookmarks, separate rewrite/similar-article queues, enqueue/error/retry, duplicate click prevention across post switches, stale response isolation, no scoring requests, native dialog handling and mobile docking.');
} finally { await browser.close(); }

import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.addInitScript(()=>{
  window.queued=[];window.expansions=0;window.quoteClicks=0;
  window.chrome={runtime:{getURL:file=>'https://x.com/'+file,sendMessage:async message=>{if(message.type!=='QUEUE_REWRITE')throw Error('Unexpected operation');queued.push(message.data);return {ok:true,data:{id:'fixture',duplicate:false}};}}};
 });
 await page.route('**/*',route=>route.request().url().endsWith('/assets/nunito-variable.ttf')?route.fulfill({contentType:'font/ttf',body:fs.readFileSync('extension/assets/nunito-variable.ttf')}):route.fulfill({contentType:'text/html;charset=utf-8',body:`<style>main{width:600px;margin:80px 100px}article{padding:24px;margin:20px;border:1px solid #ddd}</style><main>
 <article data-testid="tweet" id="long"><a href="/writer/status/901"><time>now</time></a><div data-testid="tweetText">截断内容</div><button data-testid="tweet-text-show-more-link" onclick="expansions++;setTimeout(()=>{this.parentElement.querySelector('[data-testid=tweetText]').textContent='展开后的完整正文。';this.remove()},200)">Show more</button><div data-testid="quoteTweet"><button onclick="quoteClicks++">Show more</button></div></article>
 <article data-testid="tweet" id="translated"><a href="/writer/status/902"><time>now</time></a><div data-testid="tweetText" lang="en">The original English post.</div></article>
 <article data-testid="tweet" id="broken"><a href="/writer/status/903"><time>now</time></a><div data-testid="tweetText">不能展开</div><button data-testid="tweet-text-show-more-link">Show more</button></article>
 </main>`}));
 await page.goto('https://x.com/home');
 for(const file of ['translation-ui.js','x-reading-source.js','metrics-core.js','onhold-ui.js','post-border.js'])await page.addScriptTag({path:path.resolve('extension',file)});
 assert.deepEqual(await page.evaluate(()=>[expansions,queued.length]),[0,0]);
 await page.locator('#long').hover();
 await page.locator('#long onhold-post-border .queue-rewrite').click();
 assert.equal(await page.locator('#long onhold-post-border .queue-rewrite').isDisabled(),true);
 await page.locator('#translated').hover();
 await page.waitForFunction(()=>queued.length===1);
 assert.deepEqual(await page.evaluate(()=>({text:queued[0].text,url:queued[0].url,mode:queued[0].mode,expansions,quoteClicks})),{text:'展开后的完整正文。',url:'https://x.com/writer/status/901',mode:'rewrite',expansions:1,quoteClicks:0});
 await page.evaluate(()=>{const article=document.querySelector('#translated');OnHoldXReading.read(article);article.querySelector('[data-testid=tweetText]').textContent='已经翻译好的完整正文。';const label=document.createElement('div');label.innerHTML='Translated from English <button>Show original</button>';article.append(label);});
 await page.waitForFunction(()=>OnHoldXReading.read(document.querySelector('#translated')).native);
 await page.locator('#translated onhold-post-border .queue-rewrite').click();
 await page.waitForFunction(()=>queued.length===2);
 assert.equal(await page.evaluate(()=>queued[1].text),'已经翻译好的完整正文。');
 assert.equal(await page.evaluate(()=>queued[1].url),'https://x.com/writer/status/902');
 await page.locator('#translated onhold-post-border .status').getByText('已使用 X 页面译文加入草稿生成任务',{exact:true}).waitFor();
 await page.locator('#broken').hover();
 await page.locator('#broken onhold-post-border .queue-rewrite').click();
 await page.locator('#broken onhold-post-border .status').getByText('展开全文超时，未生成草稿；请打开原帖后重试',{exact:true}).waitFor({timeout:10000});
 assert.equal(await page.evaluate(()=>queued.length),2);
 assert.equal(await page.locator('#broken onhold-post-border .queue-rewrite').isEnabled(),true);
 await page.evaluate(()=>{const article=document.querySelector('#broken');article.querySelector('button[data-testid]').onclick=()=>{article.querySelector('a').href='/other/status/904';};});
 await page.locator('#broken onhold-post-border .queue-rewrite').click();
 await page.locator('#broken onhold-post-border .status').getByText('帖子已改变，未生成草稿',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>queued.length),2);
 assert.deepEqual(errors,[]);
 console.log('Passed: manual draft expands full text once, ignores quote controls, preserves the selected post across hover changes, accepts visible X translations, and queues nothing after timeout or identity changes. All network responses are fixtures; no live X requests or sends.');
}finally{await browser.close();}

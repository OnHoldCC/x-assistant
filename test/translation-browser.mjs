import assert from 'node:assert/strict';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
async function fixture({native=false,restore=false,auto=true,target='zh',more=false,delay=120,io=true,body='This post was automatically translated into English.'}={}){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({auto,target,delay,io})=>{
  if(!io)window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};
  window.calls=[];window.events=[];window.listeners=[];window.restores=0;window.translateDelay=delay;
  window.chrome={runtime:{onMessage:{addListener(fn){listeners.push(fn);}},async sendMessage(message){
   if(message.type==='GET_PUBLIC_CONFIG')return {ok:true,data:{autoTranslate:auto,postAnalysis:true,composeTranslate:true,readingTarget:target,languages:{zh:'中文',en:'英语'}}};
   calls.push(message);
   if(message.type==='TRANSLATE'){events.push('translation:start');await new Promise(r=>setTimeout(r,translateDelay));events.push('translation:end');return {ok:true,data:{text:'已经恢复为中文译文。',sourceLines:[message.text],paragraphs:['已经恢复为中文译文。'],expanded:message.readFull,elapsed_ms:translateDelay}};}
   if(message.type==='ANALYZE_POST'){events.push('analysis:start');return {ok:true,data:{potential:{method:'rubric-score-v2',score:60,rows:[]},keywords:[],model:'fixture',elapsed_ms:1}};}
   return {ok:true,data:{}};
  }}};
 },{auto,target,delay,io});
 const metadata=native?'<div id="native">Translated from Chinese <button id="original">Show original</button></div>':'<div id="native"></div>';
 const html=`<meta charset="utf-8"><style>main{width:600px;margin:20px}article{padding:20px;border:1px solid #ddd}</style><main><article data-testid="tweet" id="post">${metadata}<div data-testid="tweetText" style="white-space:pre-wrap">${body}</div><a href="https://x.com/example/status/123"><time>1h</time></a>${more?'<button data-testid="tweet-text-show-more-link" id="more">Show more</button>':''}</article></main><script>function bindOriginal(){const button=document.querySelector('#original');if(button)button.onclick=()=>{restores++;${restore?"document.querySelector('[data-testid=tweetText]').textContent='这是原本的中文帖子。';document.querySelector('#native').replaceChildren();":''}};}bindOriginal();const more=document.querySelector('#more');if(more)more.onclick=()=>{document.querySelector('[data-testid=tweetText]').textContent+=' The expanded post includes the remaining full content.';more.remove();};</script>`;
 await page.route('https://x.com/**',r=>r.fulfill({contentType:'text/html;charset=utf-8',body:html}));await page.goto('https://x.com/home');
 for(const name of ['translation-ui.js','x-reading-source.js','content.js'])await page.addScriptTag({path:path.resolve('extension',name)});
 return {page,errors};
}
try{
 {
  const {page,errors}=await fixture({delay:1400});
  await page.evaluate(()=>{document.querySelector('#native').innerHTML='Translated from English <button id="original">Show original</button>';document.querySelector('[data-testid=tweetText]').textContent='这是 Grok 已经显示的中文译文。';bindOriginal();});
  await page.waitForFunction(()=>OnHoldXReading.read(document.querySelector('#post'))?.native&&document.querySelectorAll('x-local-translation').length===0);
  assert.equal(await page.evaluate(()=>restores),0);assert.equal(await page.locator('x-local-translation').count(),0);
  const reading=await page.evaluate(()=>{const value=OnHoldXReading.read(document.querySelector('#post'));return {text:value.text,original:value.original};});assert.equal(reading.text,'这是 Grok 已经显示的中文译文。');assert.equal(reading.original,'This post was automatically translated into English.');assert.deepEqual(errors,[]);await page.close();
 }
 {
  const {page,errors}=await fixture({native:true,restore:false,delay:400,body:'这是 Grok 已显示的中文译文。'});
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>restores),0,'native translation must not be toggled back');
  assert.equal(await page.evaluate(()=>calls.filter(m=>m.type==='TRANSLATE').length),0);
  assert.equal(await page.evaluate(()=>OnHoldXReading.read(document.querySelector('#post')).original),null,'first-seen native translation has no observed original');
  assert.equal(await page.locator('x-local-translation').count(),0);
  assert.equal(await page.locator('#post').getAttribute('data-onhold-reading-translation'),null);assert.deepEqual(errors,[]);await page.close();
 }
 {
  const {page,errors}=await fixture({delay:400});
  await page.waitForFunction(()=>events.includes('translation:end'));assert.equal(await page.evaluate(()=>calls.some(m=>m.type==='ANALYZE_POST')),false,'reading never requests scoring');
  assert.equal(await page.locator('#post').getAttribute('data-onhold-reading-translation'),null);assert.deepEqual(errors,[]);await page.close();
 }
 {
  const {page,errors}=await fixture({native:true,target:'en'});await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>restores),0,'native Chinese must not be restored when the chosen reading target is English');assert.deepEqual(errors,[]);await page.close();
 }
 {
  const {page,errors}=await fixture({native:true});await page.waitForFunction(()=>events.includes('translation:end'));
  assert.equal(await page.evaluate(()=>restores),0);
  await page.waitForFunction(()=>calls.some(m=>m.type==='OBSERVE_CONTENT'&&m.source.translation));
  const source=await page.evaluate(()=>calls.find(m=>m.type==='OBSERVE_CONTENT'&&m.source.translation).source);assert.equal(source.original,null);assert.equal(source.translation.provider,'x_grok_dom');
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  const {page,errors}=await fixture({body:'This English post still needs translation.<div data-testid="quoteTweet"><div>Translated from Chinese <button>Show original</button></div></div>'});
  await page.evaluate(()=>{const entry=document.createElement('button');entry.textContent='Show translation';document.querySelector('#native').append(entry);});
  await page.waitForFunction(()=>events.includes('translation:end'));assert.equal(await page.evaluate(()=>OnHoldXReading.read(document.querySelector('#post')).native),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 {
  const {page,errors}=await fixture({more:true});
  await page.waitForFunction(()=>window.events.includes('translation:end'));
  assert.equal(await page.evaluate(()=>calls.find(m=>m.type==='TRANSLATE').readFull),false,'automatic translation must not wait for a hidden full-post page');
  assert.equal(await page.locator('#more').isVisible(),true);
  assert.ok(await page.locator('x-local-translation').evaluate(node=>node.shadowRoot.textContent.includes('部分译文')));
  await page.locator('#more').click();await page.waitForFunction(()=>calls.filter(m=>m.type==='TRANSLATE').some(m=>m.text.includes('expanded post')));assert.deepEqual(errors,[]);await page.close();
 }
 {
  const {page,errors}=await fixture({more:true,auto:false});await page.locator('x-local-translation').getByRole('button',{name:'翻译',exact:true}).click();await page.waitForFunction(()=>events.includes('translation:end'));
  assert.equal(await page.evaluate(()=>calls.find(m=>m.type==='TRANSLATE').readFull),true,'manual full-post translation remains available');assert.deepEqual(errors,[]);await page.close();
 }
 {const {page,errors}=await fixture({io:false});await page.waitForFunction(()=>events.includes('translation:end'));assert.deepEqual(errors,[]);await page.close();}
 {
  const body='<span>Opening bell for </span><div style="display:inline-flex"><a href="https://x.com/BNBStandard">@BNBStandard</a></div><span>, with </span><a href="https://x.com/cz_binance" style="display:inline-flex">@cz_binance</a><span>, our team.</span><br><br><span>Live at 9:15am </span><img alt="👉" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"><span> </span><a href="https://nasdaq.com/marketsite/bell" style="display:inline-flex"><span style="display:block">https://</span><span style="display:block">nasdaq.com/marketsite/bell</span></a><span hidden>not visible</span>';
  const {page,errors}=await fixture({body});await page.waitForFunction(()=>events.includes('translation:end'));
  const expected='Opening bell for @BNBStandard, with @cz_binance, our team.\n\nLive at 9:15am 👉 https://nasdaq.com/marketsite/bell';
  assert.equal(await page.evaluate(()=>calls.find(m=>m.type==='TRANSLATE').text),expected);
  assert.equal(await page.evaluate(()=>XAITranslationUI.readOriginal(document.querySelector('[data-testid=tweetText]'))),expected,'hidden original retains the exact source');
  await page.evaluate(async()=>{
   const node=document.querySelector('[data-testid=tweetText]');document.querySelector('x-local-translation').remove();node.style.display='';
   const ui=XAITranslationUI.mount(node,'one\n\ntwo',async()=>({sourceLines:['one','two'],sourceBreaks:['','\n\n'],paragraphs:['一','二'],cached:true}),()=>true);await ui.start();
  });
  assert.equal(await page.locator('x-local-translation .pair').count(),2);assert.equal(await page.locator('x-local-translation .row-meta').count(),0);
  assert.equal(await page.locator('x-local-translation .pair').nth(1).evaluate(node=>node.style.marginTop),'1.65em');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Passed: native translation reuse without toggling or duplicate translation, unknown original handling, local fallback, no scoring requests, excerpt/manual full-post, exact original line breaks with inline handles/links/emoji, paragraph spacing and one shared status.');
}finally{await browser.close();}

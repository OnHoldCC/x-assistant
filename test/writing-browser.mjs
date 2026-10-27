import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 await page.addInitScript(()=>{
  window.calls=[];window.listeners=[];window.published=0;window.failTranslation=false;window.translationDelay=40;window.editorInputs=[];
  const nativeEdit=document.execCommand.bind(document);document.execCommand=(command,ui,value)=>{const editor=document.activeElement;if(command==='insertText'||command==='insertLineBreak')editorInputs.push({type:command,data:value});const accepted=nativeEdit(command,ui,value);if(command==='insertText'&&editor?.matches?.('[contenteditable=true]')){editor.replaceChildren(document.createTextNode(value));getSelection().collapse(editor,0);}return accepted;};
  window.settings={postAnalysis:true,composeTranslate:true,composeTarget:'en',readingTarget:'zh',autoTranslate:false,hideAds:false,languages:{en:'英语',zh:'简体中文',ja:'日语'}};
  window.chrome={runtime:{onMessage:{addListener(fn){listeners.push(fn);}},async sendMessage(message){
   if(message.type==='GET_PUBLIC_CONFIG')return {ok:true,data:settings};calls.push(message);
   if(message.type==='TRANSLATE_DRAFT'){
    await new Promise(resolve=>setTimeout(resolve,translationDelay));
    if(window.failTranslation){window.failTranslation=false;return {ok:false,error:'模型暂时未连接，请重试'};}
    return {ok:true,data:{text:message.targetLang==='ja'?'本文は自分のパソコンに保存されます。':'Your text stays on your computer.\n\nOnly you can publish it.'}};
   }
   return {ok:true,data:{}};
  }}};
 });
 const html=`<meta charset="utf-8"><style>body{font:18px/1.6 system-ui;margin:24px;color:#0f1419}main{width:min(580px,100%);margin:auto}section{border:1px solid #eff3f4;padding:20px;border-radius:16px}header{font-size:22px;font-weight:600;margin-bottom:16px}[contenteditable]{min-height:130px;white-space:pre-wrap;outline:0}button{font:inherit}button[data-testid=tweetButton]{display:block;margin-left:auto;border:0;border-radius:24px;background:#0f1419;color:white;padding:8px 22px}.footer{border-top:1px solid #eff3f4;margin-top:12px;padding-top:12px}.reply{margin-top:40px}article{margin-top:30px}</style><main><section role="dialog" aria-label="X 发帖框"><header>发帖</header><div data-testid="tweetTextarea_0RichTextInputContainer"><div contenteditable="true" role="textbox" aria-label="帖子草稿" data-testid="tweetTextarea_0"></div></div><div class="footer"><button data-testid="tweetButton" onclick="published++">Post</button></div></section><section class="reply"><div contenteditable="true" role="textbox" aria-label="评论草稿" data-testid="tweetTextarea_1"></div></section><div contenteditable="true" role="textbox" aria-label="私信" id="dm">私信不应被处理</div><article data-testid="tweet"><div data-testid="tweetText">这是一条正在阅读的帖子。</div></article></main>`;
 await page.route('https://x.com/**',route=>route.fulfill({contentType:'text/html;charset=utf-8',body:html}));await page.goto('https://x.com/home');
 const manifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
 assert.ok(!manifest.content_scripts[0].js.includes('post-analysis.js'));assert.ok(!manifest.content_scripts[0].js.includes('writing-tools.js'));
 for(const file of manifest.content_scripts[0].js)await page.addScriptTag({path:path.resolve('extension',file)});
 const editor=page.getByRole('textbox',{name:'帖子草稿',exact:true}),reply=page.getByRole('textbox',{name:'评论草稿',exact:true});
 await page.waitForTimeout(250);assert.equal(await page.locator('onhold-compose-translation:visible').count(),0,'empty editors do not show tools');
 const original='这个工具在本机运行。\n\n正文留在自己的电脑上。';await editor.fill(original);
 const tools=page.getByRole('dialog').locator('onhold-compose-translation');await tools.waitFor({state:'visible'});
 assert.equal(await editor.locator('onhold-compose-translation').count(),0,'tools are not editable post content');
 assert.equal(await page.locator('onhold-draft-assistant,onhold-post-analysis').count(),0,'no side panels');assert.equal(await tools.getByRole('tab').count(),0);
 assert.ok(await tools.evaluate(host=>{const editor=host.previousElementSibling.getBoundingClientRect(),row=host.getBoundingClientRect();return row.top>=editor.bottom&&row.left>=editor.left-1&&row.width<=editor.width+1&&getComputedStyle(host).position==='static';}));
 await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>calls.some(message=>['ANALYZE_POST','REWRITE_POST','TRANSLATE_DRAFT'].includes(message.type))),false,'typing never runs a model');
 if(process.env.WRITING_SCREENSHOT_DIR){fs.mkdirSync(process.env.WRITING_SCREENSHOT_DIR,{recursive:true});await page.getByRole('dialog').screenshot({path:path.join(process.env.WRITING_SCREENSHOT_DIR,'草稿翻译-输入框下方.png')});}
 const inputsBeforeTranslation=await page.evaluate(()=>editorInputs.length);await tools.getByRole('button',{name:'一键翻译',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=tweetTextarea_0]').innerText.startsWith('Your text stays'));
 assert.equal(await editor.innerText(),'Your text stays on your computer.\n\nOnly you can publish it.');assert.equal(await tools.getByRole('button',{name:'撤销翻译'}).isVisible(),true);
 assert.deepEqual(await page.evaluate(n=>editorInputs.slice(n),inputsBeforeTranslation),[{type:'insertText',data:'Your text stays on your computer.\n\nOnly you can publish it.'}],'all paragraphs are replaced in one native edit');
 const translatedCalls=await page.evaluate(()=>calls.length);await page.waitForTimeout(950);assert.equal(await page.evaluate(()=>calls.length),translatedCalls);
 await tools.getByRole('button',{name:'撤销翻译'}).click();await tools.getByRole('button',{name:'撤销翻译'}).waitFor({state:'hidden'});assert.equal(await editor.innerText(),original);assert.equal(await page.evaluate(()=>calls.length),translatedCalls,'undo does not call a model');
 await tools.getByRole('combobox',{name:'目标语言'}).selectOption('ja');await tools.getByRole('button',{name:'一键翻译',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=tweetTextarea_0]').innerText.startsWith('本文は'));assert.equal(await page.evaluate(()=>calls.filter(m=>m.type==='TRANSLATE_DRAFT').at(-1).targetLang),'ja');
 await tools.getByRole('button',{name:'撤销翻译'}).click();await tools.getByRole('button',{name:'撤销翻译'}).waitFor({state:'hidden'});
 await page.evaluate(()=>translationDelay=350);await tools.getByRole('button',{name:'一键翻译',exact:true}).click();await editor.fill('我在等待时修改了草稿');await page.waitForTimeout(500);assert.equal(await editor.innerText(),'我在等待时修改了草稿');assert.equal(await tools.getByRole('button',{name:'撤销翻译'}).isVisible(),false);
 await tools.getByRole('button',{name:'一键翻译',exact:true}).click();await tools.getByRole('combobox',{name:'目标语言'}).selectOption('en');await page.waitForTimeout(500);assert.equal(await editor.innerText(),'我在等待时修改了草稿','changing language invalidates an in-flight result');
 await editor.evaluate(node=>node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})));assert.equal(await tools.getByRole('button',{name:'一键翻译',exact:true}).isDisabled(),true);
 await editor.evaluate(node=>{node.textContent='输入法选字完成';node.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));});assert.equal(await tools.getByRole('button',{name:'一键翻译',exact:true}).isEnabled(),true);
 await page.evaluate(()=>{translationDelay=30;failTranslation=true;});await tools.getByRole('button',{name:'一键翻译',exact:true}).click();await tools.getByRole('status').filter({hasText:'模型暂时未连接'}).waitFor();assert.equal(await editor.innerText(),'输入法选字完成');
 await tools.getByRole('button',{name:'一键翻译',exact:true}).click();await tools.getByRole('button',{name:'撤销翻译'}).waitFor();await tools.getByRole('button',{name:'撤销翻译'}).click();await tools.getByRole('button',{name:'撤销翻译'}).waitFor({state:'hidden'});
 await reply.fill('这是评论草稿');const replyTools=page.locator('.reply onhold-compose-translation');await replyTools.getByRole('button',{name:'一键翻译',exact:true}).click();await replyTools.getByRole('button',{name:'撤销翻译'}).waitFor();assert.equal(await editor.innerText(),'输入法选字完成','reply translation cannot replace main draft');await replyTools.getByRole('button',{name:'撤销翻译'}).click();await replyTools.getByRole('button',{name:'撤销翻译'}).waitFor({state:'hidden'});assert.equal(await reply.innerText(),'这是评论草稿');
 assert.equal(await page.locator('#dm + onhold-compose-translation').count(),0,'DM is excluded');
 await editor.fill('a'.repeat(4001));const beforeLong=await page.evaluate(()=>calls.length);await tools.getByRole('button',{name:'一键翻译',exact:true}).click();assert.equal(await page.evaluate(()=>calls.length),beforeLong);assert.ok((await tools.getByRole('status').innerText()).includes('4000'));
 await editor.fill(original);await page.setViewportSize({width:390,height:900});assert.ok(await tools.evaluate(node=>node.getBoundingClientRect().right<=innerWidth));
 await page.emulateMedia({colorScheme:'dark'});await editor.evaluate(node=>node.style.color='rgb(230,230,230)');await page.setViewportSize({width:391,height:900});await page.waitForFunction(()=>document.querySelector('onhold-compose-translation').hasAttribute('data-dark'));assert.equal(await tools.getAttribute('data-dark'),'');
 if(process.env.WRITING_SCREENSHOT_DIR)await page.getByRole('dialog').screenshot({path:path.join(process.env.WRITING_SCREENSHOT_DIR,'草稿翻译-窄屏.png')});
 await editor.fill('等待期间关闭翻译，保留这份草稿');await page.evaluate(()=>translationDelay=350);await tools.getByRole('button',{name:'一键翻译',exact:true}).click();
 await page.evaluate(()=>{settings.composeTranslate=false;listeners.forEach(fn=>fn({type:'CONFIG_CHANGED',config:settings}));});assert.equal(await tools.isVisible(),false);assert.equal(await replyTools.isVisible(),false);await page.waitForTimeout(500);assert.equal(await editor.innerText(),'等待期间关闭翻译，保留这份草稿');
 assert.equal(await page.evaluate(()=>published),0);assert.equal(await page.evaluate(()=>calls.some(message=>message.type==='ANALYZE_POST'||message.type==='REWRITE_POST')),false);assert.deepEqual(errors,[]);
 console.log('Passed: translation-only manifest, inline row after original editor, no side panels or automatic inference, explicit translate/replace/undo, line breaks, target language, stale input/language protection, IME, retry, main/reply isolation, DM exclusion, length guard, narrow/dark layout, disable, no publication.');
}finally{await browser.close();}

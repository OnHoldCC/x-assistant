(() => {
 if(globalThis.__onholdPostBorder||['#x-local-full-reader','#onhold-dashboard-reader'].includes(location.hash))return;
 globalThis.__onholdPostBorder=true;
 const host=document.createElement('onhold-post-border'),root=host.attachShadow({mode:'open'});host.setAttribute('popover','manual');
 root.innerHTML=`<style>:host{display:block;position:fixed;inset:auto;margin:0;padding:0;border:0;overflow:visible;height:28px;width:max-content;max-width:calc(100% - 20px);background:transparent;z-index:1;color:#536471;font:${OnHoldUI.typeScale.caption}px/1.5 ${OnHoldUI.font}}*{box-sizing:border-box}.row{display:flex;align-items:center;gap:10px;height:28px;white-space:nowrap;overflow:auto;scrollbar-width:none}.row::-webkit-scrollbar{display:none}:host::backdrop{pointer-events:none;background:transparent}button{font:inherit;font-weight:650;color:#1d9bf0;border:0;background:transparent;min-height:28px;padding:0 4px;cursor:pointer;flex:none}button:disabled{opacity:.6;cursor:wait}button:focus-visible{outline:2px solid #1d9bf0;outline-offset:-2px}.metrics{display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}.status{color:#ad5229}:host([data-dark]){color:#a1aeb8}:host([data-dark]) button{color:#71c9f8}</style><div class="row"><button type="button" class="score" title="按内容分档评估，不是 X 官方评分或曝光预测；点击评分。">帖子评分 —</button><span class="metrics" title="加权参考值：（0.66×赞＋5×评＋转）÷浏览×100%，非 X 官方互动率"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 7V4H6l6 8-6 8h12v-3"/></svg><span class="metric-value"></span></span><span class="status" role="status"></span></div>`;
 const extra=document.createElement('style');extra.textContent='.row{font-variant-numeric:tabular-nums;justify-content:flex-end;gap:6px;color:#1684c6;font-size:12px}.details{position:fixed;inset:auto;margin:0;width:264px;max-height:calc(100vh - 32px);overflow:auto;border:1px solid #cfe0eb;border-radius:12px;background:#fff;color:#25323c;padding:16px;box-shadow:0 8px 30px #10202f1a;font:14px/1.6 '+OnHoldUI.font+'}.details[hidden]{display:none}.details header{font-size:18px;display:flex;align-items:center;justify-content:space-between;font-weight:700}.details dl{display:grid;grid-template-columns:1fr auto;gap:8px;font-size:14px}.details dd{margin:0;font-variant-numeric:tabular-nums}.details p{font-size:12px;color:#75838d}.details::backdrop{pointer-events:none;background:transparent}:host([data-dark]) .details{background:#15202b;color:#e5ebef;border-color:#344654}';root.append(extra);
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='详情 ›';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','post-details');root.querySelector('.row').append(toggle);
 const saveBookmark=document.createElement('button');saveBookmark.type='button';saveBookmark.className='save-bookmark';saveBookmark.setAttribute('aria-label','收藏到 OnHold');saveBookmark.setAttribute('aria-pressed','false');saveBookmark.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span>收藏</span>';root.querySelector('.row').insertBefore(saveBookmark,toggle);
 const panel=document.createElement('section');panel.id='post-details';panel.className='details';panel.hidden=true;panel.setAttribute('popover','manual');panel.setAttribute('aria-label','帖子详情');panel.innerHTML='<header>帖子详情<button type="button" class="collapse">收起 ‹</button></header><section class="detail-block"><h3>帖子评分</h3><span class="detail-score-number" title="内容参考，非 X 官方评分或曝光预测">—</span></section><section class="detail-block"><h3>加权互动率</h3><span class="detail-rate" title="（0.66×赞＋5×评＋转）÷浏览×100%。参考值，不是 X 官方互动率或推荐概率。">—</span></section><section class="detail-block tag-block"><div class="tag-heading"><h3>原文标签</h3><button type="button" class="copy-tags" aria-label="复制原文标签" aria-live="polite" disabled>复制</button></div><div class="tag-list original-tags"></div></section><section class="detail-block tag-block"><div class="tag-heading"><h3>推荐标签</h3><button type="button" class="copy-tags" aria-label="复制推荐标签" aria-live="polite" disabled>复制</button></div><div class="tag-list recommended-tags"></div></section>';root.append(panel);
 const blocks=document.createElement('style');blocks.textContent='.details{width:264px;padding:12px;scrollbar-width:none;font-size:12px}.details::-webkit-scrollbar{display:none}.details header{font-size:14px;padding-bottom:4px}.details header button{font-weight:500}.detail-block{display:flex;align-items:baseline;justify-content:space-between;gap:8px;border-top:1px solid #e5edf3;padding-top:8px;margin-top:8px}.detail-block h3{font-size:12px;font-weight:500;margin:0;color:#75838d}.detail-score-number,.detail-rate{font-size:14px;font-variant-numeric:tabular-nums}.detail-rate{color:#1684c6}.tag-block{display:block}.tag-heading{display:flex;align-items:center;justify-content:space-between}.copy-tags{font-weight:500}.tag-list{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;color:#1684c6}.tag-list span{overflow-wrap:anywhere}:host([data-dark]) .detail-block{border-color:#344654}';root.append(blocks);
 const collection=document.createElement('section');collection.className='detail-block tag-block';collection.innerHTML='<h3>收藏标签</h3><form class="collection-form"><input aria-label="收藏标签" placeholder="选题、案例，用逗号分隔" maxlength="330"><button type="submit">保存收藏</button><button type="button" class="remove-bookmark" hidden>移除</button></form>';panel.append(collection);
 const collectionStyle=document.createElement('style');collectionStyle.textContent='.save-bookmark{display:inline-flex;align-items:center;gap:3px}.save-bookmark[aria-pressed=true] svg{fill:currentColor}.collection-form{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.collection-form input{width:100%;font:inherit;color:inherit;border:1px solid #cfe0eb;border-radius:8px;padding:7px;background:transparent}.collection-form button{min-height:32px}.collection-form [hidden]{display:none}';root.append(collectionStyle);
 let bookmarkSaved=false,bookmarkBusy=false;
 function bookmarkedPost(){const source=reading(selected),link=source&&XAIMetrics.statusLink(source.url);if(!source||!link)throw Error('请先打开可识别的 X 帖子');return {id:link.id,author:link.author,url:'https://x.com/'+link.author+'/status/'+link.id,text:(source.original??source.text).slice(0,24000),metrics:Object.fromEntries(Object.entries({views:'a[href$="/analytics"]',likes:'[data-testid="like"],[data-testid="unlike"]',replies:'[data-testid="reply"]',reposts:'[data-testid="retweet"],[data-testid="unretweet"]'}).map(([name,selector])=>[name,count(selector)]).filter(([,value])=>value))};}
 function renderBookmark(){saveBookmark.setAttribute('aria-pressed',String(bookmarkSaved));saveBookmark.disabled=bookmarkBusy;saveBookmark.querySelector('span').textContent=bookmarkBusy?'保存中…':bookmarkSaved?'已收藏':'收藏';collection.querySelector('.remove-bookmark').hidden=!bookmarkSaved;}
 async function storeBookmark(remove=false){if(bookmarkBusy||!selected)return;const article=selected,mine=run;bookmarkBusy=true;renderBookmark();try{const post=bookmarkedPost(),tags=collection.querySelector('input').value.split(/[,，]/).map(value=>value.trim()).filter(Boolean);const response=await chrome.runtime.sendMessage({type:'BOOKMARK_SAVE',data:remove?{remove:true,author:post.author,id:post.id}:{post,tags}});if(!response?.ok)throw Error(response?.error||'收藏未保存');if(article===selected&&mine===run){bookmarkSaved=!remove;status.textContent=remove?'已移除收藏':'已保存到 OnHold';}}catch(error){if(article===selected&&mine===run)status.textContent=error.message;}finally{if(article===selected&&mine===run){bookmarkBusy=false;renderBookmark();}}}
 saveBookmark.onclick=()=>bookmarkSaved?expand(true):storeBookmark();collection.querySelector('form').onsubmit=event=>{event.preventDefault();storeBookmark();};collection.querySelector('.remove-bookmark').onclick=()=>storeBookmark(true);
 const button=root.querySelector('.score'),metrics=root.querySelector('.metrics'),status=root.querySelector('.status');
 const style=document.createElement('style');style.textContent='article[data-onhold-current]{outline:1px solid #1d9bf0;outline-offset:-1px;border-radius:12px}';document.head.append(style);
 let selected=null,result=null,key='',run=0,timer;
 const own=(article,node)=>node.closest('article[data-testid="tweet"]')===article&&!node.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"]');
 const reading=article=>globalThis.OnHoldAdFilter?.shouldHide(article)?null:globalThis.OnHoldXReading?.read(article);
 const blocked=()=>[...document.querySelectorAll('[role="dialog"]')].some(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.opacity!=='0';});
 function select(article){if(article&&globalThis.OnHoldAdFilter?.shouldHide(article)){choose(null);globalThis.OnHoldAdFilter.preview(article);return;}choose(article);}
 function count(selector){const node=[...selected.querySelectorAll(selector)].find(node=>own(selected,node));return node?XAIMetrics.parseCount(node.getAttribute('aria-label')||node.innerText):null;}
 function render(){
  if(!selected?.isConnected)return;
  if(blocked()){choose(null);return;}
  const bounds=selected.getBoundingClientRect();host.style.top=(bounds.top-28)+'px';host.style.right=Math.max(10,innerWidth-bounds.right+10)+'px';host.style.maxWidth=Math.max(0,bounds.width-20)+'px';
  const source=reading(selected);if(!source){choose(null);return;}
  if(key!==source.text){key=source.text;result=null;run++;button.disabled=false;status.textContent='';}
  selected.setAttribute('data-onhold-current','');
  const rates=XAIMetrics.interactionRates({views:count('a[href$="/analytics"]'),likes:count('[data-testid="like"],[data-testid="unlike"]'),replies:count('[data-testid="reply"]'),reposts:count('[data-testid="retweet"],[data-testid="unretweet"]')});
  const rate=rates.weighted===null?'—':(rates.approximate?'≈':'')+rates.weighted.toFixed(2)+'%';metrics.querySelector('.metric-value').textContent=rate;metrics.setAttribute('aria-label','加权参考值 '+rate);
  button.textContent=result?'帖子评分 '+result.potential.score+'/100':button.disabled?'评分中…':'帖子评分 —';
  const rgb=getComputedStyle(source.node).color.match(/\d+/g)||[];host.toggleAttribute('data-dark',rgb.slice(0,3).reduce((sum,n)=>sum+Number(n),0)>480);
  renderDetails();
 }
 function renderDetails(){
  if(panel.hidden||!selected)return;
  const rates=XAIMetrics.interactionRates({views:count('a[href$="/analytics"]'),likes:count('[data-testid="like"],[data-testid="unlike"]'),replies:count('[data-testid="reply"]'),reposts:count('[data-testid="retweet"],[data-testid="unretweet"]')});
  panel.querySelector('.detail-score-number').textContent=result?result.potential.score+' / 100':button.disabled?'评分中…':'—';
  panel.querySelector('.detail-rate').textContent=rates.weighted===null?'—':(rates.approximate?'≈':'')+rates.weighted.toFixed(2)+'%';
  const source=reading(selected),original=source.original??source.text;
  const originalTags=[...original.replace(/https?:\/\/\S+/gu,'').matchAll(/[#＃]([\p{L}\p{M}\p{N}_]+)/gu)].map(match=>'#'+match[1]);
  const recommended=(result?.keywords||[]).map(item=>'#'+item.term.replace(/^[#＃]+/u,''));
  for(const [selector,terms] of [['.original-tags',originalTags],['.recommended-tags',recommended]]){
   const labels=panel.querySelector(selector);labels.replaceChildren();for(const term of new Set(terms)){const tag=document.createElement('span');tag.textContent=term;labels.append(tag);}labels.previousElementSibling.querySelector('button').disabled=!labels.childElementCount;if(!labels.childElementCount)labels.textContent='—';
  }
  const rect=selected.getBoundingClientRect(),width=Math.min(264,innerWidth-24);panel.style.width=width+'px';panel.style.left=Math.max(12,Math.min(rect.right+12,innerWidth-width-12))+'px';const top=Math.max(16,Math.min(rect.top,innerHeight-360));panel.style.top=top+'px';panel.style.maxHeight=Math.max(100,innerHeight-top-16)+'px';
 }
 function expand(value){panel.hidden=!value;toggle.textContent=value?'收起 ‹':'详情 ›';toggle.setAttribute('aria-expanded',String(value));if(value){renderDetails();panel.showPopover();}else panel.hidePopover();}
 toggle.onclick=()=>expand(panel.hidden);panel.querySelector('.collapse').onclick=()=>expand(false);
 for(const copy of panel.querySelectorAll('.copy-tags'))copy.onclick=async()=>{
  const text=[...copy.closest('.tag-block').querySelectorAll('.tag-list span')].map(tag=>tag.textContent).join(' ');if(!text)return;
  const mine=run;copy.disabled=true;
  try{await navigator.clipboard.writeText(text);if(mine===run)copy.textContent='已复制';}catch{if(mine===run)copy.textContent='重试复制';}
  finally{if(mine===run){copy.disabled=false;setTimeout(()=>{if(mine===run)copy.textContent='复制';},1600);}}
 };
 function choose(article){
  if(article===selected){render();return;}
  if(selected)selected.removeAttribute('data-onhold-current');
  if(host.matches(':popover-open'))host.hidePopover();expand(false);selected=article;result=null;key='';run++;host.remove();button.disabled=false;status.textContent='';for(const copy of panel.querySelectorAll('.copy-tags'))copy.textContent='复制';
  bookmarkSaved=false;bookmarkBusy=false;collection.querySelector('input').value='';renderBookmark();
  if(!article)return;
  article.prepend(host);host.showPopover();render();
  const mine=run;try{const post=bookmarkedPost();chrome.runtime.sendMessage({type:'BOOKMARK_GET',data:{get:true,author:post.author,id:post.id}}).then(response=>{if(mine===run&&article===selected&&response?.ok){bookmarkSaved=response.data?.saved===true;collection.querySelector('input').value=(response.data?.tags||[]).join(', ');renderBookmark();}}).catch(()=>{});}catch{}

 }
 function nearest(){
  if(blocked()||globalThis.OnHoldAdFilter?.previewing){choose(null);return;}
  const articles=[...document.querySelectorAll('article[data-testid="tweet"]')].filter(article=>{const rect=article.getBoundingClientRect();return rect.bottom>90&&rect.top<innerHeight&&(globalThis.OnHoldAdFilter?.shouldHide(article)||reading(article));});
  const distance=article=>{const rect=article.getBoundingClientRect();return Math.abs((rect.top+rect.bottom)/2-innerHeight*.45);};
  articles.sort((a,b)=>distance(a)-distance(b));
  select(articles.includes(selected)&&distance(selected)<distance(articles[0])+60?selected:articles[0]||null);
 }
 button.onclick=async()=>{
  const article=selected,source=reading(article);if(!source||button.disabled)return;
  const mine=++run;button.disabled=true;status.textContent='';render();
  try{
   const response=await chrome.runtime.sendMessage({type:'ANALYZE_POST',manual:true,text:source.text,toChinese:false,sourceKind:source.native?'x_grok_translation':'original',originalText:source.original,inputComplete:source.complete,sourceUrl:source.url});
   if(selected!==article||run!==mine||reading(article)?.text!==source.text)return;
   if(!response?.ok)throw Error(response?.error||'评分未完成，请重试');
   if(!Number.isFinite(response.data?.potential?.score))throw Error('评分结果不完整');
   result=response.data;button.title='内容参考，非 X 官方评分或曝光预测。'+(result.potential.rows||[]).map(row=>row.label+' '+row.score).join('；');
  }catch(error){if(selected===article&&run===mine)status.textContent=error.message;}
  finally{if(selected===article&&run===mine){button.disabled=false;render();}}
 };
 host.addEventListener('click',event=>event.stopPropagation());
 document.addEventListener('pointerover',event=>{if(blocked())return;const article=event.target.closest?.('article[data-testid="tweet"]');if(article&&(globalThis.OnHoldAdFilter?.shouldHide(article)||reading(article)))select(article);});
 document.addEventListener('focusin',event=>{if(blocked())return;const article=event.target.closest?.('article[data-testid="tweet"]');if(article&&(globalThis.OnHoldAdFilter?.shouldHide(article)||reading(article)))select(article);});
 new MutationObserver(()=>{if(!timer)timer=setTimeout(()=>{timer=null;selected?.isConnected?render():nearest();},250);}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','role','hidden','aria-hidden']});
 addEventListener('scroll',()=>{if(!selected||selected.getBoundingClientRect().bottom<90||selected.getBoundingClientRect().top>innerHeight)nearest();else render();},{passive:true});
 document.addEventListener('onhold-ad-visibility',nearest);document.addEventListener('onhold-ad-preview',()=>choose(null));nearest();
})();

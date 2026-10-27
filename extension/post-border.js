(() => {
 if(globalThis.__onholdPostBorder||['#x-local-full-reader','#onhold-dashboard-reader'].includes(location.hash))return;
 globalThis.__onholdPostBorder=true;
 const host=document.createElement('onhold-post-border'),root=host.attachShadow({mode:'open'});host.setAttribute('popover','manual');
 root.innerHTML=`<style>:host{display:block;position:fixed;inset:auto;margin:0;padding:0;border:0;overflow:visible;height:28px;width:max-content;max-width:calc(100% - 20px);background:transparent;z-index:1;color:#536471;font:${OnHoldUI.typeScale.caption}px/1.5 ${OnHoldUI.font}}*{box-sizing:border-box}.row{display:flex;align-items:center;gap:10px;height:28px;white-space:nowrap;overflow:auto;scrollbar-width:none}.row::-webkit-scrollbar{display:none}:host::backdrop{pointer-events:none;background:transparent}button{font:inherit;font-weight:650;color:#1d9bf0;border:0;background:transparent;min-height:28px;padding:0 4px;cursor:pointer;flex:none}button:disabled{opacity:.6;cursor:wait}button:focus-visible{outline:2px solid #1d9bf0;outline-offset:-2px}.metrics{font-variant-numeric:tabular-nums}.status{color:#ad5229}:host([data-dark]){color:#a1aeb8}:host([data-dark]) button{color:#71c9f8}</style><div class="row"><button type="button" class="score" title="按内容分档评估，不是 X 官方评分或曝光预测；点击评分。">帖子评分 —</button><span class="metrics"></span><span class="status" role="status"></span></div>`;
 const extra=document.createElement('style');extra.textContent='.row{font-variant-numeric:tabular-nums;justify-content:flex-end;gap:6px;color:#1684c6;font-size:12px}.details{position:fixed;inset:auto;margin:0;width:264px;max-height:calc(100vh - 32px);overflow:auto;border:1px solid #cfe0eb;border-radius:12px;background:#fff;color:#25323c;padding:16px;box-shadow:0 8px 30px #10202f1a;font:14px/1.6 '+OnHoldUI.font+'}.details[hidden]{display:none}.details header{font-size:18px;display:flex;align-items:center;justify-content:space-between;font-weight:700}.details dl{display:grid;grid-template-columns:1fr auto;gap:8px;font-size:14px}.details dd{margin:0;font-variant-numeric:tabular-nums}.details p{font-size:12px;color:#75838d}.details::backdrop{pointer-events:none;background:transparent}:host([data-dark]) .details{background:#15202b;color:#e5ebef;border-color:#344654}';root.append(extra);
 const toggle=document.createElement('button');toggle.type='button';toggle.textContent='详情 ›';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','post-details');root.querySelector('.row').append(toggle);
 const panel=document.createElement('section');panel.id='post-details';panel.className='details';panel.hidden=true;panel.setAttribute('popover','manual');panel.setAttribute('aria-label','帖子详情');panel.innerHTML='<header>帖子详情<button type="button" class="collapse">收起 ‹</button></header><section class="detail-block"><h3>帖子评分</h3><span class="detail-score-number" title="内容参考，非 X 官方评分或曝光预测">—</span></section><section class="detail-block"><h3>加权互动率</h3><span class="detail-rate" title="（0.66×赞＋5×评＋转）÷浏览×100%。参考值，不是 X 官方互动率或推荐概率。">—</span></section><section class="detail-block tag-block"><div class="tag-heading"><h3>原文标签</h3><button type="button" class="copy-tags" aria-label="复制原文标签" aria-live="polite" disabled>复制</button></div><div class="tag-list original-tags"></div></section><section class="detail-block tag-block"><div class="tag-heading"><h3>推荐标签</h3><button type="button" class="copy-tags" aria-label="复制推荐标签" aria-live="polite" disabled>复制</button></div><div class="tag-list recommended-tags"></div></section>';root.append(panel);
 const blocks=document.createElement('style');blocks.textContent='.details{width:264px;padding:12px;scrollbar-width:none;font-size:12px}.details::-webkit-scrollbar{display:none}.details header{font-size:14px;padding-bottom:4px}.details header button{font-weight:500}.detail-block{display:flex;align-items:baseline;justify-content:space-between;gap:8px;border-top:1px solid #e5edf3;padding-top:8px;margin-top:8px}.detail-block h3{font-size:12px;font-weight:500;margin:0;color:#75838d}.detail-score-number,.detail-rate{font-size:14px;font-variant-numeric:tabular-nums}.detail-rate{color:#1684c6}.tag-block{display:block}.tag-heading{display:flex;align-items:center;justify-content:space-between}.copy-tags{font-weight:500}.tag-list{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:4px;color:#1684c6}.tag-list span{overflow-wrap:anywhere}:host([data-dark]) .detail-block{border-color:#344654}';root.append(blocks);
 const button=root.querySelector('.score'),metrics=root.querySelector('.metrics'),status=root.querySelector('.status');
 const style=document.createElement('style');style.textContent='article[data-onhold-current]{outline:1px solid #1d9bf0;outline-offset:-1px;border-radius:12px}';document.head.append(style);
 let selected=null,saved=null,result=null,key='',run=0,timer;
 const own=(article,node)=>node.closest('article[data-testid="tweet"]')===article&&!node.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"]');
 const reading=article=>globalThis.OnHoldAdFilter?.shouldHide(article)?null:globalThis.OnHoldXReading?.read(article);
 function count(selector){const node=[...selected.querySelectorAll(selector)].find(node=>own(selected,node));return node?XAIMetrics.parseCount(node.getAttribute('aria-label')||node.innerText):null;}
 function render(){
  if(!selected?.isConnected)return;
  if(document.querySelector('[role=dialog]')){choose(null);return;}
  const bounds=selected.getBoundingClientRect();host.style.top=(bounds.top-28)+'px';host.style.right=Math.max(10,innerWidth-bounds.right+10)+'px';host.style.maxWidth=Math.max(0,bounds.width-20)+'px';
  const source=reading(selected);if(!source){choose(null);return;}
  if(key!==source.text){key=source.text;result=null;run++;button.disabled=false;status.textContent='';}
  selected.setAttribute('data-onhold-current','');
  const rates=XAIMetrics.interactionRates({views:count('a[href$="/analytics"]'),likes:count('[data-testid="like"],[data-testid="unlike"]'),replies:count('[data-testid="reply"]'),reposts:count('[data-testid="retweet"],[data-testid="unretweet"]')});
  metrics.textContent='加权互动率 '+(rates.weighted===null?'—':(rates.approximate?'≈':'')+rates.weighted.toFixed(2)+'%');
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
 function expand(value){panel.hidden=!value;toggle.textContent=value?'收起 ‹':'详情 ›';toggle.setAttribute('aria-expanded',String(value));if(value){renderDetails();panel.showPopover();if(!result&&!button.disabled)button.click();}else panel.hidePopover();}
 toggle.onclick=()=>expand(panel.hidden);panel.querySelector('.collapse').onclick=()=>expand(false);
 for(const copy of panel.querySelectorAll('.copy-tags'))copy.onclick=async()=>{
  const text=[...copy.closest('.tag-block').querySelectorAll('.tag-list span')].map(tag=>tag.textContent).join(' ');if(!text)return;
  const mine=run;copy.disabled=true;
  try{await navigator.clipboard.writeText(text);if(mine===run)copy.textContent='已复制';}catch{if(mine===run)copy.textContent='重试复制';}
  finally{if(mine===run){copy.disabled=false;setTimeout(()=>{if(mine===run)copy.textContent='复制';},1600);}}
 };
 function choose(article){
  if(article===selected){render();return;}
  if(selected){selected.removeAttribute('data-onhold-current');selected.style.marginTop=saved.marginTop;selected.style.position=saved.position;}
  if(host.matches(':popover-open'))host.hidePopover();expand(false);selected=article;result=null;key='';run++;host.remove();button.disabled=false;status.textContent='';for(const copy of panel.querySelectorAll('.copy-tags'))copy.textContent='复制';
  if(!article)return;
  const computed=getComputedStyle(article);saved={marginTop:article.style.marginTop,position:article.style.position};
  article.style.marginTop=(parseFloat(computed.marginTop)||0)+32+'px';if(computed.position==='static')article.style.position='relative';
  article.prepend(host);host.showPopover();render();
 }
 function nearest(){
  const articles=[...document.querySelectorAll('article[data-testid="tweet"]')].filter(article=>{const rect=article.getBoundingClientRect();return rect.bottom>90&&rect.top<innerHeight&&reading(article);});
  const distance=article=>{const rect=article.getBoundingClientRect();return Math.abs((rect.top+rect.bottom)/2-innerHeight*.45);};
  articles.sort((a,b)=>distance(a)-distance(b));
  choose(articles.includes(selected)&&distance(selected)<distance(articles[0])+60?selected:articles[0]||null);
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
 document.addEventListener('pointerover',event=>{const article=event.target.closest?.('article[data-testid="tweet"]');if(article&&reading(article))choose(article);});
 document.addEventListener('focusin',event=>{const article=event.target.closest?.('article[data-testid="tweet"]');if(article&&reading(article))choose(article);});
 new MutationObserver(()=>{if(!timer)timer=setTimeout(()=>{timer=null;selected?.isConnected?render():nearest();},250);}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label']});
 addEventListener('scroll',()=>{if(!selected||selected.getBoundingClientRect().bottom<90||selected.getBoundingClientRect().top>innerHeight)nearest();else render();},{passive:true});
 document.addEventListener('onhold-ad-visibility',nearest);nearest();
})();

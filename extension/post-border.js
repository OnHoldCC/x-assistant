(() => {
 if(globalThis.__onholdPostBorder||['#x-local-full-reader','#onhold-dashboard-reader','#onhold-publisher','#onhold-reply'].includes(location.hash))return;
 globalThis.__onholdPostBorder=true;
 const host=document.createElement('onhold-post-border'),root=host.attachShadow({mode:'open'});host.setAttribute('popover','manual');
 root.innerHTML=`<style>:host{display:block;position:fixed;inset:auto;margin:0;padding:0;border:0;overflow:visible;height:auto;width:104px;max-width:calc(100% - 24px);background:#fff;border:1px solid #cfe0eb;border-radius:10px;box-shadow:0 4px 16px #10202f14;z-index:1;color:#536471;font:${OnHoldUI.typeScale.caption}px/1.5 ${OnHoldUI.font}}*{box-sizing:border-box}.row{display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:6px;white-space:normal}.row::-webkit-scrollbar{display:none}:host::backdrop{pointer-events:none;background:transparent}button{font:inherit;font-weight:650;color:#1d9bf0;border:0;background:transparent;min-height:36px;padding:4px;cursor:pointer;flex:none}button:disabled{opacity:.7;cursor:wait}.loading{display:inline-block;width:12px;height:12px;margin-right:5px;vertical-align:-2px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:onhold-spin .8s linear infinite}@keyframes onhold-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.loading{animation:none}}button:focus-visible{outline:2px solid #1d9bf0;outline-offset:-2px}.metrics{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:0;min-height:36px;font-variant-numeric:tabular-nums}.status{color:#ad5229;text-align:center;overflow-wrap:anywhere}.status:empty{display:none}@media(pointer:coarse){button{min-height:44px}}:host([data-dark]){color:#a1aeb8;background:#15202b;border-color:#344654}:host([data-dark]) button{color:#71c9f8}</style><div class="row" role="group" aria-label="帖子工具"><span class="metrics" title="加权参考值：（0.66×赞＋5×评＋转）÷浏览×100%，非 X 官方互动率"><span>加权互动率</span><span class="metric-value"></span></span><span class="status" role="status"></span></div>`;
 const rewrite=document.createElement('button');rewrite.type='button';rewrite.className='queue-rewrite';rewrite.textContent='一键改写';rewrite.title='交给 Codex CLI 润色并加入后台定时任务，设置时间后通过 X 首页发布';root.querySelector('.row').append(rewrite);
 const similar=document.createElement('button');similar.type='button';similar.className='queue-similar';similar.textContent='发同款';similar.title='将当前原帖交给 Codex 分析并生成新正文；后台校验固定格式后自动发布到当前连接的 X 账号';root.querySelector('.row').append(similar);
 const collectionStyle=document.createElement('style');collectionStyle.textContent='.queue-rewrite,.queue-similar{display:inline-flex;align-items:center;justify-content:center;gap:3px;border-radius:6px}.queue-rewrite:hover,.queue-similar:hover{background:#1d9bf010}';root.append(collectionStyle);
 const rewrites=new WeakMap();
 function sourcePost(){const source=reading(selected),link=source&&XAIMetrics.statusLink(source.url);if(!source||!link)throw Error('请先打开可识别的 X 帖子');return {id:link.id,author:link.author.toLowerCase(),url:'https://x.com/'+link.author.toLowerCase()+'/status/'+link.id,text:(source.original??source.text).slice(0,24000),metrics:Object.fromEntries(Object.entries({views:'a[href$="/analytics"]',likes:'[data-testid="like"],[data-testid="unlike"]',replies:'[data-testid="reply"]',reposts:'[data-testid="retweet"],[data-testid="unretweet"]'}).map(([name,selector])=>[name,count(selector)]).filter(([,value])=>value))};}
 async function queueWriting(mode){
  if(!selected)return;
  const article=selected,source=reading(article),contentKey=source&&sourceKey(source),mine=run;
  if(!source||source.complete===false){status.textContent='请先展开原帖全文再生成';return;}
  if(rewrites.get(article)?.[mode]?.key===contentKey)return;
  const entry={key:contentKey,pending:true};rewrites.set(article,{...rewrites.get(article),[mode]:entry});status.textContent='';render();
  try{
   const response=await chrome.runtime.sendMessage({type:'QUEUE_REWRITE',data:{...sourcePost(),mode,discovered_from:location.pathname==='/home'?'for_you':/^\/(explore|search)/.test(location.pathname)?'trending':'post_detail'}});
   if(!response?.ok)throw Error(response?.error||'未加入任务记录');
   entry.pending=false;
   if(article===selected&&mine===run)status.textContent=response.data.duplicate?'此任务已有记录':mode==='replicate'?'已排队：Codex 分析生成、格式校验后自动发布':'已加入任务记录，生成后可查看或复制正文';
  }catch(error){if(rewrites.get(article)?.[mode]===entry)delete rewrites.get(article)[mode];if(article===selected&&mine===run)status.textContent=error.message;}
  finally{if(article===selected&&mine===run)render();}
 }
 rewrite.onclick=()=>queueWriting('rewrite');similar.onclick=event=>{if(event.isTrusted)queueWriting('replicate');};

 const metrics=root.querySelector('.metrics'),status=root.querySelector('.status');
 const style=document.createElement('style');style.textContent='article[data-onhold-current]{outline:1px solid #1d9bf0;outline-offset:-1px;border-radius:12px}';document.head.append(style);
 let selected=null,key='',run=0,timer;
 const sourceKey=source=>JSON.stringify([source.url,source.text,source.original,source.native,source.complete]);
 const own=(article,node)=>node.closest('article[data-testid="tweet"]')===article&&!node.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"]');
 const reading=article=>globalThis.OnHoldAdFilter?.shouldHide(article)?null:globalThis.OnHoldXReading?.read(article);
 const blocked=()=>[...document.querySelectorAll('[role="dialog"]')].some(node=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return rect.width>0&&rect.height>0&&style.visibility!=='hidden'&&style.opacity!=='0';});
 function select(article){if(article&&globalThis.OnHoldAdFilter?.shouldHide(article)){choose(null);globalThis.OnHoldAdFilter.preview(article);return;}choose(article);}
 function count(selector){const node=[...selected.querySelectorAll(selector)].find(node=>own(selected,node));return node?XAIMetrics.parseCount(node.getAttribute('aria-label')||node.innerText):null;}
 function render(){
  if(!selected?.isConnected)return;
  if(blocked()){choose(null);return;}
  const bounds=selected.getBoundingClientRect(),width=innerWidth<600?88:104;
  host.style.width=width+'px';
  // shortcut: without a side gutter, dock at the viewport edge; use a drawer if narrow-screen overlap becomes a problem.
  const left=bounds.right+width+24<=innerWidth?bounds.right+12:bounds.left-width-12>=12?bounds.left-width-12:innerWidth-width-12;
  host.style.left=Math.max(12,left)+'px';
  const source=reading(selected);if(!source){choose(null);return;}
  if(key!==sourceKey(source)){key=sourceKey(source);run++;status.textContent='';}
  selected.setAttribute('data-onhold-current','');
  const rates=XAIMetrics.interactionRates({views:count('a[href$="/analytics"]'),likes:count('[data-testid="like"],[data-testid="unlike"]'),replies:count('[data-testid="reply"]'),reposts:count('[data-testid="retweet"],[data-testid="unretweet"]')});
  const rate=rates.weighted===null?'—':(rates.approximate?'≈':'')+rates.weighted.toFixed(2)+'%';metrics.querySelector('.metric-value').textContent=rate;metrics.setAttribute('aria-label','加权参考值 '+rate);
  const rgb=getComputedStyle(source.node).color.match(/\d+/g)||[];host.toggleAttribute('data-dark',rgb.slice(0,3).reduce((sum,n)=>sum+Number(n),0)>480);
  host.style.top=Math.max(76,Math.min(bounds.top,innerHeight-host.getBoundingClientRect().height-12))+'px';
  for(const [mode,control,label] of [['rewrite',rewrite,'一键改写'],['replicate',similar,'发同款']]){
   const entry=rewrites.get(selected)?.[mode],queued=entry?.key===key;
   control.disabled=queued;control.textContent=queued?entry.pending?'入队中…':'已入队':label;
   control.setAttribute('aria-busy',String(queued&&entry.pending));
  }
 }
 function choose(article){
  if(article===selected){render();return;}
  if(selected)selected.removeAttribute('data-onhold-current');
  if(host.matches(':popover-open'))host.hidePopover();selected=article;key='';run++;host.remove();status.textContent='';
  if(!article)return;
  article.prepend(host);host.showPopover();render();

 }
 function nearest(){
  if(blocked()||globalThis.OnHoldAdFilter?.previewing){choose(null);return;}
  const articles=[...document.querySelectorAll('article[data-testid="tweet"]')].filter(article=>{const rect=article.getBoundingClientRect();return rect.bottom>90&&rect.top<innerHeight&&(globalThis.OnHoldAdFilter?.shouldHide(article)||reading(article));});
  const distance=article=>{const rect=article.getBoundingClientRect();return Math.abs((rect.top+rect.bottom)/2-innerHeight*.45);};
  articles.sort((a,b)=>distance(a)-distance(b));
  select(articles.includes(selected)&&distance(selected)<distance(articles[0])+60?selected:articles[0]||null);
 }
 host.addEventListener('click',event=>event.stopPropagation());
 document.addEventListener('pointerover',event=>{if(blocked())return;const article=event.target.closest?.('article[data-testid="tweet"]');if(article&&(globalThis.OnHoldAdFilter?.shouldHide(article)||reading(article)))select(article);});
 document.addEventListener('focusin',event=>{if(blocked())return;const article=event.target.closest?.('article[data-testid="tweet"]');if(article&&(globalThis.OnHoldAdFilter?.shouldHide(article)||reading(article)))select(article);});
 new MutationObserver(()=>{if(!timer)timer=setTimeout(()=>{timer=null;selected?.isConnected?render():nearest();},250);}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['aria-label','role','hidden','aria-hidden']});
 addEventListener('scroll',()=>{if(!selected||selected.getBoundingClientRect().bottom<90||selected.getBoundingClientRect().top>innerHeight)nearest();else render();},{passive:true});
 addEventListener('resize',()=>selected&&render());
 document.addEventListener('onhold-ad-visibility',nearest);document.addEventListener('onhold-ad-preview',()=>choose(null));nearest();
})();

(() => {
 if(globalThis.OnHoldAdFilter)return;
 let enabled=true,timer;
 const hidden=new Map(),animations=new Map(),reducedMotion=matchMedia('(prefers-reduced-motion: reduce)'),labels=/^(?:Ad|Ads|Promoted|Sponsored|广告|廣告|推广|推廣)$/i;
 const own=(article,node)=>node.closest('article[data-testid="tweet"]')===article&&!node.closest('[data-testid="tweetText"],[data-testid="quoteTweet"],[data-testid="card.wrapper"],a,[role="link"],button,[role="button"]');
 function isAd(article){
  if(article.parentElement?.closest('article[data-testid="tweet"]'))return false;
  if([...article.querySelectorAll('[data-testid="promotedIndicator"],[data-testid="adIndicator"]')].some(node=>own(article,node)))return true;
  const body=article.querySelector('[data-testid="tweetText"],[data-testid="tweetPhoto"],[data-testid="videoPlayer"]');
  return [...article.querySelectorAll('span')].some(node=>own(article,node)&&labels.test(node.textContent.trim())&&(!body||!!(node.compareDocumentPosition(body)&Node.DOCUMENT_POSITION_FOLLOWING)));
 }
 const shouldHide=article=>enabled&&isAd(article);
 const style=document.createElement('style');style.textContent='[data-onhold-ad-hidden]{display:none!important}';document.head.append(style);
 function cancel(article){
  const job=animations.get(article);if(!job)return;
  animations.delete(article);job.effects.forEach(effect=>effect.cancel());job.dust.remove();article.removeAttribute('data-onhold-ad-dissolving');
 }
 function finish(article,cell){
  cancel(article);
  if(hidden.get(article)===cell&&shouldHide(article)){article.setAttribute('data-onhold-ad-hidden','');cell.setAttribute('data-onhold-ad-hidden','');}
 }
 function dissolve(article,cell){
  const rect=article.getBoundingClientRect();
  if(document.hidden||reducedMotion.matches||animations.size>=2||rect.width<=0||rect.bottom<=0||rect.top>=innerHeight){finish(article,cell);return;}
  const dust=document.createElement('onhold-ad-dust');dust.setAttribute('aria-hidden','true');dust.inert=true;
  dust.style.cssText='position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:2147482999;contain:strict';
  const effects=[],color=getComputedStyle(article).color;
  // Draw new particles rather than clone an ad's images or tracking elements.
  for(let index=0;index<64;index++){
   const grain=document.createElement('span'),size=2+index%6;
   grain.style.cssText=`position:absolute;left:${rect.left+rect.width*((index*17%67)/67)}px;top:${rect.top+rect.height*((index*23%71)/71)}px;width:${size*(index%3?1:2.5)}px;height:${size}px;background:${color};border-radius:${index%3?"50%":"1px"};opacity:0`;
   dust.append(grain);
   const distance=140+index%11*25,lift=-50+index%13*9,turn=index%2?170:-140;
   effects.push(grain.animate([
    {opacity:0,transform:'translate(0,0) rotate(0deg) scale(1)'},
    {opacity:.85,offset:.2},
    {opacity:.7,transform:`translate(${distance*.45}px,${lift-20}px) rotate(${turn*.4}deg) scale(1)`,offset:.6},
    {opacity:0,transform:`translate(${distance}px,${lift}px) rotate(${turn}deg) scale(.5)`}
   ],{duration:1200+index%5*40,delay:180+index%7*30,easing:'cubic-bezier(.3,.1,.6,1)',fill:'both'}));
  }
  document.body.append(dust);article.setAttribute('data-onhold-ad-dissolving','');
  const wind=article.animate([
   {opacity:1,transform:'translateX(0) skewX(0deg)',filter:'blur(0)'},
   {opacity:.94,transform:'translateX(6px) skewX(-.5deg)',filter:'blur(.2px)',offset:.25},
   {opacity:.32,transform:'translateX(42px) skewX(-3deg)',filter:'blur(1.5px)',offset:.65},
   {opacity:0,transform:'translateX(120px) skewX(-6deg)',filter:'blur(4px)'}
  ],{duration:1650,delay:150,easing:'cubic-bezier(.3,.1,.6,1)',fill:'both'});
  effects.push(wind);const job={effects,dust,cell};animations.set(article,job);
  wind.finished.then(()=>{if(animations.get(article)===job)finish(article,cell);}).catch(()=>{});
 }
 function scan(){
  timer=null;let changed=false;
  for(const [article,cell] of hidden)if(!article.isConnected){cancel(article);article.removeAttribute('data-onhold-ad-hidden');cell.removeAttribute('data-onhold-ad-hidden');hidden.delete(article);changed=true;}
  for(const article of document.querySelectorAll('article[data-testid="tweet"]')){
   const previous=hidden.get(article);let cell=null;
   if(shouldHide(article)){
    const wrapper=article.closest('[data-testid="cellInnerDiv"]');
    // Collapse a cell only when it owns this one top-level post.
    cell=wrapper&&[...wrapper.querySelectorAll('article[data-testid="tweet"]')].filter(node=>!node.parentElement.closest('article[data-testid="tweet"]')).length===1?wrapper:article;
   }
   if(previous===cell)continue;
   cancel(article);previous?.removeAttribute('data-onhold-ad-hidden');article.removeAttribute('data-onhold-ad-hidden');
   if(cell){hidden.set(article,cell);dissolve(article,cell);}else hidden.delete(article);
   if(previous||cell)changed=true;
  }
  if(changed)document.dispatchEvent(new CustomEvent('onhold-ad-visibility'));
 }
 const settle=()=>{for(const [article,job] of [...animations])finish(article,job.cell);};
 addEventListener('scroll',settle,{passive:true});addEventListener('resize',settle);reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)settle();});
 globalThis.OnHoldAdFilter={shouldHide};
 const refresh=config=>{enabled=config.hideAds!==false;clearTimeout(timer);scan();};
 chrome.runtime.onMessage.addListener(message=>{if(message.type==='CONFIG_CHANGED')refresh(message.config);});
 new MutationObserver(()=>{if(!timer)timer=setTimeout(scan,50);}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-testid','aria-label']});
 scan();chrome.runtime.sendMessage({type:'GET_PUBLIC_CONFIG'}).then(result=>{if(result?.ok)refresh(result.data);}).catch(()=>{});
})();

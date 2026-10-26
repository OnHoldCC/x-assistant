(() => {
  if(globalThis.__localPageTranslationLoaded||['x.com','twitter.com'].includes(location.hostname))return;
  globalThis.__localPageTranslationLoaded=true;
  const blocks='p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,dd,dt,div';
  const blocked='nav,form,pre,code,kbd,samp,script,style,noscript,textarea,input,select,button,svg,math,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"],[role="navigation"],[role="menu"],[role="tablist"],[aria-hidden="true"],[hidden],x-local-translation,x-compose-translation';
  const states=new Map(),pending=[];
  let config={},generation=0,timer,active=0;
  let pageUrl=location.href;
  const send=async message=>{
    const response=await chrome.runtime.sendMessage(message);
    if(!response?.ok){const error=new Error(response?.error||'本机翻译连接失败');error.retryable=response?.retryable===true;throw error;}
    return response.data;
  };
  const enabled=()=>config.allWebsites&&config.autoTranslate;
  function candidate(node) {
    if(node.closest(blocked)||node.querySelector('input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[role="button"]'))return null;
    if(node.querySelector(blocks))return null;
    if(node.tagName==='DIV'&&node.children.length===1&&node.firstElementChild.tagName==='A')return null;
    const text=XAITranslationUI.readOriginal(node)?.trim();
    if(!text||text.length>12000||!XAITranslationUI.isForeign(text,config.readingTarget||'zh'))return null;
    return text;
  }
  function enqueue(node,state) {
    if(!enabled()||document.hidden||state.queued||state.done)return;
    state.queued=true;pending.push({node,state});drain();
  }
  const visible=new IntersectionObserver(entries=>{
    for(const entry of entries){const state=states.get(entry.target);if(state){state.visible=entry.isIntersecting;if(entry.isIntersecting)enqueue(entry.target,state);}}
  },{rootMargin:'100px'});
  function drain() {
    while(active<2&&pending.length&&enabled()&&!document.hidden) {
      const {node,state}=pending.shift();state.queued=false;
      if(!node.isConnected||states.get(node)!==state||state.generation!==generation||!state.visible)continue;
      active++;
      state.ui.start(true).finally(()=>{active--;state.done=true;drain();});
    }
  }
  function scan() {
    if(pageUrl!==location.href){const url=pageUrl=location.href;refresh({...config,autoTranslate:false,translatePageAllowed:false});send({type:'GET_PUBLIC_CONFIG'}).then(next=>{if(location.href===url)refresh(next);}).catch(()=>{});return;}
    if(!enabled()||document.hidden)return;
    for(const [node,state] of states)if(!node.isConnected||candidate(node)!==state.text){state.ui.remove();visible.unobserve(node);states.delete(node);}
    for(const node of document.querySelectorAll(blocks)) {
      const text=candidate(node);if(!text)continue;
      const old=states.get(node);
      if(old?.ui.host.isConnected)continue;
      old?.ui.remove();visible.unobserve(node);
      const state={text,generation,visible:false,queued:false,done:false};states.set(node,state);
      state.ui=XAITranslationUI.mount(node,text,send,()=>enabled()&&state.generation===generation&&states.get(node)===state&&node.isConnected&&candidate(node)===text,{translationOnly:true,target:config.readingTarget,targetName:config.languages?.[config.readingTarget]});
      visible.observe(node);
    }
  }
  function refresh(next) {
    generation++;config=next;pending.length=0;visible.disconnect();
    for(const state of states.values())state.ui.remove();states.clear();scan();
  }
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='CONFIG_CHANGED')refresh(message.config);});
  new MutationObserver(()=>{if(!timer)timer=setTimeout(()=>{timer=null;scan();},350);}).observe(document.body,{childList:true,subtree:true,characterData:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){scan();for(const [node,state] of states)if(state.visible)enqueue(node,state);drain();}});
  const initialUrl=location.href;send({type:'GET_PUBLIC_CONFIG'}).then(next=>{if(location.href===initialUrl)refresh(next);}).catch(()=>{});
  setInterval(()=>{if(!document.hidden&&pageUrl!==location.href)scan();},1000);
})();

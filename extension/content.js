(() => {
  if (globalThis.__xAIStampLoaded||location.hash==='#onhold-dashboard-reader') return;
  globalThis.__xAIStampLoaded = true;
  let config = {enabled: false, autoTranslate: false, threshold: 0.85};
  let generation = 0;
  let timer;
  let pageUrl=location.href;
  const states = new Map();

  async function send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok){const error=new Error(response?.error || '扩展连接失败');error.retryable=response?.retryable===true;throw error;}
    return response.data;
  }

  function ownMore(article) {
    return [...article.querySelectorAll('[data-testid="tweet-text-show-more-link"],button,[role="button"]')].find(el=>
      !el.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], article article') && /^(Show more|显示更多|展开|查看更多)$/i.test(el.textContent.trim()));
  }
  const originalText = node => globalThis.XAITranslationUI?.readOriginal(node) ?? node.innerText;
  function postUrl(article) {
    for(const link of article.querySelectorAll('a[href]')) {
      if(link.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], article article'))continue;
      const url=new URL(link.getAttribute('href'),location.origin);
      const match=url.pathname.match(/^\/(?:[^/]+\/status\/\d+|i\/web\/status\/\d+)(?=\/|$)/);
      if(['x.com','twitter.com'].includes(url.hostname)&&match)return url.origin+match[0];
    }
    return null;
  }
  function extract(article) {
    if(globalThis.OnHoldAdFilter?.shouldHide(article))return null;
    const textNode = [...article.querySelectorAll('[data-testid="tweetText"]')].find(el =>
      !el.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], article article') && originalText(el).trim());
    if (!textNode) return null;
    const text = originalText(textNode).trim();
    if (!text || text.length > 12000) return null;
    const link = postUrl(article) || '';
    const moreNode=ownMore(article);
    const timed=[...article.querySelectorAll('time')].some(el=>!el.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], article article')&&el.closest('a'));
    return {text, node:textNode, postUrl:link, moreNode, readFull:!!moreNode&&!!link&&timed, key:`${link}\n${text}`};
  }

  if(['#x-local-full-reader','#onhold-dashboard-reader'].includes(location.hash)) {
    const clicked=new WeakSet();
    chrome.runtime.onMessage.addListener((message,sender,respond)=>{
      if(message.type!=='READ_FULL_POST'||sender.id!==chrome.runtime.id)return;
      const article=[...document.querySelectorAll('article[data-testid="tweet"]')].find(el=>
        postUrl(el)?.endsWith('/status/'+message.postId));
      if(!article)return respond({ready:false});
      const more=ownMore(article);
      if(more){if(!clicked.has(more)){clicked.add(more);more.click();}return respond({ready:false});}
      const info=extract(article);respond(info?{ready:true,text:info.text}:{ready:false});
    });
    return;
  }

  const nativeWaits=new WeakMap();
  const inReadingView=article=>{const rect=article.getBoundingClientRect();return !document.hidden&&rect.width>0&&rect.height>0&&rect.bottom>-100&&rect.top<innerHeight+100;};
  function translationBusy(article,mode){
    const previous=article.getAttribute('data-onhold-reading-translation');if(previous===(mode||null))return;
    if(mode)article.setAttribute('data-onhold-reading-translation',mode);else article.removeAttribute('data-onhold-reading-translation');
    article.dispatchEvent(new CustomEvent('onhold-reading-translation',{bubbles:true,detail:{active:!!mode}}));
  }
  function startLocal(article,state){
    if(!config.autoTranslate||!inReadingView(article)||!state.translation)return;
    const nativeButton=[...article.querySelectorAll('button,[role="button"]')].some(button=>!button.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"],article article')&&/^(Show translation|显示翻译|查看翻译)$/i.test(button.textContent.trim()));
    if(nativeButton){
      let wait=nativeWaits.get(article);
      if(!wait||wait.key!==state.key){wait={key:state.key,at:performance.now()};nativeWaits.set(article,wait);setTimeout(()=>{if(article.isConnected&&nativeWaits.get(article)===wait)scan();},1100);}
      if(performance.now()-wait.at<1000)return;
    }
    state.translation.start(true);
  }

  const nativeReady=reading=>reading?.native&&(config.readingTarget!=='zh'||!XAITranslationUI.isForeign(reading.text));
  function attachTranslation(article, state) {
    const reading=globalThis.OnHoldXReading?.read(article);
    if(config.translatePageAllowed===false||nativeReady(reading))return;
    if (!globalThis.XAITranslationUI || !XAITranslationUI.isForeign(state.text,config.readingTarget||'zh')) return;
    if (state.translation?.host.isConnected) return;
    state.translation?.remove();
    state.translation = XAITranslationUI.mount(state.node, state.text, send, () =>
      state.generation === generation && states.get(article) === state && article.isConnected && extract(article)?.key === state.key,
      {sourceRecord:reading?.native?{original:reading.original,translation:{provider:'x_grok_dom',text:reading.text,complete:reading.complete}}:undefined,onStart:()=>{if(states.get(article)===state)translationBusy(article,'local');},onSettled:()=>{if(states.get(article)===state)translationBusy(article,null);},target:config.readingTarget,targetName:config.languages?.[config.readingTarget],postUrl:state.postUrl,readFull:state.readFull,moreNode:state.moreNode,onComplete:data=>article.dispatchEvent(new CustomEvent('onhold-translated',{bubbles:true,detail:{text:data.text,original:state.text,target_lang:data.target_lang||'zh',sourceText:data.sourceLines?.map((line,index)=>(data.sourceBreaks?.[index]??(index?'\n':''))+line).join('')||state.text}}))});
    visible.unobserve(article);
    visible.observe(article);
  }

  const visible = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting&&!document.hidden) {
      const state = states.get(entry.target);
      if(state)startLocal(entry.target,state);
    }
  }, {rootMargin: '100px'});

  function scan() {
    if(pageUrl!==location.href){const url=pageUrl=location.href;refresh({...config,autoTranslate:false,translatePageAllowed:false});send({type:'GET_PUBLIC_CONFIG'}).then(next=>{if(location.href===url)refresh(next);}).catch(()=>{});return;}
    for (const [article, state] of states) if (!article.isConnected) {
      state.translation?.remove(); states.delete(article); visible.unobserve(article);
    }
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if(nativeReady(globalThis.OnHoldXReading?.read(article))){const old=states.get(article);old?.translation?.remove();states.delete(article);visible.unobserve(article);translationBusy(article,null);continue;}
      const info = extract(article);
      const old = states.get(article);
      if (old && old.key === info?.key) {
        old.node = info.node;
        attachTranslation(article, old);
        startLocal(article,old);
        continue;
      }

      old?.translation?.remove();
      if(article.getAttribute('data-onhold-reading-translation')==='local')translationBusy(article,null);
      visible.unobserve(article);
      states.delete(article);
      if (!info) continue;
      const state = {...info, generation, queued: false};
      states.set(article, state);
      attachTranslation(article, state);
      visible.observe(article);
      startLocal(article,state);
    }
  }

  document.addEventListener('onhold-ad-visibility',scan);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scan();});
  setInterval(()=>{if(!document.hidden&&pageUrl!==location.href)scan();},1000);

  function refresh(next) {
    generation++;
    config = next;
    visible.disconnect();
    for (const [article,state] of states) {state.translation?.remove();translationBusy(article,null);}
    states.clear();
    scan();
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message.type === 'CONFIG_CHANGED') refresh(message.config);
  });
  new MutationObserver(records => {
    if(records.some(record=>(record.target.nodeType===Node.TEXT_NODE?record.target.parentElement:record.target)?.closest?.('[data-testid="tweetText"]'))){scan();return;}
    if (timer) return;
    timer = setTimeout(() => {timer = null; scan();}, 200);
  }).observe(document.body, {childList: true, subtree: true, characterData: true});
  const initialUrl=location.href;send({type: 'GET_PUBLIC_CONFIG'}).then(next=>{if(location.href===initialUrl)refresh(next);}).catch(() => {});
})();

(() => {
  if (globalThis.__xAIStampLoaded) return;
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

  if(location.hash==='#x-local-full-reader') {
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

  const restored=new WeakSet();
  function restoreChinese(article) {
    const button=[...article.querySelectorAll('button,[role="button"]')].find(el=>
      !el.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"], article article') &&
      /^(Show original|显示原文|查看原文)$/i.test(el.textContent.trim()) &&
      /Translated from Chinese|译自中文|翻译自中文/i.test(el.parentElement?.innerText||''));
    if(!button)return false;
    if(!restored.has(button)){restored.add(button);button.click();}
    return true;
  }

  function attachTranslation(article, state) {
    if(config.translatePageAllowed===false)return;
    if (!globalThis.XAITranslationUI || !XAITranslationUI.isForeign(state.text,config.readingTarget||'zh')) return;
    if (state.translation?.host.isConnected) return;
    state.translation?.remove();
    state.translation = XAITranslationUI.mount(state.node, state.text, send, () =>
      state.generation === generation && states.get(article) === state && article.isConnected && extract(article)?.key === state.key,
      {target:config.readingTarget,targetName:config.languages?.[config.readingTarget],postUrl:state.postUrl,readFull:state.readFull,moreNode:state.moreNode,onComplete:data=>article.dispatchEvent(new CustomEvent('onhold-translated',{bubbles:true,detail:{text:data.text,original:state.text,target_lang:data.target_lang||'zh',sourceText:data.sourceLines?.join('\n\n')||state.text}}))});
    visible.unobserve(article);
    visible.observe(article);
  }

  const visible = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const state = states.get(entry.target);
      if (state && config.autoTranslate && restoreChinese(entry.target)) continue;
      if (state && config.autoTranslate) state.translation?.start(true);
    }
  }, {rootMargin: '100px'});

  function scan() {
    if(pageUrl!==location.href){const url=pageUrl=location.href;refresh({...config,autoTranslate:false,translatePageAllowed:false});send({type:'GET_PUBLIC_CONFIG'}).then(next=>{if(location.href===url)refresh(next);}).catch(()=>{});return;}
    for (const [article, state] of states) if (!article.isConnected) {
      state.translation?.remove(); states.delete(article); visible.unobserve(article);
    }
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const info = extract(article);
      const old = states.get(article);
      if (old && old.key === info?.key) {
        old.node = info.node;
        attachTranslation(article, old);
        continue;
      }

      old?.translation?.remove();
      visible.unobserve(article);
      states.delete(article);
      if (!info) continue;
      const state = {...info, generation, queued: false};
      states.set(article, state);
      attachTranslation(article, state);
      visible.observe(article);
    }
  }

  setInterval(()=>{if(!document.hidden&&pageUrl!==location.href)scan();},1000);

  function refresh(next) {
    generation++;
    config = next;
    visible.disconnect();
    for (const state of states.values()) {state.translation?.remove();}
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

(() => {
 if(globalThis.OnHoldXReading)return;
 const history=new WeakMap();
 const own=(article,node)=>node.closest('article[data-testid="tweet"]')===article&&!node.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"]');
 function read(article){
  const nodes=[...article.querySelectorAll('[data-testid="tweetText"]')].filter(node=>own(article,node));
  const node=nodes.find(node=>node.getClientRects().length)||nodes[0];if(!node)return null;
  const text=(globalThis.XAITranslationUI?.readOriginal(node)||node.innerText).trim();if(!text)return null;
  const url=[...article.querySelectorAll('a[href*="/status/"]')].filter(link=>own(article,link)).map(link=>{try{const value=new URL(link.href),match=value.pathname.match(/^\/([A-Za-z0-9_]+)\/status\/(\d+)/);return ['x.com','twitter.com'].includes(value.hostname)&&match?`https://x.com/${match[1]}/status/${match[2]}`:null;}catch{return null;}}).find(Boolean)||null;
  let metadata='';
  const native=[...article.querySelectorAll('button,[role="button"]')].some(button=>{
   if(!own(article,button)||!/^(Show original|显示原文|查看原文)$/i.test(button.textContent.trim()))return false;
   const context=[button.parentElement,button.parentElement?.parentElement].find(parent=>parent&&!parent.querySelector('[data-testid="tweetText"]')&&/Translated from|译自|翻译自/i.test(parent.innerText));
   if(!context)return false;metadata=context.innerText.replace(button.innerText,'').trim().slice(0,100);return true;
  });
  let previous=history.get(article);if(previous?.url&&url&&previous.url!==url)previous=null;
  // A translated post first encountered on screen has no observed original; keep that unknown.
  const original=!native?text:previous&&(!previous.native||previous.text===text||previous.pending)?previous.original:null;
  const value={url,node,text,native,original:original||null,pending:native&&original===text,complete:![...article.querySelectorAll('[data-testid="tweet-text-show-more-link"],button,[role="button"]')].some(button=>own(article,button)&&/^(Show more|显示更多|展开|查看更多)$/i.test(button.textContent.trim())),metadata};
  history.set(article,value);return value;
 }
 globalThis.OnHoldXReading={read};
})();

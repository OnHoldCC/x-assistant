(() => {
  if(globalThis.XAIMetrics)return;
  function parseCount(raw) {
    if(typeof raw!=='string'||raw.length>300)return null;
    const text=raw.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g,'').trim();
    const match=text.match(/(\d{1,3}(?:[,\u00a0\u202f ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([KMB千万亿])?/i);
    if(!match)return null;
    const unit=(match[2]||'').toUpperCase(),base=Number(match[1].replace(/[,\u00a0\u202f ]/g,''));
    if(!unit&&match[1].includes('.'))return null;
    const multiplier={K:1e3,M:1e6,B:1e9,'千':1e3,'万':1e4,'亿':1e8}[unit]||1;
    const value=Math.round(base*multiplier);
    if(!Number.isSafeInteger(value)||value<0||value>1e15)return null;
    return {value,approximate:!!unit,raw:match[0].trim()};
  }
  function statusLink(href) {
    try{
      const url=new URL(href,'https://x.com');
      if(!['x.com','twitter.com'].includes(url.hostname)||url.protocol!=='https:')return null;
      const found=url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})(?:\/|$)/);
      return found?{author:found[1].toLowerCase(),id:found[2]}:null;
    }catch{return null;}
  }
  globalThis.XAIMetrics={parseCount,statusLink};
})();

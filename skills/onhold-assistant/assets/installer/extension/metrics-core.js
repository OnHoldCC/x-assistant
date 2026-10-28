(() => {
  if(globalThis.XAIMetrics)return;
  function parseCount(raw) {
    if(typeof raw!=='string'||raw.length>300)return null;
    const text=raw.replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g,'').trim();
    const match=text.match(/(\d{1,3}(?:[,\u00a0\u202f ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([KMB](?![A-Za-z])|[千万亿])?/i);
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
  function interactionRates(metrics){
    const get=key=>{const item=metrics?.[key],value=typeof item==='number'?item:item?.value;return Number.isFinite(value)&&value>=0?value:null;};
    const views=get('impressions')??get('views'),likes=get('likes'),replies=get('replies'),reposts=get('reposts');
    if(!(views>0)||[likes,replies,reposts].some(value=>value===null))return {visible:null,weighted:null,approximate:false};
    const approximate=['impressions','views','likes','replies','reposts'].some(key=>metrics?.[key]?.approximate===true);
    // Published defaults checked 2026-10-27; applying them to counts is a custom reference metric, not X's ranker.
    return {visible:(likes+replies+reposts)/views*100,weighted:(.66*likes+5*replies+reposts)/views*100,approximate};
  }
  function operatingRates(metrics){
    const count=key=>{const value=metrics?.[key]?.value;return Number.isFinite(value)&&value>=0?value:null;};
    const impressions=count('impressions'),visits=count('profile_visits'),engagements=count('engagements');
    const per1000=value=>impressions>0&&value!==null?value/impressions*1000:null;
    return {profileVisitRate:impressions>0&&visits!==null?visits/impressions*100:null,engagementsPer1000:per1000(engagements),profileVisitsPer1000:per1000(visits),approximate:['impressions','profile_visits','engagements'].some(key=>metrics?.[key]?.approximate===true)};
  }
  function creatorOutlook(creator,assumptions){
    const targets=[creator?.verified_followers,creator?.verified_impressions];
    const valid=targets.every(item=>Number.isFinite(item?.current?.value)&&item.current.value>=0&&Number.isFinite(item?.target)&&item.target>0);
    const numericMet=valid&&targets.every(item=>item.current.value>=item.target),graduated=numericMet||['eligible','enrolled'].includes(creator?.state);
    const progress=valid?Math.min(1,...targets.map(item=>item.current.value/item.target))*100:null;
    const blocked=creator?.state==='ineligible'||valid&&!numericMet;
    const amount=blocked?0:Number.isSafeInteger(assumptions?.qualified30)&&assumptions.qualified30>=0&&assumptions.qualified30<=1e15&&Number.isFinite(assumptions?.rpmCny)&&assumptions.rpmCny>=0&&assumptions.rpmCny<=1e6?assumptions.qualified30/1000*assumptions.rpmCny:null;
    return {graduated,progress,blocked,amount};
  }
  globalThis.XAIMetrics={parseCount,statusLink,interactionRates,operatingRates,creatorOutlook};
})();

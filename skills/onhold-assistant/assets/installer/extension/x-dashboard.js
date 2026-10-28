(() => {
 if(globalThis.OnHoldDashboard)return;
 function account(){
  const profile=document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
  const path=profile&&new URL(profile.href).pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
  const label=document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')?.innerText||'';
  return (path?.[1]||label.match(/@([A-Za-z0-9_]{1,15})/)?.[1]||'').toLowerCase()||null;
 }
 function capture(){
  const owner=account(),scope=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main,[role="main"]')||document.body;
  if(!owner||!scope)return null;
  if(location.pathname==='/i/jf/creators/studio'){
   const text=[...scope.querySelectorAll('button,[role="button"]')].map(node=>(node.innerText||'').replace(/\s+/g,' ').trim()).find(text=>/^Original Content Rewards|^原创内容奖励/.test(text));
   if(!text)return null;
   const state=/Ineligible|不符合|尚未符合/i.test(text)?'ineligible':/Enrolled|已加入|Active|已开通/i.test(text)?'enrolled':/Eligible|符合资格/i.test(text)?'eligible':'unknown';
   return {account:owner,kind:'creator_status',state,observed_at:Date.now(),source:location.origin+location.pathname};
  }
  if(location.pathname==='/i/jf/creators/original_content_rewards'){
   const text=scope.innerText.replace(/\s+/g,' ').trim();
   const followers=text.match(/Have at least\s+([\d,.]+\s*[KMB]?)\s+Verified followers\s+([\d,.]+\s*[KMB]?)/i);
   const impressions=text.match(/Have at least\s+([\d,.]+\s*[KMB]?)\s+Verified Home Timeline impressions in the last\s+(\d+)\s+days\s+([\d,.]+\s*[KMB]?)/i);
   const followerTarget=followers&&XAIMetrics.parseCount(followers[1]),followerCurrent=followers&&XAIMetrics.parseCount(followers[2]);
   const impressionTarget=impressions&&XAIMetrics.parseCount(impressions[1]),impressionCurrent=impressions&&XAIMetrics.parseCount(impressions[3]);
   if(!followerTarget?.value||!followerCurrent||!impressionTarget?.value||!impressionCurrent)return null;
   return {account:owner,kind:'creator',verified_followers:{current:followerCurrent,target:followerTarget.value},verified_impressions:{current:impressionCurrent,target:impressionTarget.value,days:Number(impressions[2]),exclude_replies:/Does not include replies/i.test(text)},observed_at:Date.now(),source:location.origin+location.pathname};
  }
  if(location.pathname!=='/i/account_analytics')return null;
  const metrics={},names={impressions:['Impressions','曝光量','展示次数'],engagements:['Engagements','互动次数','互动量'],engagement_rate:['Engagement rate','互动率'],profile_visits:['Profile visits','个人资料访问次数','个人资料访问量'],likes:['Likes','喜欢','点赞'],replies:['Replies','回复'],reposts:['Reposts','转帖','转发'],bookmarks:['Bookmarks','书签','收藏']};
  const controls=[...scope.querySelectorAll('button,[role="button"]')];
  for(const [key,labels] of Object.entries(names)){
   for(const label of labels){
    const node=controls.find(node=>new RegExp('^'+label+'(?:\\s|[0-9])','i').test(node.getAttribute('aria-label')||node.innerText.trim()));if(!node)continue;
    const rest=(node.getAttribute('aria-label')||node.innerText.trim()).slice(label.length).trim(),raw=rest.match(/^[\d,.\u00a0\u202f ]+(?:[KMB千万亿])?(?:\s*%)?/i)?.[0]?.trim();if(!raw)continue;
    if(key==='engagement_rate'){const value=Number(raw.replace(/[% ,\u00a0\u202f]/g,''));if(raw.includes('%')&&Number.isFinite(value)&&value>=0)metrics[key]={value,raw};}
    else{const value=XAIMetrics.parseCount(raw);if(value)metrics[key]=value;}
    break;
   }
  }
  const followers=controls.find(node=>/^Verified followers|^认证关注者|^已认证关注者/i.test(node.innerText.trim()));
  if(followers){const parts=followers.innerText.replace(/^Verified followers|^认证关注者|^已认证关注者/i,'').split('/');metrics.verified_followers=XAIMetrics.parseCount(parts[0]);if(parts[1])metrics.followers=XAIMetrics.parseCount(parts[1]);}
  if(!Object.keys(metrics).length)return null;
  const ranges=controls.filter(node=>/^(1D|7D|14D|2W|28D|4W|30D|90D|3M|1Y)$/.test(node.innerText.trim()));
  const selected=ranges.find(node=>node.getAttribute('aria-pressed')==='true'||node.getAttribute('aria-selected')==='true');
  const opaque=ranges.filter(node=>!['rgba(0, 0, 0, 0)','transparent'].includes(getComputedStyle(node).backgroundColor));
  const period=(selected||opaque.length===1&&opaque[0])?.innerText.trim()||'当前 X 页面周期（未识别）';
  const verified=[...scope.querySelectorAll('[role="switch"]')].find(node=>/Verified only|仅认证/.test(node.getAttribute('aria-label')||node.innerText));
  return {account:owner,kind:'analytics',metrics,period,verified_only:verified?verified.getAttribute('aria-checked')==='true':null,observed_at:Date.now(),source:location.origin+location.pathname};
 }
 globalThis.OnHoldDashboard={account,capture};
 chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(!sender||sender.id!==chrome.runtime.id)return;
  if(message.type==='READ_ACCOUNT_CONTEXT')return respond({account:account()});
  if(message.type==='READ_X_DASHBOARD'){const data=capture();return respond(data&&data.account===message.account&&data.kind===message.kind?{ready:true,data}:{ready:false});}
 });
})();

// Read a page snapshot once; consume its fixed post links before refreshing For You.
export function inspectForYou(owner,scope='for_you',trendIndex=0,language='auto'){
 if(location.href==='about:blank')return {ready:false};
 if(location.origin!=='https://x.com'||(scope==='trending'?!/^\/(explore|search)(?:\/|$)/.test(location.pathname):location.pathname!=='/home'))throw Error('For You 采集仅支持 X 首页');
 const account=document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase();
 if(!account)return {ready:false};
 if(account!==owner)throw Error('X 账号已改变，停止采集');
 if(scope==='for_you'){
  const tab=[...document.querySelectorAll('[role="tab"]')].find(node=>/^(For you|为你推荐|为你|推荐)$/i.test(node.innerText.trim()));
  if(!tab)return {ready:false};
  if(tab.getAttribute('aria-selected')!=='true'){const rect=tab.getBoundingClientRect();return {ready:false,select:{x:rect.x+rect.width/2,y:rect.y+rect.height/2}};}
 }else if(location.pathname.startsWith('/explore')){
  const trends=[...document.querySelectorAll('[data-testid="trend"]')].filter(node=>!node.querySelector('[data-testid="promotedIndicator"],[data-testid="adIndicator"]')&&!/Promoted by|Sponsored|广告|推广/i.test(node.innerText));
  if(!trends.length)return {ready:false};const trend=trends[trendIndex%trends.length];trend.scrollIntoView({block:'center'});const rect=trend.getBoundingClientRect();return {ready:false,selectTrend:{x:rect.x+rect.width/2,y:rect.y+rect.height/2}};
 }
 const posts=[];let scanned=0;
 for(const article of document.querySelectorAll('main article[data-testid="tweet"]')){
  scanned++;
  if(article.closest('[data-testid="placementTracking"],[data-onhold-ad-hidden]')||article.querySelector('[data-testid="placementTracking"],[data-testid="promotedIndicator"],[data-testid="adIndicator"]'))continue;
  const body=article.querySelector('[data-testid="tweetText"],[data-testid="tweetPhoto"],[data-testid="videoPlayer"]');
  const labels=/^(?:Ad|Ads|Promoted|Sponsored|广告|廣告|推广|推廣)$/i;
  const promoted=[...article.querySelectorAll('span,[data-testid="socialContext"]')].some(node=>node.closest('article')===article&&!node.closest('[data-testid="tweetText"],[data-testid="quoteTweet"],[data-testid="card.wrapper"],a,[role="link"],button,[role="button"]')&&labels.test(node.textContent.trim())&&(!body||!!(node.compareDocumentPosition(body)&Node.DOCUMENT_POSITION_FOLLOWING)));
  if(promoted||article.querySelector('[data-testid="tweet-text-show-more-link"]'))continue;
  const own=node=>node.closest('article[data-testid="tweet"]')===article&&!node.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"]');
  const link=[...article.querySelectorAll('a:has(time)')].find(own)?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,30})(?:\?|$)/);
  const node=[...article.querySelectorAll('[data-testid="tweetText"]')].find(own),text=node?.innerText?.trim();
  if(!link||!text||text.length>48000||link[1].toLowerCase()===owner)continue;
  if(language==='en'&&node.getAttribute('lang')&&node.getAttribute('lang').split('-')[0]!=='en')continue;
  if(language==='en'&&[...article.querySelectorAll('button')].some(button=>own(button)&&/^(Show original|显示原文|顯示原文|查看原文)$/i.test(button.innerText.trim())))continue;
  const author=link[1].toLowerCase();posts.push({author,id:link[2],url:'https://x.com/'+author+'/status/'+link[2],text,language:node.getAttribute('lang')?.split('-')[0]||undefined,complete:true});if(posts.length>=50)break;
 }
 return {ready:true,posts,scanned,loading:!!document.querySelector('main [role="progressbar"]')};
}
export async function collectForYou(job,call,owner,verify){
 const limit=job.input?.limit;
 if(job.action!=='capture_for_you'||job.account!==owner||!Number.isInteger(limit)||limit<1||limit>20)throw Error('For You 任务无效');
 const known=new Set(job.input?.known_ids||[]);
 const allowed=async()=>{await verify();if(!(await call('automation_can_run',{account:owner,task_id:job.input.task_id})).allowed)throw Error('自动化评论已暂停');};
 await allowed();
 const scope=job.input?.scope==='trending'?'trending':'for_you',language=job.input?.language==='en'?'en':'auto';
 const saved=(await chrome.storage.session.get(job.input?.publication_mode==='replicate'?'forYouPostPage':'forYouPage'))[job.input?.publication_mode==='replicate'?'forYouPostPage':'forYouPage'];
 let remaining=saved?.account===owner&&saved.scope===scope&&(saved.language||'auto')===language&&Array.isArray(saved.posts)?saved.posts.filter(post=>!known.has(post.id)):[];
 let trendIndex=saved?.account===owner&&saved.scope===scope?saved.trend_index||0:0;
 if(!remaining.length){
  const tab=await chrome.tabs.create({url:'about:blank',active:false});let attached=false;
  const command=async(method,params={})=>{let timer;try{return await Promise.race([chrome.debugger.sendCommand({tabId:tab.id},method,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('For You 页面响应超时，停止本轮采集')),20000);})]);}finally{clearTimeout(timer);}};
  let selected=false,trendClicked=false,snapshot=null,lastIds="";
  try{
   await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;await command('Page.enable');
   const navigation=await command('Page.navigate',{url:scope==='trending'?'https://x.com/explore/tabs/trending#onhold-for-you':'https://x.com/home#onhold-for-you'});if(navigation.errorText)throw Error('X 首页打开失败');
   for(let attempt=0;attempt<40;attempt++){
    await allowed();const response=await command('Runtime.evaluate',{expression:'('+inspectForYou.toString()+')('+JSON.stringify(owner)+','+JSON.stringify(scope)+','+trendIndex+','+JSON.stringify(language)+')',returnByValue:true});
    if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||'For You 采集失败');
    const page=response.result?.value;
    if(page?.selectTrend&&!trendClicked){for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...page.selectTrend});trendClicked=true;}
    if(page?.select){if(selected)throw Error('无法切换到 For You');selected=true;for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...page.select});await new Promise(resolve=>setTimeout(resolve,1000));continue;}
    if(page?.ready&&page.scanned&&(page.posts.length||!page.loading)){const ids=page.posts.map(post=>post.id).join(',');snapshot=page;if(ids===lastIds)break;lastIds=ids;}
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!snapshot)throw Error('For You 当前页未就绪，未创建评论任务');
   if(scope==='trending')trendIndex++;
   remaining=[...new Map(snapshot.posts.filter(post=>!known.has(post.id)).map(post=>[post.id,post])).values()];
  }finally{if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});await chrome.tabs.remove(tab.id).catch(()=>{});}
 }
 await allowed();let selected=remaining.slice(0,limit),consumed=selected.length;
 if(job.input?.publication_mode==='replicate')throw Error('评分发文已停用，请改用新闻搜索');
 const result=await call('queue_feed_replies',{id:job.id,client:job.client,posts:selected});
 await chrome.storage.session.set({[job.input?.publication_mode==='replicate'?'forYouPostPage':'forYouPage']:{account:owner,scope,language,trend_index:trendIndex,posts:remaining.slice(consumed)}});
 return result;
}

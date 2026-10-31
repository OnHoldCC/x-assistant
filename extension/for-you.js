// Read a page snapshot once; consume its fixed post links before refreshing For You.
export function inspectForYou(owner,scope='for_you',trendIndex=0,language='auto'){
 const waiting=(phase,details={})=>({ready:false,phase,document_state:document.readyState,visibility:document.visibilityState,...details});
 if(location.href==='about:blank')return waiting('navigation');
 if(location.origin!=='https://x.com'||(scope==='trending'?!/^\/(explore|search)(?:\/|$)/.test(location.pathname):location.pathname!=='/home'))throw Error('For You 采集仅支持 X 首页');
 const account=document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase();
 if(!account)return waiting('account',{profile_link:!!document.querySelector('[data-testid=AppTabBar_Profile_Link]'),account_switcher:!!document.querySelector('[data-testid=SideNav_AccountSwitcher_Button]')});
 if(account!==owner)throw Error('X 账号已改变，停止采集');
 if(scope==='for_you'){
  const tab=[...document.querySelectorAll('[role="tab"]')].find(node=>/^(For you|为你推荐|为你|推荐)$/i.test(node.innerText.trim()));
  if(!tab)return waiting('tab',{tab_labels:[...document.querySelectorAll('[role=tab]')].slice(0,8).map(node=>node.innerText.trim().replace(/\s+/g,' ').slice(0,50))});
  if(tab.getAttribute('aria-selected')!=='true'){const rect=tab.getBoundingClientRect();return {...waiting('selection'),select:{x:rect.x+rect.width/2,y:rect.y+rect.height/2}};}
 }else if(location.pathname.startsWith('/explore')){
  const trends=[...document.querySelectorAll('[data-testid="trend"]')].filter(node=>!node.querySelector('[data-testid="promotedIndicator"],[data-testid="adIndicator"]')&&!/Promoted by|Sponsored|广告|推广/i.test(node.innerText));
  if(!trends.length)return waiting('trends');const trend=trends[trendIndex%trends.length];trend.scrollIntoView({block:'center'});const rect=trend.getBoundingClientRect();return {ready:false,selectTrend:{x:rect.x+rect.width/2,y:rect.y+rect.height/2}};
 }
 const posts=[],filtered={ads:0,truncated:0,source:0,text:0,own:0,language:0,translated:0};let scanned=0;
 for(const article of document.querySelectorAll('main article[data-testid="tweet"]')){
  scanned++;
  if(article.closest('[data-testid="placementTracking"],[data-onhold-ad-hidden]')||article.querySelector('[data-testid="placementTracking"],[data-testid="promotedIndicator"],[data-testid="adIndicator"]')){filtered.ads++;continue;}
  const body=article.querySelector('[data-testid="tweetText"],[data-testid="tweetPhoto"],[data-testid="videoPlayer"]');
  const labels=/^(?:Ad|Ads|Promoted|Sponsored|广告|廣告|推广|推廣)$/i;
  const promoted=[...article.querySelectorAll('span,[data-testid="socialContext"]')].some(node=>node.closest('article')===article&&!node.closest('[data-testid="tweetText"],[data-testid="quoteTweet"],[data-testid="card.wrapper"],a,[role="link"],button,[role="button"]')&&labels.test(node.textContent.trim())&&(!body||!!(node.compareDocumentPosition(body)&Node.DOCUMENT_POSITION_FOLLOWING)));
  if(promoted){filtered.ads++;continue;}
  if(article.querySelector('[data-testid="tweet-text-show-more-link"]')){filtered.truncated++;continue;}
  const own=node=>node.closest('article[data-testid="tweet"]')===article&&!node.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"]');
  const link=[...article.querySelectorAll('a:has(time)')].find(own)?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,30})(?:\?|$)/);
  const node=[...article.querySelectorAll('[data-testid="tweetText"]')].find(own),text=node?.innerText?.trim();
  if(!link){filtered.source++;continue;}
  if(!text||text.length>48000){filtered.text++;continue;}
  if(link[1].toLowerCase()===owner){filtered.own++;continue;}
  const author=link[1].toLowerCase();posts.push({author,id:link[2],url:'https://x.com/'+author+'/status/'+link[2],text,language:node.getAttribute('lang')?.split('-')[0]||undefined,complete:true});if(posts.length>=50)break;
 }
 return {ready:true,phase:'timeline',posts,scanned,filtered,loading:!!document.querySelector('main [role="progressbar"]'),document_state:document.readyState,visibility:document.visibilityState};
}
export function forYouDiagnostic(page,statuses=[]){
 const phases={navigation:'后台页尚未完成跳转',account:'未识别登录账号',tab:'未找到 For You 页签',selection:'For You 页签尚未选中',trends:'未识别热点列表',timeline:'未取得稳定的帖子首屏'};
 const parts=[phases[page?.phase]||'未取得页面快照'];
 if(page?.phase==='account')parts.push(`个人页入口=${page.profile_link?'有':'无'}，账号切换入口=${page.account_switcher?'有':'无'}`);
 if(page?.phase==='tab')parts.push(`实际页签=${(page.tab_labels||[]).join(' / ')||'无'}`);
 if(page?.phase==='timeline')parts.push(`帖子节点=${page.scanned||0}，可用正文=${page.posts?.length||0}，加载中=${page.loading?'是':'否'}`);
 if(page?.document_state)parts.push(`文档=${page.document_state}`);
 if(page?.visibility)parts.push(`可见性=${page.visibility}`);
 if(statuses.length)parts.push(`X 首页请求 HTTP ${[...new Set(statuses)].join('/')}`);
 return parts.join('；');
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
 let captureSummary=null;
 let trendIndex=saved?.account===owner&&saved.scope===scope?saved.trend_index||0:0;
 if(!remaining.length){
  const tab=await chrome.tabs.create({url:'about:blank',active:false});let attached=false;
  const command=async(method,params={})=>{let timer;try{return await Promise.race([chrome.debugger.sendCommand({tabId:tab.id},method,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('For You 页面响应超时，停止本轮采集')),20000);})]);}finally{clearTimeout(timer);}};
  let selected=false,trendClicked=false,snapshot=null,lastIds=null,lastPage=null;const statuses=[];
  const network=(source,method,event)=>{if(source.tabId===tab.id&&method==='Network.responseReceived'&&/^https:\/\/x\.com\/i\/api\//.test(event.response?.url||'')&&event.response.status>=400)statuses.push(event.response.status);};
  try{
   await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;chrome.debugger.onEvent.addListener(network);await command('Network.enable');await command('Page.enable');
   const navigation=await command('Page.navigate',{url:scope==='trending'?'https://x.com/explore/tabs/trending#onhold-for-you':'https://x.com/home#onhold-for-you'});if(navigation.errorText)throw Error('X 首页打开失败');
   for(let attempt=0;attempt<40;attempt++){
    await allowed();const response=await command('Runtime.evaluate',{expression:'('+inspectForYou.toString()+')('+JSON.stringify(owner)+','+JSON.stringify(scope)+','+trendIndex+','+JSON.stringify(language)+')',returnByValue:true});
    if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description||'For You 采集失败');
    const page=response.result?.value;lastPage=page;
    if(page?.selectTrend&&!trendClicked){for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...page.selectTrend});trendClicked=true;}
    if(page?.select){if(selected)throw Error('无法切换到 For You');selected=true;for(const type of ['mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...page.select});await new Promise(resolve=>setTimeout(resolve,1000));continue;}
    if(page?.ready&&page.scanned){const ids=page.scanned+':'+page.posts.map(post=>post.id).join(',');snapshot=page;if(ids===lastIds)break;lastIds=ids;}
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!snapshot)throw Error('For You 采集失败：'+forYouDiagnostic(lastPage,statuses)+'；未创建评论任务');
   captureSummary={scanned:snapshot.scanned,eligible:snapshot.posts.length,filtered:snapshot.filtered};
   if(scope==='trending')trendIndex++;
   remaining=[...new Map(snapshot.posts.filter(post=>!known.has(post.id)).map(post=>[post.id,post])).values()];
  }finally{chrome.debugger.onEvent.removeListener(network);if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});await chrome.tabs.remove(tab.id).catch(()=>{});}
 }
 await allowed();let selected=remaining.slice(0,limit),consumed=selected.length;
 if(job.input?.publication_mode==='replicate')throw Error('评分发文已停用，请改用新闻搜索');
 if(captureSummary)await call('for_you_snapshot',{id:job.id,client:job.client,snapshot:captureSummary});
 const result=await call('queue_feed_replies',{id:job.id,client:job.client,posts:selected});
 await chrome.storage.session.set({[job.input?.publication_mode==='replicate'?'forYouPostPage':'forYouPage']:{account:owner,scope,language,trend_index:trendIndex,posts:remaining.slice(consumed)}});
 return result;
}

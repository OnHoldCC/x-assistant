import {runAutomation} from './automation.js';
import {collectNotificationReplies} from './notifications.js';
import {collectForYou} from './for-you.js';
import {runPublication,cleanupPublicationTabs} from './publisher.js';
import {collectRelationships} from './relationships.js';
import {captureAnalyticsCsv,parseAnalyticsCsv} from './analytics-export.js';
import {learnRequests,sessionFromCookies} from './request-capture.js';
export function captureX(requestedPeriod,verifiedCreatorAccount){
  if(!['x.com','twitter.com'].includes(location.hostname)||location.protocol!=='https:')throw Error('请打开 X 页面后连接（当前来源：'+location.origin+'）');
  const path=document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')||'';
  const account=(path.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]||document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')?.innerText.match(/@([A-Za-z0-9_]{1,15})/)?.[1]||(location.pathname==='/i/jf/creators/original_content_rewards'&&/^[a-z0-9_]{1,15}$/.test(verifiedCreatorAccount||'')?verifiedCreatorAccount:'')).toLowerCase();
  if(!account)throw Error('尚未识别登录账号（页面：'+location.pathname+'，标题：'+document.title.slice(0,80)+'）');
  function count(raw){
    const found=raw?.replace(/[\u200b-\u200f]/g,'').match(/(\d{1,3}(?:[,\u00a0\u202f ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*([KMB](?![A-Za-z])|[千万亿])?/i);if(!found||!found[2]&&found[1].includes('.'))return null;
    const unit=(found[2]||'').toUpperCase(),value=Math.round(Number(found[1].replace(/[,\u00a0\u202f ]/g,''))*({K:1e3,M:1e6,B:1e9,'千':1e3,'万':1e4,'亿':1e8}[unit]||1));
    return Number.isSafeInteger(value)&&value>=0&&value<=1e15?{value,approximate:!!unit,raw:found[0].trim()}:null;
  }
  const profile={};
  if(location.pathname.split('/')[1]?.toLowerCase()===account){
    for(const name of ['followers','following']){
      const links=[...document.querySelectorAll('a[href]')].filter(a=>(new URL(a.href).pathname.toLowerCase()===`/${account}/${name}`||name==='followers'&&new URL(a.href).pathname.toLowerCase()===`/${account}/verified_followers`&&!/verified|认证/i.test(a.innerText+' '+(a.getAttribute('aria-label')||''))));
      const value=links.map(a=>count(a.innerText)).find(Boolean);if(value)profile[name]=value;
    }
  }
  const posts=[];
  for(const article of document.querySelectorAll('article[data-testid="tweet"]')){
    if(article.querySelector('[data-testid="placementTracking"]'))continue;
    const own=node=>node.closest('article[data-testid="tweet"]')===article&&!node.closest('[data-testid="quoteTweet"],[data-testid="card.wrapper"]');
    const timestamp=[...article.querySelectorAll('time')].find(own),href=timestamp?.closest('a')?.href;
    const match=href&&new URL(href).pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})\/?$/);
    if(!match||match[1].toLowerCase()!==account)continue;
    const node=[...article.querySelectorAll('[data-testid="tweetText"]')].find(own);if(!node)continue;
    const metrics={};for(const [name,selector] of Object.entries({views:'a[href$="/analytics"]',likes:'[data-testid="like"],[data-testid="unlike"]',replies:'[data-testid="reply"]',reposts:'[data-testid="retweet"],[data-testid="unretweet"]',bookmarks:'[data-testid="bookmark"],[data-testid="removeBookmark"]'})){
      const control=[...article.querySelectorAll(selector)].find(own);if(!control)continue;
      const value=count(control.getAttribute('aria-label')||control.innerText);if(value)metrics[name]=value;
    }
    posts.push({id:match[2],author:account,text:node.innerText.slice(0,24000),created_at:timestamp.getAttribute('datetime'),metrics});if(posts.length>=50)break;
  }
  let analytics=null;
  if(location.pathname==='/i/account_analytics'){
    const scope=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main')||document.body,controls=[...scope.querySelectorAll('button,[role="button"],[role="tab"]')],metrics={};
    const aliases={'1D':'1d','7D':'7d','2W':'14d','14D':'14d','4W':'28d','28D':'28d','30D':'30d','3M':'90d','90D':'90d','1Y':'365d'},label=node=>(node.innerText.trim()||node.getAttribute('aria-label')||'').toUpperCase();
    const periods=controls.filter(node=>aliases[label(node)]),styled=periods.filter(node=>{const color=getComputedStyle(node).backgroundColor;return color!=='transparent'&&color!=='rgba(0, 0, 0, 0)'&&periods.filter(other=>getComputedStyle(other).backgroundColor===color).length===1;}),selected=periods.find(node=>node.getAttribute('aria-pressed')==='true'||node.getAttribute('aria-selected')==='true'||node.getAttribute('data-state')==='active'||node.getAttribute('data-selected')==='true')||(styled.length===1?styled[0]:null);
    if(requestedPeriod){
      if(!['1d','7d','14d','28d','30d','90d','365d'].includes(requestedPeriod))throw Error('不支持的官方分析周期');
      const control=periods.find(node=>aliases[label(node)]===requestedPeriod);if(!control)throw Error('X 未提供该统计周期：'+requestedPeriod);
      const changed=control!==selected;if(changed)control.click();return {handle:account,changed};
    }
    for(const [name,labels] of Object.entries({impressions:['Impressions','曝光量','展示次数'],engagements:['Engagements','互动次数','互动量'],engagement_rate:['Engagement rate','互动率'],profile_visits:['Profile visits','个人资料访问次数','个人资料访问量','主页访问'],followers:['Followers','关注者','粉丝'],verified_followers:['Verified followers','认证关注者','认证粉丝'],likes:['Likes','喜欢','点赞'],replies:['Replies','回复'],reposts:['Reposts','转帖','转发'],bookmarks:['Bookmarks','书签','收藏']})){
      for(const label of labels){const control=controls.find(node=>(node.getAttribute('aria-label')||node.innerText.trim()).toLowerCase().startsWith(label.toLowerCase()));if(!control)continue;
        const text=(control.getAttribute('aria-label')||control.innerText).trim().slice(label.length).trim();
        const raw=text.match(/^[\d,.\u00a0\u202f ]+(?:[KMB千万亿])?(?:\s*%)?/i)?.[0]?.trim();
        if(name==='engagement_rate'){const value=Number(raw?.replace(/[% ,\u00a0\u202f]/g,''));if(raw?.includes('%')&&Number.isFinite(value))metrics[name]={value,raw};}else{const value=count(raw);if(value)metrics[name]=value;}break;
      }
    }
    const verified=controls.find(node=>/^(Verified followers|认证关注者|已认证关注者|认证粉丝)/i.test(node.innerText.trim()));
    if(verified){const parts=verified.innerText.replace(/^(Verified followers|认证关注者|已认证关注者|认证粉丝)/i,'').split('/');const countVerified=count(parts[0]),total=count(parts[1]);if(countVerified)metrics.verified_followers=countVerified;if(total)metrics.followers=total;}
    const verifiedSwitch=[...scope.querySelectorAll('[role="switch"]')].find(node=>/Verified only|仅认证/.test(node.getAttribute('aria-label')||node.innerText));
    analytics={account,metrics,verified_only:verifiedSwitch?verifiedSwitch.getAttribute('aria-checked')==='true':null,period:selected?label(selected):'当前页面周期（未识别）',period_key:selected?aliases[label(selected)]:null,available_periods:[...new Set(periods.map(node=>aliases[label(node)]))]};
    if(scope.querySelector('[aria-busy="true"],[role="progressbar"]'))analytics.loading=true;
  }
  let creator=null;
  if(location.pathname==='/i/jf/creators/original_content_rewards'){
    const scope=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main')||document.body,text=scope.innerText.replace(/\s+/g,' ');
    const followers=text.match(/Have at least\s+([\d,.]+\s*[KMB]?)\s+Verified followers\s+([\d,.]+\s*[KMB]?)/i),impressions=text.match(/Have at least\s+([\d,.]+\s*[KMB]?)\s+Verified Home Timeline impressions in the last\s+(\d+)\s+days\s+([\d,.]+\s*[KMB]?)/i);
    const followerTarget=followers&&count(followers[1]),currentFollowers=followers&&count(followers[2]),targetImpressions=impressions&&count(impressions[1]),currentImpressions=impressions&&count(impressions[3]);
    const enrolled=/Original Content Rewards|原创内容奖励/i.test(text)&&/Enrolled|已开通|已加入/i.test(text);
    if(followerTarget?.value&&currentFollowers||targetImpressions?.value&&currentImpressions||enrolled){
      creator={account,state:enrolled?'enrolled':/Check back later|Ineligible|不符合/i.test(text)?'ineligible':'unknown'};
      if(followerTarget?.value&&currentFollowers)creator.verified_followers={current:currentFollowers,target:followerTarget.value};
      if(targetImpressions?.value&&currentImpressions)creator.verified_impressions={current:currentImpressions,target:targetImpressions.value,days:Number(impressions[2]),exclude_replies:/Does not include replies/i.test(text)};
    }
  }
  return {handle:account,source:location.origin+location.pathname,profile,posts,analytics,creator};
}

export function bridgeConfig(value){
  let url;try{url=new URL(value?.endpoint);}catch{throw Error('后台地址无效');}
  if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('当前插件只连接本机 Rust 后台');
  if(!/^[a-f0-9]{64}$/.test(value.token||''))throw Error('请填写后台提供的配对密钥');
  return {endpoint:url.origin,token:value.token};
}
export function createCdpBridge(){
  let busy=false,socket=null,connecting=null,restoring=null,heartbeatTimer,retryTimer,retryAttempt=0,stopped=false,authBlocked=false,lastPong=0,heartbeating=false;
  async function session(){const data=await chrome.storage.session.get(['cdpTab','cdpAccount']);return data;}
  async function probe(){
    const saved=await chrome.storage.local.get('cdpConfig'),config=bridgeConfig(saved.cdpConfig);
    let response;try{response=await fetch(config.endpoint+'/health',{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(5000)});}catch{throw Error('无法连接 '+config.endpoint+'，请先打开 OnHold 运营后台，并核对「连接与设置」里的地址。');}
    const health=await response.json().catch(()=>null);
    if(!response.ok||health?.service!=='onhold-admin')throw Error('此地址运行的不是 OnHold 运营后台，请从桌面端「连接与设置」复制新版地址（默认端口 18431）。');
  }
  async function call(operation,input){
    const saved=await chrome.storage.local.get('cdpConfig'),config=bridgeConfig(saved.cdpConfig);
    let response;try{response=await fetch(config.endpoint+'/api/admin',{method:'POST',credentials:'omit',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify({operation,input}),signal:AbortSignal.timeout(15000)});}catch{throw Error('无法连接 OnHold，请打开桌面端后重试');}
    const value=await response.json();if(!response.ok){if([401,403].includes(response.status)){authBlocked=true;await chrome.storage.session.set({cdpReconnectBlocked:true});}throw Error(value.error||'后台连接失败');}return value;
  }
  async function client(){const saved=await chrome.storage.local.get('cdpClient');if(saved.cdpClient)return saved.cdpClient;const id=crypto.randomUUID();await chrome.storage.local.set({cdpClient:id});return id;}
  async function capture(tab,period,creatorAccount){
    const info=await chrome.tabs.get(tab);if(!/^https:\/\/(x\.com|twitter\.com)\//.test(info.url||''))throw Error('当前标签页已离开 X，采集暂停');
    if(creatorAccount){
      const cookies=await chrome.debugger.sendCommand({tabId:tab},'Network.getCookies',{urls:['https://x.com/']});
      const identity=sessionFromCookies(cookies.cookies||[]),owner=await call('creator',{account:identity.uid});
      if(owner.account!==creatorAccount)throw Error('X 账号已切换，未采集资格数据');
    }
    const response=await chrome.debugger.sendCommand({tabId:tab},'Runtime.evaluate',{expression:'('+captureX.toString()+')('+(period?JSON.stringify(period):'undefined')+','+JSON.stringify(creatorAccount||null)+')',returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails||!response.result?.value)throw Error(response.exceptionDetails?.exception?.description||'X 页面尚未准备好');return response.result.value;
  }
  async function backgroundPage(account,analytics,onSnapshot,creatorPage=false,onlyPeriod=null,deadline=Date.now()+80000){
    const tab=await chrome.tabs.create({url:'about:blank',active:false});let attached=false,lastNetwork=Date.now(),networkFailed=false;const pending=new Set();
    const network=(source,method,event)=>{
      if(source.tabId!==tab.id)return;
      if(method==='Network.requestWillBeSent'&&['Fetch','XHR'].includes(event.type)&&/^https:\/\/(x\.com|twitter\.com)\//.test(event.request?.url||'')&&event.request.url.includes('/graphql/')){pending.add(event.requestId);lastNetwork=Date.now();}
      if(method==='Network.responseReceived'&&pending.has(event.requestId)&&event.response?.status>=400)networkFailed=true;
      if(method==='Network.loadingFailed'&&pending.has(event.requestId))networkFailed=true;
      if(['Network.loadingFinished','Network.loadingFailed'].includes(method)&&pending.delete(event.requestId))lastNetwork=Date.now();
    };
    const pause=()=>new Promise(resolve=>setTimeout(resolve,250));
    async function settled(period){
      const until=Math.min(deadline,Date.now()+30000),started=Date.now();let lastError='页面未显示该周期数据';
      while(Date.now()<until){
        if(networkFailed)throw Error('X 分析请求失败，请稍后重试；已采到的周期已保存');
        try{const value=await capture(tab.id);if(value.handle!==account)throw Error('X 账号已切换');
          if(!pending.size&&Date.now()-lastNetwork>=750&&Date.now()-started>=1000&&!value.analytics?.loading&&Object.keys(value.analytics?.metrics||{}).length&&value.analytics?.period_key&&(!period||value.analytics.period_key===period))return value;
        }catch(error){if(error.message.startsWith('X 账号已切换'))throw error;lastError=error.message;}
        await pause();
      }
      throw Error('官方分析 '+(period||'当前周期')+' 采集未完成：'+lastError);
    }
    try{
      await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;
      await chrome.debugger.sendCommand({tabId:tab.id},'Page.enable');
      if(analytics)chrome.debugger.onEvent.addListener(network);
      if(analytics||creatorPage)await chrome.debugger.sendCommand({tabId:tab.id},'Network.enable');
      const navigation=await chrome.debugger.sendCommand({tabId:tab.id},'Page.navigate',{url:creatorPage?'https://x.com/i/jf/creators/original_content_rewards#onhold-dashboard-reader':analytics?'https://x.com/i/account_analytics#onhold-dashboard-reader':'https://x.com/'+account+'#onhold-dashboard-reader'});
      if(navigation.errorText)throw Error('X 页面加载失败：'+navigation.errorText);
      if(analytics){
        const initial=await settled(),available=initial.analytics.available_periods;
        const periods=(onlyPeriod?[onlyPeriod]:['365d','90d']).filter(period=>available.includes(period));
        if(!periods.length)throw Error('X 未提供 3M 或 1Y 周期，无法采集至少三个月的趋势');
        let latest,lastError;
        for(const period of periods){
         try{
          if(Date.now()>=deadline)throw Error('官方分析采集超时，请重试；已采到的周期已保存');
          networkFailed=false;const selection=await capture(tab.id,period);if(selection.handle!==account)throw Error('X 账号已切换');
          latest=await settled(period);
          const exported=await chrome.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression:'('+captureAnalyticsCsv.toString()+')()',returnByValue:true,awaitPromise:true});
          if(exported.exceptionDetails||typeof exported.result?.value!=='string')throw Error(exported.exceptionDetails?.exception?.description||'X 官方 CSV 未获取');
          latest.analytics.series=parseAnalyticsCsv(exported.result.value);latest.analytics.series_source='x_analytics_csv';latest.analytics.granularity='day';
          const expected=Number(period.slice(0,-1)),series=latest.analytics.series;
          if(series.length<expected||series.some((point,index)=>index&&Date.parse(point.date+'T00:00:00Z')-Date.parse(series[index-1].date+'T00:00:00Z')!==86400000))throw Error('X 官方 '+period+' CSV 逐日数据不完整，未作为完整周期保存');
          for(const name of Object.keys(latest.analytics.series[0].metrics).filter(name=>!['engagement_rate','net_follows'].includes(name))){
            if(latest.analytics.series.every(point=>point.metrics[name]!=null)){const value=latest.analytics.series.reduce((sum,point)=>sum+point.metrics[name],0);latest.analytics.metrics[name]={value,raw:String(value),approximate:false};}
          }
          await onSnapshot(latest);
          return latest;
         }catch(error){if(error.message.startsWith('X 账号已切换'))throw error;lastError=error;}
        }
        throw lastError||Error('未取得至少三个月的完整 CSV');
      }
      let lastError='页面未显示账号数据';
      for(let i=0;i<(creatorPage?40:60)&&Date.now()<deadline;i++){
        try{const value=await capture(tab.id,undefined,creatorPage?account:undefined);if(value.handle!==account)throw Error('X 账号已切换');if(creatorPage?value.creator: value.posts.length>0&&Object.keys(value.profile).length)return value;}catch(error){if(error.message.startsWith('X 账号已切换'))throw error;lastError=error.message;}
        await new Promise(resolve=>setTimeout(resolve,500));
      }
      const info=creatorPage?await chrome.tabs.get(tab.id):null;
      throw Error((creatorPage?'创作者进度':'个人主页')+'采集未完成：'+lastError+(info?'（页面：'+new URL(info.url).pathname+'，标题：'+(info.title||'').slice(0,80)+'）':''));
    }finally{if(analytics)chrome.debugger.onEvent.removeListener(network);if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});await chrome.tabs.remove(tab.id).catch(()=>{});}
  }
  async function collect(automatic=false,analytics=false){
    const deadline=Date.now()+85000;
    const {cdpTab,cdpAccount}=await session();if(!Number.isInteger(cdpTab))throw Error('请先连接当前 X 标签页');
    let snapshot=await capture(cdpTab);if(snapshot.handle!==cdpAccount)throw Error('X 账号已切换，请在插件中重新连接');
    const save=async value=>{if((await capture(cdpTab)).handle!==cdpAccount)throw Error('X 账号已切换，本次采集已取消');await call('ingest',value);};
    let failure;
    try{
      if(automatic)snapshot=await backgroundPage(cdpAccount,analytics,save,false,null,Math.min(deadline,Date.now()+80000));
      if(!automatic||!analytics)await save(snapshot);
      if(automatic&&!analytics)await backgroundPage(cdpAccount,true,save,false,null,deadline);
    }catch(error){failure=error;}
    // Qualification needs its own time budget even when analytics fails.
    if(automatic)try{await save(await backgroundPage(cdpAccount,false,null,true,null,Date.now()+25000));}catch(error){failure||=error;}
    if(failure)throw failure;
    await call('heartbeat',{client:await client(),account:snapshot.handle});return snapshot;
  }
  async function poll(){
    if(busy)return;busy=true;
    let job,id,cdpTab,cdpAccount;try{
      ({cdpTab,cdpAccount}=await session());if(!Number.isInteger(cdpTab))return;
      const current=await capture(cdpTab);if(current.handle!==cdpAccount)throw Error('账号已改变，请重新连接');
      id=await client();
      const localBlock=(await chrome.storage.session.get('automationBlock')).automationBlock;
      if(localBlock?.account===cdpAccount){const state=await call('automation',{account:cdpAccount});if(state.resumed_at>localBlock.at)await chrome.storage.session.remove('automationBlock');else if(!state.block)await call('automation_block',{account:cdpAccount,reason:localBlock.reason});}
      job=await call('claim',{client:id,account:cdpAccount});if(job){
       if(job.action==='capture_creator'){
        const value=await backgroundPage(cdpAccount,false,null,true,null,Date.now()+30000);
        if((await capture(cdpTab)).handle!==cdpAccount)throw Error('X 账号已改变，未保存资格数据');
        await call('ingest',value);await call('finish',{id:job.id,client:id});
       }else if(job.action==='capture_notifications'){
        job.client=id;await collectNotificationReplies(job,call,cdpAccount,async()=>{if((await capture(cdpTab)).handle!==cdpAccount)throw Error('X 账号已改变');});await call('finish',{id:job.id,client:id});
       }else if(job.action==='capture_for_you'){
        job.client=id;await collectForYou(job,call,cdpAccount,async()=>{if((await capture(cdpTab)).handle!==cdpAccount)throw Error('X 账号已改变');});await call('finish',{id:job.id,client:id});
       }else if(job.action==='capture_relationships'){
        job.client=id;await collectRelationships(job,call,cdpAccount,async()=>{if((await capture(cdpTab)).handle!==cdpAccount)throw Error('X 账号已改变');});await call('finish',{id:job.id,client:id});
       }else if(job.action==='rewrite_publish'){
        job.client=id;const outcome=await runPublication(job,call,cdpAccount,async()=>{if((await capture(cdpTab)).handle!==cdpAccount)throw Error('X 账号已改变');});
        if(outcome.tab_closed===false&&job.input?.task_id){await call('control_automation',{account:cdpAccount,id:job.input.task_id,enabled:false});outcome.cleanup_warning+=' 当前自动化已暂停，避免继续积累页面。';}
        await call('finish',{id:job.id,client:id,result:outcome});
       }else if(['follow_back','unfollow'].includes(job.action)){
        job.client=id;const outcome=await runAutomation(job,call,cdpAccount,async()=>{if((await capture(cdpTab)).handle!==cdpAccount)throw Error('X 账号已改变');});
        await call('finish',{id:job.id,client:id,result:outcome,error:outcome.blocked?outcome.reason:undefined});
       }else{if(!['capture','capture_analytics'].includes(job.action))throw Error('不支持此采集任务类型');await collect(true,job.action==='capture_analytics');await call('finish',{id:job.id,client:id});}
      }
      await chrome.storage.session.set({cdpError:''});
    }catch(error){if(job?.input?.task_id&&error.publicationResult?.tab_closed===false){try{await call('control_automation',{account:cdpAccount,id:job.input.task_id,enabled:false});error.publicationResult.cleanup_warning+=' 当前自动化已暂停，避免继续积累页面。';}catch{}}if(job&&id)await call('finish',{id:job.id,client:id,error:error.message.slice(0,2000),result:error.publicationResult||error.automationResult}).catch(()=>{});await chrome.storage.session.set({cdpError:error.message});}finally{busy=false;}
  }
  function closeSocket(){clearInterval(heartbeatTimer);const old=socket;socket=null;old?.close();}
  async function bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('X 连接检查超时，等待自动恢复')),12000);})]);}finally{clearTimeout(timer);}}
  function retry(error){
    if(stopped||authBlocked||retryTimer)return;
    const delay=Math.min(30000,1000*2**Math.min(retryAttempt++,5));
    chrome.storage.session.set({cdpWs:'disconnected',cdpError:error?.message||String(error||'连接已断开'),cdpRetryAt:Date.now()+delay}).catch(()=>{});
    retryTimer=setTimeout(()=>{retryTimer=null;resume().catch(()=>{});},delay);
  }
  async function heartbeat(){
    const active=socket;if(active?.readyState!==WebSocket.OPEN||heartbeating)return;
    if(Date.now()-lastPong>60000){closeSocket();retry(Error('WS 心跳回执超时，正在自动重连'));return;}
    heartbeating=true;
    try{
      const {cdpTab,cdpAccount}=await session();let state='logged_in',error='';
      try{const snapshot=await bounded(capture(cdpTab));if(snapshot.handle!==cdpAccount){state='account_changed';error='X 账号已切换，等待原绑定账号恢复';}
        else {const cookies=await bounded(chrome.debugger.sendCommand({tabId:cdpTab},'Network.getCookies',{urls:['https://x.com/']}));await call('refresh_x_session',sessionFromCookies(cookies.cookies||[]));}}
      catch(cause){error=cause.message.slice(0,500);state=/尚未识别登录账号|先登录 X/.test(error)?'logged_out':'page_unavailable';}
      if(active!==socket||active.readyState!==WebSocket.OPEN)return;
      active.send(JSON.stringify({type:'heartbeat',state,error,automation_supported:true,extension_version:chrome.runtime.getManifest().version}));await chrome.storage.session.set({cdpLoginState:state,cdpError:error});
    }finally{heartbeating=false;}
  }
  async function openSocket(){
    if(socket?.readyState===WebSocket.OPEN)return;
    if(connecting)return connecting;
    const {cdpTab,cdpAccount}=await session();if(!Number.isInteger(cdpTab)||!cdpAccount||stopped||authBlocked)return;
    connecting=(async()=>{
      const saved=await chrome.storage.local.get('cdpConfig'),config=bridgeConfig(saved.cdpConfig),id=await client();
      await new Promise((resolve,reject)=>{
        const active=new WebSocket(config.endpoint.replace(/^http:/,'ws:')+'/ws');socket=active;
        const timeout=setTimeout(()=>{reject(Error('WebSocket 连接超时，正在自动重连'));active.close();},8000);
        active.onopen=()=>{if(active===socket&&!stopped)active.send(JSON.stringify({token:config.token,client:id,account:cdpAccount,analytics_supported:true}));};
        active.onmessage=event=>{if(socket!==active)return;let value;try{value=JSON.parse(event.data);}catch{return;}
          if(value.type==='ready'){clearTimeout(timeout);lastPong=Date.now();retryAttempt=0;clearTimeout(retryTimer);retryTimer=null;chrome.storage.session.set({cdpWs:'connected',cdpError:'',cdpRetryAt:null});clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>heartbeat().catch(()=>{}),20000);heartbeat().catch(()=>{});resolve();}
          else if(value.type==='heartbeat')lastPong=Date.now();
          else if(value.type==='capture')poll();
          else if(value.type==='error'){clearTimeout(timeout);if(/密钥|配对/.test(value.error||'')){authBlocked=true;chrome.storage.session.set({cdpReconnectBlocked:true,cdpError:value.error});}reject(Error(value.error||'连接被拒绝'));active.close();}
        };
        active.onerror=()=>{clearTimeout(timeout);reject(Error('WebSocket 连接失败，正在自动重连'));active.close();};
        active.onclose=()=>{clearTimeout(timeout);if(socket===active){socket=null;clearInterval(heartbeatTimer);chrome.storage.session.set({cdpWs:'disconnected'});retry(Error('后台连接已断开，正在自动重连'));}reject(Error('后台连接已断开，正在自动重连'));};
      });
    })();
    try{return await connecting;}finally{connecting=null;}
  }
  async function resume(){
    if(restoring)return restoring;
    restoring=(async()=>{
      const current=await session(),saved=await chrome.storage.local.get(['cdpAutoConnect','cdpBinding']);
      if(stopped||saved.cdpAutoConnect===false||(await chrome.storage.session.get('cdpReconnectBlocked')).cdpReconnectBlocked)return;
      const binding=saved.cdpBinding||(/^[a-z0-9_]{1,15}$/.test(current.cdpAccount||'')?{account:current.cdpAccount,tabId:current.cdpTab}:null);
      if(!binding||!/^[a-z0-9_]{1,15}$/.test(binding.account||''))return;
      await chrome.storage.local.set({cdpBinding:binding});await chrome.alarms.create('onhold-cdp',{periodInMinutes:0.5});
      if(busy){await openSocket();return;}
      if(Number.isInteger(current.cdpTab)&&current.cdpAccount===binding.account){
        let attached=false;
        try{if(!usableTab(await chrome.tabs.get(current.cdpTab)))throw Error('绑定页已离开 X');await bounded(chrome.debugger.sendCommand({tabId:current.cdpTab},'Runtime.evaluate',{expression:'0',returnByValue:true}));attached=true;}catch{}
        if(attached){await openSocket();await heartbeat();return;}
      }
      await connect({pickX:true,expectedAccount:binding.account,preferredTab:binding.tabId,automatic:true});
    })();
    try{return await restoring;}catch(error){retry(error);throw error;}finally{restoring=null;}
  }
  chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='onhold-cdp')resume().catch(error=>chrome.storage.session.set({cdpError:error.message}));});
  chrome.debugger.onDetach.addListener(async source=>{const {cdpTab}=await session();if(source.tabId===cdpTab){try{await bounded(chrome.debugger.sendCommand({tabId:cdpTab},'Runtime.evaluate',{expression:'0',returnByValue:true}));return;}catch{}closeSocket();await chrome.storage.session.remove('cdpTab');await chrome.storage.session.set({cdpWs:'disconnected',cdpLastDisconnect:{at:Date.now(),reason:'X 调试连接已脱落'}});retry(Error('X 调试连接已脱落，正在自动恢复'));}});
  function usableTab(tab){return Number.isInteger(tab?.id)&&/^https:\/\/(x\.com|twitter\.com)\//.test(tab.url||'')&&(!new URL(tab.url).hash.startsWith('#onhold-')||new URL(tab.url).hash==='#onhold-connection');}
  async function connect({pickX=false,expectedAccount,preferredTab,automatic=false}={}){
    if(busy||restoring&&!automatic)throw Error('连接或采集正在执行，请稍后重试');busy=true;
    if(!automatic){stopped=false;authBlocked=false;await chrome.storage.session.remove('cdpReconnectBlocked');await chrome.storage.local.set({cdpAutoConnect:true});}
    let attachedTab,keep=false;
    try{
      await probe();await call('connections',{});
      let tabs=await chrome.tabs.query(pickX?{url:['https://x.com/*','https://twitter.com/*']}:{active:true,currentWindow:true});
      tabs=tabs.filter(usableTab).sort((a,b)=>Number(b.id===preferredTab)-Number(a.id===preferredTab)||(b.lastAccessed||0)-(a.lastAccessed||0)).slice(0,5);
      if(!tabs.length){const tab=await chrome.tabs.create({url:automatic?'https://x.com/home#onhold-connection':'https://x.com/home',active:false});if(automatic){await chrome.storage.local.set({cdpBinding:{account:expectedAccount,tabId:tab.id}});tabs=[tab];}else throw Error('请先登录 X，再点击「连接 X 助手插件」');}
      closeSocket();const old=await session();await chrome.storage.session.remove('cdpTab');if(Number.isInteger(old.cdpTab))await chrome.debugger.detach({tabId:old.cdpTab}).catch(()=>{});
      let snapshot,lastError;
      for(const tab of tabs){
        if(stopped)return;
        try{try{await bounded(chrome.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression:'0',returnByValue:true}));}catch{await bounded(chrome.debugger.attach({tabId:tab.id},'1.3'));}attachedTab=tab.id;snapshot=await bounded(capture(tab.id));if(expectedAccount&&snapshot.handle!==expectedAccount)throw Error('X 账号不匹配，等待原绑定账号恢复');break;}
        catch(error){lastError=error;snapshot=null;if(attachedTab===tab.id){await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});attachedTab=undefined;}}
      }
      if(!snapshot)throw lastError||Error('未找到原绑定账号，等待自动恢复');
      if(stopped)return;
      await chrome.storage.local.set({cdpBinding:{account:snapshot.handle,tabId:attachedTab}});
      const cookies=await bounded(chrome.debugger.sendCommand({tabId:attachedTab},'Network.getCookies',{urls:['https://x.com/']})),credentials=sessionFromCookies(cookies.cookies||[]);
      let cachedOwner;
      try{cachedOwner=await call('creator',{account:credentials.uid});}catch(error){if(authBlocked)throw error;}
      if(cachedOwner?.account&&cachedOwner.account!==snapshot.handle)throw Error('X 登录 UID 与页面账号不匹配，停止恢复');
      let refreshed=false;
      if(cachedOwner?.account===snapshot.handle)try{await call('refresh_x_session',credentials);refreshed=true;}catch(error){if(authBlocked)throw error;}
      if(!refreshed)await learnRequests(attachedTab,snapshot.handle,call);
      if((await bounded(capture(attachedTab))).handle!==snapshot.handle){await call('forget_x_session',{account:snapshot.handle});throw Error('X 账号已改变，等待原绑定账号恢复');}
      if(stopped)return;
      await call('heartbeat',{client:await client(),account:snapshot.handle});if(stopped)return;await chrome.storage.session.set({cdpTab:attachedTab,cdpAccount:snapshot.handle,cdpError:''});
      await chrome.storage.local.set({cdpBinding:{account:snapshot.handle,tabId:attachedTab}});if(stopped)return;await chrome.alarms.create('onhold-cdp',{periodInMinutes:0.5});keep=true;
      await openSocket();let cleanup;try{cleanup=await cleanupPublicationTabs(snapshot.handle,call,attachedTab);await chrome.storage.session.set({cdpCleanup:cleanup});}catch(error){cleanup={error:error.message};}return {account:snapshot.handle,posts:0,cleanup};
    }catch(error){retry(error);throw error;}finally{if(!keep&&Number.isInteger(attachedTab))await chrome.debugger.detach({tabId:attachedTab}).catch(()=>{});busy=false;}
  }
  return {resume,async account(){const {cdpTab}=await session();if(!Number.isInteger(cdpTab))throw Error('请先连接 X 助手');return (await capture(cdpTab)).handle;},async status(){const saved=await chrome.storage.local.get('cdpConfig');return {busy,...await chrome.storage.session.get(['cdpTab','cdpAccount','cdpError','cdpWs','cdpLoginState','cdpCleanup']),endpoint:saved.cdpConfig?.endpoint||'http://127.0.0.1:18431',configured:!!saved.cdpConfig?.token};},async overview(){
    const {cdpAccount}=await session();if(!cdpAccount)return null;
    const saved=(await chrome.storage.local.get('cdpOverviewCache')).cdpOverviewCache||{};
    try{
      const [dashboard,jobs,creator]=await Promise.all([call('dashboard',{account:cdpAccount,days:7}),call('jobs',{}),call('creator',{account:cdpAccount})]);
      if(dashboard.account!==cdpAccount)throw Error('后台尚无此账号的数据，请重新采集');
      const job=jobs.find(item=>item.account===cdpAccount),official=dashboard.analytics_periods?.['7d']||dashboard.analytics;
      const summary={analytics_periods:dashboard.analytics_periods?.['7d']?{'7d':dashboard.analytics_periods['7d']}:{},account:cdpAccount,postCount:dashboard.posts.length,lastCapture:official?.observed_at||dashboard.accounts.find(item=>item.handle===cdpAccount)?.last_seen||null,source:official?'X Analytics · '+official.data.period:'已采集帖子',metrics:Object.fromEntries(['followers','following','views','likes','replies','reposts'].map(name=>[name,(official?.data.metrics?.[name==='views'?'impressions':name]??dashboard.metrics[name])||null])),creator,job:job?{state:job.state,error:job.error,updated_at:job.updated_at}:null,stale:false};
      const {cdpAccount:active}=await session();if(active!==cdpAccount)return null;
      saved[cdpAccount]=summary;for(const key of Object.keys(saved).slice(0,-5))delete saved[key];await chrome.storage.local.set({cdpOverviewCache:saved});return summary;
    }catch(error){if(saved[cdpAccount])return {...saved[cdpAccount],stale:true,error:'后台离线，显示最近一次采集'};throw Error('请打开 OnHold 桌面端后重新连接');}
  },async bookmark(input){
    const {cdpAccount,cdpTab}=await session();if(!cdpAccount||(await capture(cdpTab)).handle!==cdpAccount)throw Error('请先连接当前 X 账号');
    if(input?.get)return call('bookmark',{account:cdpAccount,author:input.author,id:input.id});
    if(input?.remove)return call('remove_bookmark',{account:cdpAccount,author:input.author,id:input.id});
    return call('save_bookmark',{...input,account:cdpAccount});

  },async rewrite(source){
    const {cdpTab,cdpAccount}=await session();
    if(!Number.isInteger(cdpTab)||!cdpAccount||(await capture(cdpTab)).handle!==cdpAccount)throw Error('请先连接当前 X 账号');
    return call('enqueue_rewrite',{account:cdpAccount,source});
  },async prepareReload(){
    if(busy)throw Error('助手正在执行任务，请等待结束后升级');
    busy=true;
    try{
      const {cdpAccount}=await session(),jobs=await call('jobs',{});
      if(jobs.some(job=>(!cdpAccount||job.account===cdpAccount)&&['running','rewriting'].includes(job.state)))throw Error('当前账号有执行中的任务，请等待结束后升级');
    }catch(error){busy=false;throw error;}
  },async save(value){const config=bridgeConfig(value),previous=(await chrome.storage.local.get('cdpConfig')).cdpConfig;if(previous?.endpoint!==config.endpoint||previous?.token!==config.token){closeSocket();authBlocked=false;await chrome.storage.session.remove('cdpReconnectBlocked');await chrome.storage.local.remove('cdpOverviewCache');}await chrome.storage.local.set({cdpConfig:config});return true;},connect,async disconnect(){
    stopped=true;clearTimeout(retryTimer);retryTimer=null;closeSocket();const {cdpTab,cdpAccount}=await session();await chrome.storage.local.set({cdpAutoConnect:false});await chrome.alarms.clear('onhold-cdp');
    try{if(cdpAccount)await call('forget_x_session',{account:cdpAccount});}finally{if(Number.isInteger(cdpTab))await chrome.debugger.detach({tabId:cdpTab}).catch(()=>{});await chrome.storage.session.remove(['cdpTab','cdpAccount','cdpError','cdpLoginState','cdpRetryAt']);await chrome.storage.session.set({cdpWs:'disconnected'});}return true;
  },async collect(){if(busy)throw Error('采集任务正在执行');const {cdpAccount}=await session();if(!cdpAccount)throw Error('请先连接 X 账号');return call('enqueue',{account:cdpAccount,action:'capture_analytics'});}};
}

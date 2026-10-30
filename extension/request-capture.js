const operations={Viewer:'viewer',UserByScreenName:'profile',UserByRestId:'profile',UserTweets:'posts',Followers:'followers',Following:'following'};

export function requestKind(raw){
  let url;try{url=new URL(raw);}catch{return null;}
  if(url.protocol!=='https:'||!['x.com','twitter.com'].includes(url.hostname)||url.username||url.password||url.port)return null;
  const operation=url.pathname.match(/^\/i\/api\/graphql\/[A-Za-z0-9_-]+\/([A-Za-z0-9_]+)$/)?.[1];
  if(operation&&operations[operation])return operations[operation];
  if(operation&&/^(?:Get|Fetch).*analytics/i.test(operation))return 'analytics';
  if(operation&&/^(?:Get|Fetch).*?(?:Creator|Monetization|Eligibility|Rewards)/i.test(operation))return 'creator';
  if(url.pathname==='/i/api/1.1/friends/list.json')return 'following';
  if(url.pathname==='/i/api/1.1/followers/list.json')return 'followers';
  return null;
}

export function userRecords(value){
  const users=new Map();let remaining=100000;
  function walk(node,depth=0){
    if(!node||typeof node!=='object'||depth>32||--remaining<0)return;
    if(!Array.isArray(node)){
      const legacy=node.legacy||{},core=node.core||{};
      const uid=node.rest_id||node.id_str,handle=core.screen_name||legacy.screen_name||node.screen_name;
      if(typeof uid==='string'&&/^[1-9]\d{0,19}$/.test(uid)&&typeof handle==='string'&&/^[A-Za-z0-9_]{1,15}$/.test(handle)){
        const flags=node.relationship_perspectives||legacy;
        users.set(uid,{uid,handle:handle.toLowerCase(),name:String(core.name||legacy.name||node.name||handle).slice(0,200),followers:legacy.followers_count??node.followers_count,following_count:legacy.friends_count??node.friends_count,following:typeof flags.following==='boolean'?flags.following:typeof node.following==='boolean'?node.following:null,followed_by:typeof flags.followed_by==='boolean'?flags.followed_by:typeof node.followed_by==='boolean'?node.followed_by:null});
      }
    }
    for(const child of Object.values(node))walk(child,depth+1);
  }
  walk(value);return [...users.values()];
}

export function sessionFromCookies(cookies){
  const allowed=cookies.filter(cookie=>['auth_token','ct0','twid'].includes(cookie.name)).sort((a,b)=>a.name.localeCompare(b.name));
  const get=name=>allowed.find(cookie=>cookie.name===name)?.value;
  let twid;try{twid=decodeURIComponent(get('twid')||'');}catch{throw Error('X 登录态无效，请重新登录');}
  const uid=twid.match(/^u=([1-9]\d{0,19})$/)?.[1];
  if(!uid||!get('auth_token')||!get('ct0'))throw Error('未取得 X 登录态，请先登录后重新学习接口');
  if(allowed.some(cookie=>/[\r\n;]/.test(cookie.value)))throw Error('X 登录态格式无效');
  return {uid,cookie:allowed.map(cookie=>cookie.name+'='+cookie.value).join('; '),csrf:get('ct0')};
}

export async function learnRequests(boundTab,screenName,call){
  const cookies=await chrome.debugger.sendCommand({tabId:boundTab},'Network.getCookies',{urls:['https://x.com/']});
  const session=sessionFromCookies(cookies.cookies||[]),templates=new Map(),requests=new Map();let authorization='',userAgent='',tab,attached=false,last=Date.now(),pending=new Set();
  const captures=[];
  const network=(source,method,event)=>{
    if(source.tabId!==tab?.id)return;
    if(method==='Network.requestWillBeSent'){
      const kind=requestKind(event.request?.url);if(!['profile','posts','analytics','creator'].includes(kind)||event.request.method!=='GET')return;
      let variables;try{variables=JSON.parse(new URL(event.request.url).searchParams.get('variables')||'{}');}catch{return;}
      if(variables.cursor||variables.userId&&variables.userId!==session.uid||variables.screen_name&&variables.screen_name.toLowerCase()!==screenName.toLowerCase())return;
      const headers=Object.fromEntries(Object.entries(event.request.headers||{}).map(([key,value])=>[key.toLowerCase(),String(value)]));
      if(headers.authorization?.startsWith('Bearer '))authorization=headers.authorization;
      if(headers['user-agent'])userAgent=headers['user-agent'];
      requests.set(event.requestId,{kind,url:event.request.url,method:'GET'});pending.add(event.requestId);last=Date.now();
    }
    if(method==='Network.requestWillBeSentExtraInfo'&&requests.has(event.requestId)){
      const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([key,value])=>[key.toLowerCase(),String(value)]));
      if(headers.authorization?.startsWith('Bearer '))authorization=headers.authorization;
      if(headers['user-agent'])userAgent=headers['user-agent'];
    }
    if(method==='Network.loadingFailed'){pending.delete(event.requestId);last=Date.now();}
    if(method==='Network.loadingFinished'&&requests.has(event.requestId)){
      const item=requests.get(event.requestId);
      const capture=(async()=>{
        try{
          const response=await chrome.debugger.sendCommand({tabId:tab.id},'Network.getResponseBody',{requestId:event.requestId});
          const text=response.base64Encoded?atob(response.body):response.body;if(text.length>2_000_000)return;
          const value=JSON.parse(text);
          if(value.errors?.length)return;
          if(item.kind==='profile'&&!userRecords(value).some(user=>user.uid===session.uid&&user.handle===screenName.toLowerCase()))return;
          templates.set(item.kind,item);
        }catch{}finally{pending.delete(event.requestId);last=Date.now();}
      })();captures.push(capture);
    }
  };
  try{
    tab=await chrome.tabs.create({url:'about:blank',active:false});
    await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;
    chrome.debugger.onEvent.addListener(network);
    await chrome.debugger.sendCommand({tabId:tab.id},'Network.enable');
    await chrome.debugger.sendCommand({tabId:tab.id},'Page.enable');
    for(const route of ['/'+screenName,'/i/account_analytics','/i/jf/creators/original_content_rewards']){
      const navigation=await chrome.debugger.sendCommand({tabId:tab.id},'Page.navigate',{url:'https://x.com'+route});
      if(navigation.errorText)throw Error('接口学习页面加载失败');
      const start=Date.now();last=start;
      while(Date.now()-start<15000){await new Promise(resolve=>setTimeout(resolve,250));if(Date.now()-start>2500&&!pending.size&&Date.now()-last>1000)break;}
    }
    await Promise.allSettled(captures);
    if(!authorization||!templates.has('profile'))throw Error('未学习到当前账号的认证接口，请回到 X 主页后重试');
    const current=await chrome.debugger.sendCommand({tabId:boundTab},'Network.getCookies',{urls:['https://x.com/']});
    if(sessionFromCookies(current.cookies||[]).cookie!==session.cookie)throw Error('登录态已改变，请重新连接');
    return await call('learn_x_session',{uid:session.uid,handle:screenName,headers:{authorization,cookie:session.cookie,'x-csrf-token':session.csrf,...(userAgent?{'user-agent':userAgent}:{})},templates:[...templates.values()]});
  }finally{
    chrome.debugger.onEvent.removeListener(network);
    if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});
    if(tab)await chrome.tabs.remove(tab.id).catch(()=>{});
  }
}

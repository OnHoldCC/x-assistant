import {requestKind} from './request-capture.js';

export function parseRelationshipPage(value,kind,currentCursor=null){
 if(!['followers','following'].includes(kind)||value?.errors?.length)throw Error('X 关系名单返回错误');
 const items=new Map();let next=null,hasEnd=false,found=false,terminated=false;
 function instructions(node){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node.instructions)){
   found=true;
   for(const instruction of node.instructions){
    if(instruction.type==='TimelineTerminateTimeline'&&instruction.direction==='Bottom'){hasEnd=true;terminated=true;}
    for(const entry of instruction.entries||[]){
     const content=entry.content||{};
     if(content.cursorType==='Bottom'){hasEnd=true;next=typeof content.value==='string'&&content.value?content.value:null;continue;}
     if(!/^user-\d+$/.test(entry.entryId||'')||content.promotedMetadata)continue;
     let user=content.itemContent?.user_results?.result;if(user?.user)user=user.user;
     if(!user||user.__typename==='UserUnavailable')continue;
     const uid=user.rest_id,handle=user.core?.screen_name||user.legacy?.screen_name,name=user.core?.name||user.legacy?.name||handle;
     if(!/^[1-9]\d{0,19}$/.test(uid||'')||!/^[A-Za-z0-9_]{1,15}$/.test(handle||'')||typeof name!=='string'||name.length>100)throw Error('X 名单用户结构不支持');
     const relation={...user.legacy,...user.relationship_perspectives};
     items.set(uid,{uid,handle:handle.toLowerCase(),name,following:typeof relation.following==='boolean'?relation.following:null,followed_by:typeof relation.followed_by==='boolean'?relation.followed_by:null});
    }
   }
  }
  for(const [key,child] of Object.entries(node))if(key!=='instructions'&&child&&typeof child==='object')instructions(child);
 }
 instructions(value.data);
 if(!found||!hasEnd)throw Error('X 名单分页结构不支持，保留已有数据');
 if(terminated)next=null;
 if(next===currentCursor&&next!==null){if(items.size)throw Error('X 名单游标未推进');next=null;}
 return {items:[...items.values()],next_cursor:next,complete:next===null};
}

export async function collectRelationships(job,call,owner,verify){
 const {kind,owner_uid:uid,generation}=job.input||{};
 if(job.action!=='capture_relationships'||job.account!==owner||!['following','followers'].includes(kind)||!/^[1-9]\d{0,19}$/.test(uid||'')||!generation)throw Error('关系同步任务无效');
 const tab=await chrome.tabs.create({url:'about:blank',active:false});let attached=false,timer;
 const requests=new Map();let resolveInitial,rejectInitial;
 const initial=new Promise((resolve,reject)=>{resolveInitial=resolve;rejectInitial=reject;});
 // Register the rejection handler before navigation can fail.
 initial.catch(()=>{});
 const command=(method,params={})=>chrome.debugger.sendCommand({tabId:tab.id},method,params);
 const network=async(source,method,event)=>{
  if(source.tabId!==tab.id)return;
  if(method==='Network.requestWillBeSent'&&event.request?.method==='GET'&&requestKind(event.request.url)===kind){
   try{const url=new URL(event.request.url),variables=JSON.parse(url.searchParams.get('variables'));if(String(variables.userId)!==uid||variables.cursor)return;
    const headers=Object.fromEntries(Object.entries(event.request.headers||{}).filter(([key])=>['authorization','x-csrf-token','x-twitter-auth-type','x-twitter-active-user','x-client-transaction-id'].includes(key.toLowerCase())));
    requests.set(event.requestId,{url:url.href,headers});
   }catch{}
  }
  const request=requests.get(event.requestId);if(!request)return;
  if(method==='Network.loadingFailed')rejectInitial(Error('X 名单请求失败，请稍后重试'));
  if(method==='Network.responseReceived'&&event.response.status>=400)rejectInitial(Error(event.response.status===429?'X 名单请求限流，请稍后重试':'X 名单不可访问，请检查登录状态'));
  if(method==='Network.loadingFinished'){
   try{const response=await command('Network.getResponseBody',{requestId:event.requestId});const text=response.base64Encoded?new TextDecoder().decode(Uint8Array.from(atob(response.body),char=>char.charCodeAt(0))):response.body;if(text.length>2000000)throw Error('名单页面过大');resolveInitial({...request,value:JSON.parse(text)});}catch{rejectInitial(Error('无法读取 X 名单响应'));}
  }
 };
 try{
  await verify();await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;
  chrome.debugger.onEvent.addListener(network);await command('Network.enable');await command('Page.enable');
  timer=setTimeout(()=>rejectInitial(Error('未捕获到当前账号的名单接口，请确认列表可访问')),20000);
  await command('Page.navigate',{url:'https://x.com/'+owner+'/'+kind+'#onhold-dashboard-reader'});
  const template=await initial;clearTimeout(timer);
  let cursor=job.input.cursor??null;
  for(let page=0;page<3;page++){
   await verify();let value=template.value;
   if(cursor!==null||page>0){
    const url=new URL(template.url),variables=JSON.parse(url.searchParams.get('variables'));variables.cursor=cursor;url.searchParams.set('variables',JSON.stringify(variables));
    const fetchPage=async(url,headers)=>{const response=await fetch(url,{method:'GET',headers,credentials:'include',redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('X 名单返回 HTTP '+response.status);const text=await response.text();if(text.length>2000000)throw Error('名单页面过大');return JSON.parse(text);};
    const response=await command('Runtime.evaluate',{expression:'('+fetchPage.toString()+')('+JSON.stringify(url.href)+','+JSON.stringify(template.headers)+')',awaitPromise:true,returnByValue:true});
    if(response.exceptionDetails||!response.result?.value)throw Error('X 名单下一页未取得，已保留同步进度');value=response.result.value;
   }
   const result=parseRelationshipPage(value,kind,cursor);
   await verify();await call('save_relationship_page',{account:owner,id:job.id,client:job.client,cursor,...result});
   cursor=result.next_cursor;if(result.complete)return;
  }
 }finally{clearTimeout(timer);chrome.debugger.onEvent.removeListener(network);if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});await chrome.tabs.remove(tab.id).catch(()=>{});}
}

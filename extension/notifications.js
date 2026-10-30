export function parseNotificationReplies(value,owner,uid){
 if(!/^[a-z0-9_]{1,15}$/.test(owner)||!/^\d{1,30}$/.test(uid))throw Error('当前账号标识无效');
 const objects=[],users=new Map(),posts=new Map(),visible=new Set();let count=0;
 function walk(node){if(!node||typeof node!=='object')return;if(++count>50000)throw Error('通知响应过大');objects.push(node);for(const child of Object.values(node))if(child&&typeof child==='object')walk(child);}
 walk(value);
 if(!objects.some(node=>Array.isArray(node.instructions)||Array.isArray(node.entries)))throw Error('X 通知响应结构无法识别，未创建回复任务');
 // Only tweet entries are incoming messages; tweets embedded in like/follow cards are not replies.
 for(const node of objects)if(/^tweet-\d+$/.test(node.entryId||'')){
  visible.add(node.entryId.slice(6));
  const item=node.content?.item?.content||node.content?.itemContent;
  const id=item?.tweet?.id||item?.tweet_results?.result?.rest_id;
  if(/^\d{1,30}$/.test(id||''))visible.add(id);
 }
 for(const node of objects){const id=node.rest_id||node.id_str,handle=node.core?.screen_name||node.legacy?.screen_name||node.screen_name;if(/^\d{1,30}$/.test(id||'')&&/^[A-Za-z0-9_]{1,15}$/.test(handle||''))users.set(id,handle.toLowerCase());}
 for(const node of objects){
  const tweet=node.legacy||node,id=node.rest_id||tweet.id_str;
  if(!visible.has(id)||!/^\d{1,30}$/.test(id||'')||tweet.in_reply_to_user_id_str!==uid||!/^\d{1,30}$/.test(tweet.in_reply_to_status_id_str||''))continue;
  const user=node.core?.user_results?.result,author=user?.core?.screen_name||user?.legacy?.screen_name||users.get(tweet.user_id_str);
  const note=node.note_tweet?.note_tweet_results?.result?.text;
  const text=note||tweet.full_text;
  if(!/^[A-Za-z0-9_]{1,15}$/.test(author||'')||author.toLowerCase()===owner||typeof text!=='string'||!text.trim()||text.length>48000||(!note&&tweet.truncated))continue;
  const handle=author.toLowerCase();posts.set(id,{id,author:handle,url:'https://x.com/'+handle+'/status/'+id,text:text.trim(),complete:true,in_reply_to_user_id:uid,in_reply_to_status_id:tweet.in_reply_to_status_id_str});
 }
 return [...posts.values()];
}
export function inspectNotificationPage(owner){
 if(location.href==='about:blank')return {ready:false};
 if(location.origin!=='https://x.com'||!/^\/notifications(?:\/mentions)?\/?$/.test(location.pathname))throw Error('通知页面已改变');
 const account=document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase();
 if(account&&account!==owner)throw Error('X 账号已改变，停止读取通知');
 const followers=new Set();
 for(const row of document.querySelectorAll('main [data-testid="notification"]')){
  const text=row.innerText||'';
  if(row.querySelector('[data-testid="tweetText"],article')||!/\bfollowed you\b|关注了你|开始关注你/i.test(text)||/\bliked\b|\breposted\b|赞了|转发了/i.test(text))continue;
  for(const link of row.querySelectorAll('a[href]')){
   const url=new URL(link.href,location.href),handle=url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase();
   if(url.origin===location.origin&&handle&&handle!==owner&&!['home','explore','notifications','messages','settings','search'].includes(handle))followers.add(handle);
  }
 }
 return {ready:account===owner,loading:!!document.querySelector('main [role="progressbar"]'),followers:[...followers].slice(0,100)};
}
export async function collectNotificationReplies(job,call,owner,verify){
 const {limit,owner_uid:uid}=job.input||{};
 const followBack=job.input?.publication_mode==='follow_back';
 if(job.action!=='capture_notifications'||job.account!==owner||!Number.isInteger(limit)||limit<1||limit>20||!/^\d{1,30}$/.test(uid||''))throw Error('通知回复任务无效');
 const tab=await chrome.tabs.create({url:'about:blank',active:false});let attached=false,observed=false,failure='',lastResponse=Date.now();
 const command=(method,params={})=>chrome.debugger.sendCommand({tabId:tab.id},method,params),requests=new Set(),posts=new Map(),followers=new Set(),known=new Set(job.input.known_ids||[]);
 const network=async(source,method,event)=>{
  if(source.tabId!==tab.id)return;
  if(method==='Network.responseReceived'&&/https:\/\/x\.com\/i\/api\//.test(event.response?.url||'')&&/notifications\/|\/(?:Notifications|Notification|Mentions)[A-Za-z_]*(?:\?|$)/i.test(event.response.url)){
   if(event.response.status>=400){failure='X 通知请求返回 HTTP '+event.response.status;return;}requests.add(event.requestId);
  }
  if(!requests.has(event.requestId))return;
  if(method==='Network.loadingFailed'){failure='X 通知读取失败';requests.delete(event.requestId);}
  if(method==='Network.loadingFinished'){
   try{const body=await command('Network.getResponseBody',{requestId:event.requestId});const text=body.base64Encoded?new TextDecoder().decode(Uint8Array.from(atob(body.body),char=>char.charCodeAt(0))):body.body;if(text.length>2000000)throw Error('通知响应过大');const value=JSON.parse(text);if(value.errors?.length)throw Error('X 通知返回错误');for(const post of parseNotificationReplies(value,owner,uid))if(!known.has(post.id))posts.set(post.id,post);observed=true;lastResponse=Date.now();}catch(error){failure=error.message;}finally{requests.delete(event.requestId);}
  }
 };
 try{
  await verify();await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;chrome.debugger.onEvent.addListener(network);await command('Network.enable');await command('Page.enable');
  const navigation=await command('Page.navigate',{url:'https://x.com/notifications'+(followBack?'':'/mentions')+'#onhold-notifications'});if(navigation.errorText)throw Error('X 通知页面打开失败');
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
   await verify();if(!(await call('automation_can_run',{account:owner,task_id:job.input.task_id})).allowed)throw Error('通知自动回复已暂停');
   if(failure)throw Error(failure);
   const result=await command('Runtime.evaluate',{expression:'('+inspectNotificationPage.toString()+')('+JSON.stringify(owner)+')',returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||'通知页面未就绪');
   ready=result.result?.value?.ready;
   if(ready)for(const handle of result.result.value.followers||[])followers.add(handle);
   if(ready&&observed&&!requests.size&&Date.now()-lastResponse>1000)break;
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready||!observed)throw Error('未取得可识别的真实通知响应，未创建回复任务');if(failure)throw Error(failure);
  await verify();return followBack
   ?await call('queue_notification_follows',{id:job.id,client:job.client,targets:[...followers].slice(0,limit)})
   :await call('queue_feed_replies',{id:job.id,client:job.client,posts:[...posts.values()].slice(0,limit)});
 }finally{chrome.debugger.onEvent.removeListener(network);if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});await chrome.tabs.remove(tab.id).catch(()=>{});}
}

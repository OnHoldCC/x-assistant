export function inspectAutomationPage(target,phase,action){
 if(location.protocol!=='https:'||!['x.com','twitter.com'].includes(location.hostname)||!/^[a-z0-9_]{1,15}$/.test(target))throw Error('自动化来源无效');
 const owner=document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase();
 const alert=[...document.querySelectorAll('[role="alert"],[data-testid="toast"],[role="dialog"]')].map(node=>node.innerText).join(' ');
 const reason=/follow (?:any )?more|follow limit|unable to follow|关注.*上限|无法关注更多/i.test(alert)?'关注受限':/rate limit|too many|try again later|频繁|稍后再试/i.test(alert)?'操作过于频繁':/verify|verification|account.*lock|验证|账号.*锁定/i.test(alert)||/\/account\/access/.test(location.pathname)?'账号需要验证':null;
 if(reason)return {owner,blocked:true,reason};
 if(phase==='candidates'){
  if(!owner||location.pathname.toLowerCase()!=='/'+owner+'/followers')throw Error('不是当前账号的关注者列表');
  const targets=[...document.querySelectorAll('[data-testid="UserCell"]')].flatMap(cell=>{
   if([...cell.querySelectorAll('button')].some(button=>/^(Following|已关注|正在关注)$/.test(button.innerText.trim())))return [];
   const link=[...cell.querySelectorAll('a[href]')].map(a=>new URL(a.href).pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase()).find(Boolean);return link&&link!==owner?[link]:[];
  });const ready=!!document.querySelector('[data-testid="UserCell"]')||!!document.querySelector('[data-testid="emptyState"]');return {owner,ready,targets:[...new Set(targets)]};
 }
 if(location.pathname.toLowerCase()!=='/'+target)throw Error('作者页面未就绪');
 const name=document.querySelector('[data-testid="UserName"]'),scope=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
 if(!name||!scope||!new RegExp('@'+target+'(?:\\b|$)','i').test(name.innerText))return {owner,ready:false};
 const buttons=[...scope.querySelectorAll('button,[role="button"]')],label=node=>(node.getAttribute('aria-label')||node.innerText||'').trim();
 const following=buttons.find(node=>/Following|已关注|正在关注/.test(label(node))&&(/unfollow$/.test(node.getAttribute('data-testid')||'')||new RegExp('^(Following(?: @'+target+')?|已关注|正在关注)$','i').test(label(node))));
 const follow=buttons.find(node=>!following&&(/-follow$/.test(node.getAttribute('data-testid')||'')||new RegExp('^(Follow(?: back)?(?: @'+target+')?|关注|回关)$','i').test(label(node))));
 const pending=buttons.some(node=>/^(Pending|Requested|等待中|已请求)/i.test(label(node)));
 const followsYou=!!name.parentElement.querySelector('[data-testid="userFollowIndicator"]')||/Follows you|关注了你|已关注你/.test(name.parentElement.innerText);
 if(phase==='confirm'){
  const dialog=document.querySelector('[role="dialog"]'),confirm=dialog?.querySelector('[data-testid="confirmationSheetConfirm"]');
  if(confirm&&new RegExp('@'+target+'(?:\\b|$)','i').test(dialog.innerText)&&/Unfollow|取消关注/i.test(confirm.innerText)){confirm.click();return {owner,confirmed:true};}
  return {owner,confirmed:false};
 }
 if(phase==='act'){
  if(action==='follow_back'&&!following&&follow&&followsYou&&!pending){follow.click();return {owner,clicked:true};}
  if(action==='unfollow'&&following&&!followsYou&&!pending){following.click();return {owner,clicked:true};}
  return {owner,clicked:false};
 }
 return {owner,ready:!!(following||follow||pending),following:!!following,follows_you:followsYou,pending};
}
export async function runAutomation(job,call,owner,verify){
 const input=job.input;if(!input?.task_id||!['follow_back','unfollow'].includes(job.action)||!Number.isInteger(input.limit)||input.limit<1||input.limit>20)throw Error('自动化任务参数无效');
 const result={completed:[],skipped:[],blocked:false,reason:''},deadline=Date.now()+90000;
 const tab=await chrome.tabs.create({url:'about:blank',active:false});let attached=false,blockedReason='',writes=0,successful=0;
 const pending=new Set();
 const network=async(source,method,event)=>{
  if(source.tabId!==tab.id)return;
  if(method==='Network.requestWillBeSent'&&event.request?.method==='POST'&&/^https:\/\/(x\.com|twitter\.com)\//.test(event.request.url)&&/friendships|CreateFriendship|DestroyFriendship|\/Follow|\/Unfollow/i.test(event.request.url)){pending.add(event.requestId);writes++;}
  if(method==='Network.responseReceived'&&pending.has(event.requestId)){if(event.response.status===429)blockedReason='操作过于频繁';else if(event.response.status>=400)blockedReason='操作结果不确定';}
  if(method==='Network.loadingFailed'&&pending.delete(event.requestId))blockedReason='操作结果不确定';
  if(method==='Network.loadingFinished'&&pending.has(event.requestId)){
   try{const response=await chrome.debugger.sendCommand({tabId:tab.id},'Network.getResponseBody',{requestId:event.requestId});const text=response.base64Encoded?atob(response.body):response.body;if(text.length>100000)throw Error('response too large');const value=text?JSON.parse(text):{},errors=value.errors||[];
    if(errors.length){const codes=errors.map(error=>error.code);blockedReason=codes.includes(161)?'关注受限':codes.includes(88)?'操作过于频繁':codes.some(code=>[32,326].includes(code))?'账号需要验证':'操作结果不确定';}
    else if(!blockedReason)successful++;
   }catch{blockedReason='操作结果不确定';}finally{pending.delete(event.requestId);}
  }
 };
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const inspect=async(target,phase)=>{const value=await chrome.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression:'('+inspectAutomationPage.toString()+')('+JSON.stringify(target)+','+JSON.stringify(phase)+','+JSON.stringify(job.action)+')',returnByValue:true});if(value.exceptionDetails)throw Error('X 页面未就绪');return value.result?.value;};
 async function block(reason){result.blocked=true;result.reason=reason;const at=Date.now();await chrome.storage.session.set({automationBlock:{account:owner,reason,at}});await call('automation_block',{account:owner,reason}).catch(()=>{});}
 try{
  await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;chrome.debugger.onEvent.addListener(network);await chrome.debugger.sendCommand({tabId:tab.id},'Network.enable');await chrome.debugger.sendCommand({tabId:tab.id},'Page.enable');
  let targets=input.targets||[];
  if(job.action==='follow_back'&&input.scope==='automation_owned'&&!Array.isArray(input.targets)){
   await chrome.debugger.sendCommand({tabId:tab.id},'Page.navigate',{url:'https://x.com/'+owner+'/followers#onhold-dashboard-reader'});
   let ready=false;
   for(let attempt=0;attempt<30;attempt++){let page;try{page=await inspect(owner,'candidates');}catch{await pause(300);continue;}if(page.blocked){await block(page.reason);return result;}if(page.owner!==owner)throw Error('账号已改变');if(page.ready){targets=page.targets||[];ready=true;break;}await pause(300);}
   if(!ready)throw Error('关注者列表尚未加载，本次未执行关注');
  }
  for(const target of [...new Set(targets)].slice(0,input.limit)){
   if(!/^[a-z0-9_]{1,15}$/.test(target)||target===owner)throw Error('目标账号无效');
   if(Date.now()>deadline)break;
   await verify();const allowed=await call('automation_can_run',{account:owner,task_id:input.task_id});if(!allowed.allowed)break;
   if(blockedReason){await block(blockedReason);break;}
   await chrome.debugger.sendCommand({tabId:tab.id},'Page.navigate',{url:'https://x.com/'+target+'#onhold-dashboard-reader'});
   let page;
   for(let attempt=0;attempt<40;attempt++){try{page=await inspect(target,'inspect');if(page.blocked||page.ready)break;}catch{}await pause(250);}
   if(page?.blocked){await block(page.reason);break;}
   if(page?.owner!==owner||!page.ready){await block('账号需要验证');break;}
   const eligible=job.action==='follow_back'?!page.following&&page.follows_you&&!page.pending:page.following&&!page.follows_you&&!page.pending;
   if(!eligible){result.skipped.push(target);continue;}
   await verify();const gate=await call('automation_can_run',{account:owner,task_id:input.task_id});if(!gate.allowed)break;
   const before=writes,confirmedBefore=successful;const clicked=await inspect(target,'act');if(!clicked.clicked){result.skipped.push(target);continue;}
   if(job.action==='unfollow'){await pause(300);const confirm=await inspect(target,'confirm');if(!confirm.confirmed){await block('操作结果不确定');break;}}
   let verified=false;
   for(let attempt=0;attempt<30;attempt++){
    await pause(200);page=await inspect(target,'inspect');if(page?.blocked)blockedReason=page.reason;
    if(blockedReason)break;
    if(writes>before&&successful>confirmedBefore&&!pending.size&&page.ready&&(job.action==='follow_back'?page.following:!page.following)){verified=true;break;}
   }
   if(blockedReason||!verified){await block(blockedReason||'操作结果不确定');break;}
   result.completed.push(target);await call('automation_progress',{id:job.id,client:job.client,target});await pause(1500);
  }
  return result;
 }catch(error){if(blockedReason&&!result.blocked)await block(blockedReason);if(result.completed.length)result.error='连接中断，已完成记录已保留';throw Object.assign(error,{automationResult:result});}
 finally{chrome.debugger.onEvent.removeListener(network);if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});await chrome.tabs.remove(tab.id).catch(()=>{});}
}

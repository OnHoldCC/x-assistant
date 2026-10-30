import './editor-text.js';

export function inspectEmptyTaskPage(readText,owner){
 if(location.href==='about:blank')return document.readyState==='complete';
 if(location.protocol!=='https:'||location.hostname!=='x.com'||document.readyState!=='complete'||!document.querySelector('main,[data-testid="primaryColumn"]'))return false;
 if(owner&&document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([a-zA-Z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase()!==owner)return false;
 return ![...document.querySelectorAll('[contenteditable="true"],textarea,input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="password"],input[type="url"]')].some(node=>(node.matches('input,textarea')?node.value:readText(node)).trim());
}

async function closeEmptyTaskTab(tabId,owner){
 let tab;
 try{tab=await chrome.tabs.get(tabId);}catch(error){if(/No tab with (?:given )?id|Invalid tab ID/i.test(error.message))return true;throw error;}
 if(tab.active||tab.pinned)return false;
 const inspected=await chrome.debugger.sendCommand({tabId},'Runtime.evaluate',{expression:'('+inspectEmptyTaskPage.toString()+')('+globalThis.OnHoldEditorText.toString()+','+JSON.stringify(owner||null)+')',returnByValue:true});
 if(inspected.exceptionDetails||inspected.result?.value!==true)return false;
 const latest=await chrome.tabs.get(tabId);if(latest.active||latest.pinned||latest.url!==tab.url)return false;
 let timer;try{await Promise.race([chrome.tabs.remove(tabId),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('close timeout')),2000);})]);return true;}finally{clearTimeout(timer);}
}

export async function cleanupPublicationTabs(account,call,boundTab){
 const tabs=(await chrome.tabs.query({url:['https://x.com/*']})).filter(tab=>tab.id!==boundTab&&!tab.active&&!tab.pinned&&['#onhold-reply','#onhold-publisher'].includes(new URL(tab.url).hash));
 if(!tabs.length)return {closed:0,retained:0};
 const cache=new Map();let closed=0,retained=0;
 for(const tab of tabs){
  const url=new URL(tab.url),target=url.pathname.match(/^\/([a-zA-Z0-9_]+)\/status\/(\d+)$/);
  if(url.hash!=='#onhold-reply'||!target){retained++;continue;}
  const source='https://x.com/'+target[1].toLowerCase()+'/status/'+target[2];
  if(!cache.has(source)){
   // shortcut: retain ambiguous or >100 matching records; persist task tab IDs if exact recovery at scale is needed.
   const records=[];let complete=false;
   for(let offset=0;offset<100;){const page=await call('job_records',{account,search:source,offset});records.push(...page.items);offset=page.offset+page.items.length;if(offset>=page.total||!page.items.length){complete=true;break;}}
   cache.set(source,complete?records:null);
  }
  const records=cache.get(source),matches=records?.filter(job=>job.action==='rewrite_publish'&&job.input?.mode==='reply'&&job.input?.source?.url===source);
  if(!matches?.length||matches.some(job=>!['completed','failed'].includes(job.state)||job.state==='failed'&&job.input?.stage==='sending')){retained++;continue;}
  let attached=false;
  try{await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;if(await closeEmptyTaskTab(tab.id,account))closed++;else retained++;}
  catch{retained++;}finally{if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});}
 }
 return {closed,retained};
}

export function inspectPublicationCleanup(owner,readText,target=null){
 if(location.protocol!=='https:'||location.hostname!=='x.com')return {clear:false};
 const paths=target?['/'+target.author+'/status/'+target.id,'/compose/post']:['/home'];
 if(!paths.includes(location.pathname)||document.readyState==='loading')return {clear:false};
 const account=document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase();
 if(account!==owner||!document.querySelector('main,[data-testid="primaryColumn"]'))return {clear:false};
 const selector='[data-testid^="tweetTextarea_"][contenteditable="true"]',editors=[...document.querySelectorAll(selector)];
 if(editors.some(editor=>readText(editor).trim()))return {clear:false};
 if([...document.querySelectorAll('[role="dialog"]')].some(dialog=>dialog.getBoundingClientRect().width>0&&!dialog.querySelector(selector)))return {clear:false};
 return {clear:editors.length>0||!!target};
}

export function inspectPublishPage(owner,readText,target=null,replyOpened=false,returnEditor=false) {
 if(location.href==='about:blank')return {ready:false};
 const path=target?'/'+target.author+'/status/'+target.id:'/home';
 if(location.protocol!=='https:'||location.hostname!=='x.com'||(location.pathname!==path&&!(target&&replyOpened&&location.pathname==='/compose/post')))throw Error('发布页面与任务目标不匹配');
 const account=document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]?.toLowerCase();
 if(!account)return {ready:false};
 if(account!==owner)throw Error('X 账号已改变，未发布');
 const alerts=[...document.querySelectorAll('[role="alert"],[data-testid="toast"]')].map(node=>node.innerText).join(' ');
 if(/rate limit|too many|try again later|频繁|稍后再试|verify|verification|验证|account.*lock/i.test(alerts))throw Error('X 操作受限，请在页面检查后再处理任务');
 const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(node=>node.getBoundingClientRect().width>0);
 if(dialogs.length&&!target)throw Error('X 页面有弹窗，未发布');
 const main=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main');
 const scope=dialogs[0]||main||(target&&replyOpened?document.body:null);
 const exact=target&&[...(scope?.querySelectorAll('article[data-testid="tweet"]')||[])].find(article=>article.querySelector('a:has(time)')?.getAttribute('href')?.split('?')[0]==='/'+target.author+'/status/'+target.id);
 if(target&&!exact&&!replyOpened){if(dialogs.length)throw Error('回复弹窗的原帖不匹配');return {ready:false};}
 const editor=scope?.querySelector('[data-testid="tweetTextarea_0"][contenteditable="true"]');
 const button=scope?.querySelector('[data-testid="tweetButtonInline"],[data-testid="tweetButton"]');
 if((!editor||!button)&&target&&exact&&!dialogs.length){
  const reply=exact.querySelector('[data-testid="reply"]');reply?.scrollIntoView({block:'center',behavior:'instant'});const rect=reply?.getBoundingClientRect();
  return rect?.width?{ready:false,openReply:{x:rect.x+rect.width/2,y:rect.y+rect.height/2}}:{ready:false};
 }
 if(!editor||!button)return {ready:false};
 if(returnEditor){if(readText(editor).trim())throw Error('输入框已有草稿，未改变焦点或输入');return editor;}
 (readText(editor).trim()?button:editor).scrollIntoView({block:'center',behavior:'instant'});
 const point=node=>{const rect=node.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;return rect.width>0&&rect.height>0&&x>=0&&y>=0&&x<innerWidth&&y<innerHeight&&node.contains(document.elementFromPoint(x,y))?{x,y}:null;};
 return {ready:true,focused:editor===document.activeElement||editor.contains(document.activeElement),documentFocused:document.hasFocus(),text:readText(editor).replace(/\r\n/g,'\n').trim(),editor:point(editor),button:point(button),enabled:!button.disabled&&button.getAttribute('aria-disabled')!=='true'};
}

export async function runPublication(job, call, owner, verify) {
 const text=job.input?.text;
 if(job.action!=='rewrite_publish'||job.account!==owner||job.input?.stage!=='ready'||typeof text!=='string'||!text.trim()||text.length>48000)throw Error('发布任务无效');
 const target=job.input?.mode==='reply'?job.input.source:null;
 if(job.input?.mode==='reply'&&!target)throw Error('回复目标缺失，未发送');
 if(target&&(!/^[a-z0-9_]{1,15}$/.test(target.author||'')||!/^\d{1,30}$/.test(target.id||'')||target.url!=='https://x.com/'+target.author+'/status/'+target.id))throw Error('回复目标无效');
 await verify();
 const tab=await chrome.tabs.create({url:target?target.url+'#onhold-reply':'https://x.com/home#onhold-publisher',active:false});
 let attached=false,published='',failure='',sending=false,typed=false,requestAllowed=false,replyOpened=false,closeReady=false;
 const pending=new Set();
 const command=(method,params={})=>chrome.debugger.sendCommand({tabId:tab.id},method,params);
 const pause=()=>new Promise(resolve=>setTimeout(resolve,250));
 const inspect=async()=>{const value=await command('Runtime.evaluate',{expression:'('+inspectPublishPage.toString()+')('+JSON.stringify(owner)+','+globalThis.OnHoldEditorText.toString()+','+JSON.stringify(target)+','+JSON.stringify(replyOpened)+')',returnByValue:true});if(value.exceptionDetails)throw Error(value.exceptionDetails.exception?.description||'X 发布页面未就绪');return value.result?.value;};
 const focusEditor=async()=>{
  const value=await command('Runtime.evaluate',{expression:'('+inspectPublishPage.toString()+')('+JSON.stringify(owner)+','+globalThis.OnHoldEditorText.toString()+','+JSON.stringify(target)+','+JSON.stringify(replyOpened)+',true)',returnByValue:false});
  if(value.exceptionDetails||value.result?.subtype!=='node'||!value.result.objectId)throw Error('未找到已核对的输入框，未输入或发布');
  try{await command('DOM.focus',{objectId:value.result.objectId});}finally{await command('Runtime.releaseObject',{objectId:value.result.objectId}).catch(()=>{});}
 };
 const network=async(source,method,event)=>{
  if(source.tabId!==tab.id)return;
  if(method==='Fetch.requestPaused'){
   let valid=false;
   try{const variables=JSON.parse(event.request.postData).variables;valid=sending&&!requestAllowed&&variables.tweet_text===text&&variables.reply?.in_reply_to_tweet_id===target.id;}catch{}
   if(!valid){failure='回复正文或原帖目标不匹配，已拦截发送';await command('Fetch.failRequest',{requestId:event.requestId,errorReason:'Aborted'}).catch(()=>{});}
   else {requestAllowed=true;await command('Fetch.continueRequest',{requestId:event.requestId}).catch(()=>{failure='回复发送请求无法继续，请核对结果';});}
   return;
  }
  if(method==='Network.requestWillBeSent'&&event.request?.method==='POST'&&/^https:\/\/x\.com\/i\/api\/graphql\/[^/]+\/CreateTweet(?:\?|$)/.test(event.request.url)){
   try{const variables=JSON.parse(event.request.postData).variables;if(variables?.tweet_text===text&&(!target||variables.reply?.in_reply_to_tweet_id===target.id))pending.add(event.requestId);}catch{}
  }
  if(!pending.has(event.requestId))return;
  if(method==='Network.responseReceived'&&event.response.status>=400)failure='X 发布返回 HTTP '+event.response.status+'，请核对结果';
  if(method==='Network.loadingFailed')failure='发布连接中断，请到 X 核对结果；不会自动重发';
  if(method==='Network.loadingFinished'){
   try{
    const response=await command('Network.getResponseBody',{requestId:event.requestId});
    const body=response.base64Encoded?atob(response.body):response.body;
    if(body.length>1000000)throw Error('发布结果过大');
    const value=JSON.parse(body);if(value.errors?.length)throw Error('X 未确认发布，请在页面检查结果');
    let post=value.data?.create_tweet?.tweet_results?.result;if(post?.tweet)post=post.tweet;
    const author=post?.core?.user_results?.result?.core?.screen_name||post?.core?.user_results?.result?.legacy?.screen_name;
    if(!/^\d{1,30}$/.test(post?.rest_id||'')||author?.toLowerCase()!==owner)throw Error('发布结果账号或帖子标识不匹配');
    if(target&&post?.legacy?.in_reply_to_status_id_str!==target.id)throw Error('X 回复回执的原帖不匹配，请核对结果');
    published='https://x.com/'+owner+'/status/'+post.rest_id;
   }catch(error){failure=error.message;}finally{pending.delete(event.requestId);}
  }
 };
 async function click(point){
  if(!point)throw Error('发布控件不可见，未点击');
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
 }
 try{
  await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;
  await command('Emulation.setFocusEmulationEnabled',{enabled:true});
  chrome.debugger.onEvent.addListener(network);await command('Network.enable');
  if(target)await command('Fetch.enable',{patterns:[{urlPattern:'https://x.com/i/api/graphql/*/CreateTweet*',requestStage:'Request'}]});
  let page;
  for(let attempt=0;attempt<60;attempt++){page=await inspect();if(page?.ready)break;if(page?.openReply){await click(page.openReply);replyOpened=true;}await pause();}
  if(!page?.ready)throw Error(target?'X 回复输入框未就绪':'X 首页输入框未就绪');
  if(page.text)throw Error((target?'回复框':'首页')+'存在未发送草稿，已保留，未覆盖或发布');
  await click(page.editor);
  await focusEditor();
  for(let attempt=0;attempt<10;attempt++){page=await inspect();if(page?.focused)break;await pause();}
  if(!page?.focused||page.text)throw Error('输入框未取得焦点或草稿已改变，未输入或发布');
  typed=true;await command('Input.insertText',{text});
  for(let attempt=0;attempt<40;attempt++){page=await inspect();if(page?.ready&&page.text===text&&page.enabled&&page.button)break;await pause();}
  if(!page?.ready)throw Error('输入后发布页面未就绪；草稿已保留，未发送');
  if(page.text!==text)throw Error('输入后正文校验失败（预期'+[...text].length+'字符，实际'+[...(page.text||'')].length+'字符，输入框焦点'+!!page.focused+'，页面焦点'+!!page.documentFocused+'）；草稿已保留，未发送');
  if(!page.enabled)throw Error('正文已填入，但 X 发送按钮仍禁用；草稿已保留，未发送');
  if(!page.button)throw Error('正文已填入，但 X 发送按钮被遮挡或不在视口内；草稿已保留，未发送');
  await verify();
  await call('begin_publish',{id:job.id,client:job.client});
  page=await inspect();if(page?.text!==text||!page.enabled)throw Error('发送前页面已变化，未再次尝试');
  sending=true;await click(page.button);
  for(let attempt=0;attempt<80&&!published&&!failure;attempt++)await pause();
  if(!published)throw Error(failure||'未收到明确发布结果，请到 X 核对；不会自动重发');
  const receipt=target?{url:published,reply_to:target.id}:{url:published};
  await call('finish',{id:job.id,client:job.client,result:{...receipt,tab_closed:false,cleanup_warning:'发送已确认，正在等待 X 页面清空后关闭。'}});
  // The network receipt can arrive before X clears its draft and leave-page guard.
  try{let stable=0;const until=Date.now()+8000;for(let attempt=0;attempt<32&&Date.now()<until;attempt++){
   let timer,state;try{state=await Promise.race([command('Runtime.evaluate',{expression:'('+inspectPublicationCleanup.toString()+')('+JSON.stringify(owner)+','+globalThis.OnHoldEditorText.toString()+','+JSON.stringify(target)+')',returnByValue:true}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('cleanup timeout')),2000);})]);}finally{clearTimeout(timer);}
   stable=!state.exceptionDetails&&state.result?.value?.clear?stable+1:0;
   if(stable>=4){closeReady=true;break;}await pause();
  }}catch{}
 }catch(error){
  let closed=false;
  if(!typed&&!sending&&attached)try{closed=await closeEmptyTaskTab(tab.id);}catch{}
  error.publicationResult={tab_closed:closed,...(!closed?{cleanup_warning:'任务未完成，页面保留供核对；不会自动关闭草稿或重发。'}:{})};
  throw error;
 }finally{
  chrome.debugger.onEvent.removeListener(network);
  if(attached&&target)await command('Fetch.disable').catch(()=>{});
  if(attached)await command('Emulation.setFocusEmulationEnabled',{enabled:false}).catch(()=>{});
  if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});
 }
 const result=target?{url:published,reply_to:target.id,tab_closed:false}:{url:published,tab_closed:false};
 if(closeReady){let timer;try{
  await Promise.race([chrome.tabs.remove(tab.id),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('close timeout')),2000);})]);result.tab_closed=true;
 }catch{result.cleanup_warning='发送已确认，但关闭标签页未完成；请核对保留的页面，不会重发。';}finally{clearTimeout(timer);}}
 else result.cleanup_warning='发送已确认，但 X 页面尚未清空输入框；标签页已保留，不会重发。';
 return result;
}

import {LANGUAGES} from './languages.mjs';
import './analysis-core.js';
import {DEFAULTS, validateSettings, translationAllowed, translationHosts, referenceOnly, translationParagraphs, translationChunks} from './core.js';

const WEB_ORIGINS=['https://*/*','http://*/*'];
chrome.action.setIcon({path:chrome.runtime.getManifest().action.default_icon}).catch(console.warn);
chrome.runtime.onInstalled.addListener(()=>chrome.storage.local.remove(['translationCache','postAnalysisCache','cache']));
const ready = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}).then(syncWebScripts);
let revision = 0;
const getConfig = async () => ({...DEFAULTS, ...(await chrome.storage.local.get('config')).config,enabled:false,collectMetrics:false,postAnalysis:false});
const publicConfig = (config,url) => ({enabled: config.enabled, autoTranslate: config.autoTranslate&&(!url||translationAllowed(url,config)), translatePageAllowed:!url||translationAllowed(url,config), allWebsites:config.allWebsites, composeTranslate:config.composeTranslate, composeTarget:config.composeTarget, readingTarget:config.readingTarget, languages:LANGUAGES, collectMetrics:config.collectMetrics, postAnalysis:config.postAnalysis, hideAds:config.hideAds, mode: config.mode, threshold: config.threshold});
const inferenceTasks=[];let activeInference=0;
function scheduleInference(task, priority=false) {
  return new Promise((resolve,reject)=>{
    inferenceTasks[priority?'unshift':'push']({task,resolve,reject});runInference();
  });
}
function runInference() {
  while(activeInference<2&&inferenceTasks.length){
    const item=inferenceTasks.shift();activeInference++;
    Promise.resolve().then(item.task).then(item.resolve,item.reject).finally(()=>{activeInference--;runInference();});
  }
}
async function localRequest(route,body,signal){
 const response=await fetch('http://127.0.0.1:18427'+route,{method:'POST',credentials:'omit',redirect:'error',signal:signal||AbortSignal.timeout(120000),headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const value=await response.json();if(!response.ok)throw new Error(value.error||'本机接口未完成请求');return value;
}
async function migrateBrowserData(){
 const old=await chrome.storage.local.get(['translationStats','statsMigrationId']);
 if(old.translationStats){const id=old.statsMigrationId||crypto.randomUUID();if(!old.statsMigrationId)await chrome.storage.local.set({statsMigrationId:id});await localRequest('/stats/import',{id,stats:old.translationStats});await chrome.storage.local.remove('translationStats');}
 await chrome.storage.local.remove(['translationCache','postAnalysisCache','cache']);
}
const analysisRequests=new Map();
async function analyzePost(text,sender,toChinese=false,purpose='post',account,draftId,sourceUrl,sourceKind,originalText,inputComplete,manual=false){
 if(typeof text!=='string'||!text.trim()||text.length>24000)throw new Error('评分支持 1–24000 字符的正文。');
 if(!(await getConfig()).postAnalysis&&!(manual&&purpose==='post'))throw new Error('推文分析已关闭。');
 if(!await chrome.permissions.contains({origins:['http://127.0.0.1:18427/*']}))throw new Error('请先保存插件设置，允许访问本机模型。');
 if(!['post','draft'].includes(purpose))throw new Error('无效的分析用途');
 const tab=(sender.tab?.id??'settings')+':'+purpose,control=new AbortController(),atRevision=revision;analysisRequests.get(tab)?.abort();analysisRequests.set(tab,control);
 try{const value=await localRequest('/analyze',{text,to_chinese:toChinese,purpose,account,draft_id:draftId,source_url:sourceUrl,input_source:sourceKind,original_text:originalText,input_complete:inputComplete},AbortSignal.any([control.signal,AbortSignal.timeout(180000)]));if(atRevision!==revision)throw new Error('设置已改变，分析取消');return value;}finally{if(analysisRequests.get(tab)===control)analysisRequests.delete(tab);}
}
if(chrome.alarms)chrome.alarms.clear('onhold-learning-snapshots');
async function observeContent(source,sender){
 if(!source||typeof source.original!=='string'&&!(source.original===null&&source.translation?.provider==='x_grok_dom'))throw new Error('无效正文');const current=new URL(sender.tab.url),url=new URL(source.url||current.href);
 const x=host=>['x.com','twitter.com'].includes(host);
 if(x(current.hostname)){if(!x(url.hostname)||!/^\/[^/]+\/status\/\d+/.test(url.pathname))throw new Error('无效帖子来源');}
 else if(url.origin!==current.origin)throw new Error('网页来源不匹配');
 return localRequest('/observe',{...source,url:url.href});
}
async function accountContext(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id||!/^https:\/\/(x\.com|twitter\.com)\//.test(tab.url||''))throw Error('请在已登录的 X 页面打开插件。');
 const value=await chrome.tabs.sendMessage(tab.id,{type:'READ_ACCOUNT_CONTEXT'});
 if(!/^[A-Za-z0-9_]{1,15}$/.test(value?.account||''))throw Error('尚未识别当前 X 账号，请刷新 X 页面后重试。');
 return value.account.toLowerCase();
}
const accountRefreshes=new Map();
async function readDashboard(account,kind){
 const path={analytics:'/i/account_analytics',creator:'/i/jf/creators/original_content_rewards',creator_status:'/i/jf/creators/studio'}[kind];
 const tab=await chrome.tabs.create({url:'https://x.com'+path+'#onhold-dashboard-reader',active:false});
 try{
  for(let attempt=0;attempt<40;attempt++){
   try{const value=await chrome.tabs.sendMessage(tab.id,{type:'READ_X_DASHBOARD',account,kind});if(value?.ready&&value.data?.account===account&&value.data.kind===kind)return value.data;}catch{}
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  throw Error((kind==='analytics'?'账号分析':'奖励资格进度')+'未获取；可能尚未加载或当前账号无权查看。');
 }finally{await chrome.tabs.remove(tab.id).catch(()=>{});}
}
async function accountSummary(refresh=false){
 const account=await accountContext(),saved=(await chrome.storage.local.get('xAccountSnapshots')).xAccountSnapshots||{},assumptions=(await chrome.storage.local.get('xEarningsAssumptions')).xEarningsAssumptions?.[account]||null;
 if(!refresh){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id&&new URL(tab.url).pathname==='/i/account_analytics'){
   try{const value=await chrome.tabs.sendMessage(tab.id,{type:'READ_X_DASHBOARD',account,kind:'analytics'});if(value?.ready&&value.data?.account===account&&value.data.kind==='analytics'&&await accountContext()===account){saved[account]={...saved[account],account,analytics:value.data,observed_at:Date.now()};await chrome.storage.local.set({xAccountSnapshots:saved});}}catch{}
  }
  return {account,snapshot:saved[account]||null,assumptions};
 }
 if(accountRefreshes.has(account))return accountRefreshes.get(account);
 const job=(async()=>{
  const values=await Promise.allSettled(['analytics','creator','creator_status'].map(kind=>readDashboard(account,kind)));
  if(await accountContext()!==account)throw Error('账号已改变，未显示其他账号的数据。');
  const snapshot={account,analytics:values[0].status==='fulfilled'?values[0].value:null,creator:values[1].status==='fulfilled'||values[2].status==='fulfilled'?{...(values[1].status==='fulfilled'?values[1].value:{}),...(values[2].status==='fulfilled'?{state:values[2].value.state,status_source:values[2].value.source}:{})}:null,errors:values.filter(value=>value.status==='rejected').map(value=>value.reason.message),observed_at:Date.now()};
  const current=(await chrome.storage.local.get('xAccountSnapshots')).xAccountSnapshots||{};current[account]=snapshot;
  for(const key of Object.keys(current).sort((a,b)=>current[b].observed_at-current[a].observed_at).slice(5))delete current[key];
  await chrome.storage.local.set({xAccountSnapshots:current});return {account,snapshot,assumptions};
 })();accountRefreshes.set(account,job);try{return await job;}finally{accountRefreshes.delete(account);}
}

async function syncWebScripts() {
  let config=await getConfig();
  const matches=translationHosts(config);
  const granted=!matches.length||await chrome.permissions.contains({origins:matches});
  if(config.allWebsites&&!granted){config={...config,allWebsites:false};await chrome.storage.local.set({config});}
  const registered=await chrome.scripting.getRegisteredContentScripts({ids:['local-page-translation']});
  if(config.allWebsites&&granted&&matches.length) {
    const script={id:'local-page-translation',matches,excludeMatches:['*://x.com/*','*://twitter.com/*'],js:['translation-ui.js','page-content.js'],runAt:'document_idle',persistAcrossSessions:true};
    if(registered.length)await chrome.scripting.updateContentScripts([script]);else await chrome.scripting.registerContentScripts([script]);
  } else if(registered.length)await chrome.scripting.unregisterContentScripts({ids:['local-page-translation']});
}
async function activateWebTabs() {
  const config=await getConfig();if(!config.allWebsites)return;
  const patterns=translationHosts(config);if(!patterns.length)return;
  const tabs=await chrome.tabs.query({url:patterns});
  await Promise.allSettled(tabs.filter(tab=>!/^https?:\/\/(x\.com|twitter\.com)\//.test(tab.url||'')).map(tab=>
    chrome.scripting.executeScript({target:{tabId:tab.id},files:['translation-ui.js','page-content.js']})));
}
chrome.permissions.onRemoved.addListener(()=>{revision++;syncWebScripts().then(notifyTabs).catch(()=>{});});

async function notifyTabs() {
  const config = await getConfig();
  const tabs = await chrome.tabs.query({url: WEB_ORIGINS});
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, {type: 'CONFIG_CHANGED', config:publicConfig(config,tab.url)})));
}

async function readFullPost(postUrl, expectedRevision, cancelled=()=>false) {
  if(typeof postUrl!=='string'||!/^https:\/\/(x\.com|twitter\.com)\/(?:[^/?#]+\/status|i\/web\/status)\/\d+$/.test(postUrl)) throw new Error('无法定位长帖，请打开帖子详情后重试。');
  const tab=await chrome.tabs.create({url:postUrl+'#x-local-full-reader',active:false});
  try {
    for(let attempt=0;attempt<50;attempt++) {
      if(expectedRevision!==revision||cancelled())throw new Error('全文读取已取消。');
      try {
        const data=await chrome.tabs.sendMessage(tab.id,{type:'READ_FULL_POST',postId:postUrl.split('/').at(-1)});
        if(data?.ready&&typeof data.text==='string'&&data.text.trim())return data.text;
      } catch(error) {if(error.message.includes('设置已'))throw error;}
      await new Promise(resolve=>setTimeout(resolve,300));
    }
    throw new Error('X 暂未返回全文；未把摘要当作全文翻译，请打开帖子后重试。');
  } finally {await chrome.tabs.remove(tab.id).catch(()=>{});}
}

async function translate(text, expectedRevision, automatic, readFull, postUrl, target='zh', draft=false, progress=()=>{}, cancelled=()=>false) {
  if(!Object.hasOwn(LANGUAGES,target))throw new Error('不支持的目标语言。');
  const check=()=>{if(expectedRevision!==revision||cancelled())throw new Error('翻译已取消。');};check();
  if(automatic&&!(draft?(await getConfig()).composeTranslate:(await getConfig()).autoTranslate))throw new Error('自动翻译已暂停。');
  if(typeof text!=='string'||!text.trim()||text.length>12000)throw new Error('本地翻译支持 1–12000 字符的正文。');
  if(!await chrome.permissions.contains({origins:['http://127.0.0.1:18427/*']}))throw new Error('请先在设置里保存，允许访问本机翻译服务。');
  if(readFull)text=await readFullPost(postUrl,expectedRevision,cancelled);check();
  if(text.length>12000)throw new Error('全文超过 12000 字符，请分段查看。');
  const {sourceLines,sourceBreaks}=translationParagraphs(text),started=performance.now();
  if(sourceLines.length>200)throw new Error('正文段落超过 200 段，请分块查看。');
  const paragraphs=sourceLines.map(()=>null);
  const paragraphCached=paragraphs.map(line=>line!==null),paragraphMs=sourceLines.map(()=>null),paragraphSkipped=sourceLines.map(referenceOnly);
  let source_lang='auto';
  progress({kind:'source',sourceLines,sourceBreaks,expanded:!!readFull});
  const jobs=sourceLines.map(async(line,index)=>{
    if(paragraphSkipped[index]){paragraphs[index]=line;paragraphCached[index]=false;progress({kind:'paragraph',index,text:line,referenceOnly:true,unchanged:true});return Promise.resolve();}
    const chunks=await Promise.all(translationChunks(line).map(chunk=>scheduleInference(async()=>{
      check();let response,data;
      for(;;){
      try{response=await fetch('http://127.0.0.1:18427/translate',{
        method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(120000),
        headers:{'Content-Type':'application/json'},body:JSON.stringify({text:chunk,target_lang:target,purpose:draft?'draft':'reading'})
      });}catch(cause){
        const error=new Error(cause.name==='TimeoutError'?'本机翻译超时，请稍后重试。':'本机翻译服务未连接，请先启动本地模型。');error.retryable=cause.name!=='TimeoutError';throw error;
      }
      data=await response.json();
      if(response.status===503&&data.code==='TRANSLATION_PREPARING'){
       const deadline=Date.now()+20*60*1000;
       for(;;){
        check();if(Date.now()>deadline)throw Error('翻译模型准备时间较长，请在翻译状态查看进度后重试。');
        const state=await fetch('http://127.0.0.1:18427/metrics',{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)}).then(response=>response.json());
        if(state.translation_loaded)break;if(state.translation_state==='error')throw Error(state.translation_error||'翻译模型准备失败，请重试。');
        await new Promise(resolve=>setTimeout(resolve,3000));
       }
       continue;
      }
      break;
      }
      if(!response.ok){const error=new Error(data.error||`本机翻译返回 HTTP ${response.status}`);error.retryable=response.status===503||String(data.error).includes('服务未就绪');throw error;}
      if(typeof data.text!=='string'||!data.text.trim()||data.text.length>24000)throw new Error('译文格式不正确。');
      check();return data;
    },draft)));
      paragraphs[index]=chunks.map(data=>data.text.replace(/[ \t]*[\r\n]+[ \t]*/g,' ')).join(' ');
      paragraphCached[index]=chunks.every(data=>data.cached===true);paragraphMs[index]=chunks.reduce((sum,data)=>sum+(data.elapsed_ms||0),0);
      const data=chunks.find(data=>data.source_lang&&data.source_lang!=='zh')||chunks[0];
      if(data.source_lang&&(source_lang==='auto'||source_lang==='zh'))source_lang=data.source_lang;
      progress({kind:'paragraph',index,text:paragraphs[index],source_lang,cached:paragraphCached[index],elapsed_ms:paragraphMs[index]});
  });
  const results=await Promise.allSettled(jobs);check();
  const value={target_lang:target,text:paragraphs.map((line,index)=>line===null?'':sourceBreaks[index]+line).join(''),paragraphs,source_lang,elapsed_ms:Math.round(performance.now()-started)};
  if(value.text.length>24000)throw new Error('全文译文过长，请分段查看。');
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  return {...value,sourceLines,sourceBreaks,expanded:!!readFull,cached:paragraphCached.every((cached,index)=>cached||paragraphSkipped[index]),paragraphCached,paragraphMs,paragraphSkipped};
}

async function translationContext(sender) {
  if(sender.id!==chrome.runtime.id)throw new Error('请求来源无效。');
  const ownPage=sender.url?.startsWith(chrome.runtime.getURL(''));
  const xPage=!!sender.tab&&/^https:\/\/(x\.com|twitter\.com)\//.test(sender.url||'');
  let allowedWeb=false;
  if(sender.tab&&!xPage&&/^https?:\/\//.test(sender.url||'')){
    allowedWeb=(await getConfig()).allWebsites&&await chrome.permissions.contains({origins:[new URL(sender.url).origin+'/*']});
  }
  return {ownPage,xPage,allowedWeb};
}
chrome.runtime.onConnect.addListener(port=>{
  if(port.name!=='local-translation-stream')return;
  let used=false,cancelled=false;
  port.onDisconnect.addListener(()=>{cancelled=true;});
  const post=message=>{if(!cancelled)try{port.postMessage(message);}catch{cancelled=true;}};
  port.onMessage.addListener(async message=>{
    if(used)return;used=true;
    try{
      await ready;const context=await translationContext(port.sender);
      if(!(context.xPage||context.ownPage||context.allowedWeb)||message.type!=='TRANSLATE')throw new Error('此页面没有翻译权限。');
      if(!context.ownPage&&!translationAllowed(port.sender.tab?.url||port.sender.url,await getConfig()))throw new Error('当前 URL 不在阅读翻译白名单中。');
      const currentRevision=revision;
      const data=await translate(message.text,currentRevision,message.automatic===true,(context.xPage||context.ownPage)&&message.readFull===true,message.postUrl,(await getConfig()).readingTarget,false,post,()=>cancelled);
      post({kind:'complete',data});
    }catch(error){post({kind:'error',error:error.message,retryable:error.retryable===true});}
  });
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    await ready;
    const {ownPage,xPage,allowedWeb}=await translationContext(sender);
    if (message.type === 'GET_PUBLIC_CONFIG' && (xPage||allowedWeb)) return publicConfig(await getConfig(),sender.tab?.url||sender.url);
    if(message.type==='OBSERVE_CONTENT'&&(xPage||allowedWeb)){if(!xPage&&!translationAllowed(sender.tab?.url||sender.url,await getConfig()))throw new Error('当前 URL 不在白名单中');return observeContent(message.source,sender);}
    if(message.type==='ANALYZE_POST'&&(xPage||ownPage))return analyzePost(message.text,sender,message.toChinese===true,message.purpose||'post',message.account,message.draftId,message.sourceUrl,message.sourceKind,message.originalText,message.inputComplete,message.manual===true);
    if(message.type==='AUTHOR_OBSERVE'&&xPage){
      const account=String(message.data?.account||'').toLowerCase(),path=new URL(sender.url).pathname.split('/')[1]?.toLowerCase();if(account!==path)throw Error('作者资料来源不匹配');
      return localRequest('/reference/author',message.data);
    }
    if(message.type==='REFERENCE_REPORT'&&xPage)return localRequest('/reference/report',message.data||{});
    if(message.type==='REFERENCE_LIST'&&(xPage||ownPage))return localRequest('/reference/list',{});
    if((xPage||ownPage)&&['REFERENCE_CONFIGURE','REFERENCE_STATUS','REFERENCE_TRAIN','REFERENCE_ROLLBACK'].includes(message.type))return localRequest('/reference/'+message.type.slice(10).toLowerCase(),message.data||{});
    if((xPage||ownPage)&&Object.hasOwn({LEARNING_CONFIGURE:1,LEARNING_STATUS:1,LEARNING_BIND:1,LEARNING_IMPORT:1,LEARNING_TRAIN:1,LEARNING_ROLLBACK:1,LEARNING_EXPORT:1},message.type)){
      if(!await chrome.permissions.contains({origins:['http://127.0.0.1:18427/*']}))throw new Error('请先保存设置，允许访问本机服务。');
      return localRequest('/learning/'+message.type.slice(9).toLowerCase(),message.data||{});
    }
    if(message.type==='CANCEL_POST_ANALYSIS'&&xPage){analysisRequests.get(sender.tab.id+':'+(message.purpose==='draft'?'draft':'post'))?.abort();return true;}
    if(message.type==='REWRITE_POST'&&(xPage||ownPage)){
      if(!(await getConfig()).postAnalysis)throw new Error('内容分析已关闭。');
      if(!await chrome.permissions.contains({origins:['http://127.0.0.1:18427/*']}))throw new Error('请先保存设置，允许访问本机模型。');
      if(typeof message.text!=='string'||!message.text.trim()||message.text.length>4000)throw new Error('推荐改写支持 1–4000 字符正文。');
      const atRevision=revision,value=await localRequest('/rewrite',{text:message.text,account:message.account});if(atRevision!==revision)throw new Error('设置已改变，改写取消');return value;
    }
    if (message.type === 'TRANSLATE' && (xPage || ownPage || allowedWeb)) {
      if(!ownPage&&!translationAllowed(sender.tab?.url||sender.url,await getConfig()))throw new Error('当前 URL 不在阅读翻译白名单中。');
      const currentRevision = revision;
      return translate(message.text, currentRevision, message.automatic === true, (xPage||ownPage)&&message.readFull === true, message.postUrl,(await getConfig()).readingTarget);
    }
    if(message.type==='TRANSLATE_DRAFT'&&(xPage||ownPage)) {
      const currentRevision=revision;
      const config=await getConfig();
      if(!config.composeTranslate)throw new Error('发帖翻译已关闭。');
      return translate(message.text,currentRevision,true,false,null,message.targetLang||config.composeTarget,true);
    }
    if (!ownPage) throw new Error('该操作仅限扩展设置页。');
    if(message.type==='SAVE_EARNINGS_ASSUMPTIONS'){
     const account=await accountContext(),value=message.data;
     if(!Number.isSafeInteger(value?.qualified30)||value.qualified30<0||value.qualified30>1e15||!Number.isFinite(value.rpmCny)||value.rpmCny<0||value.rpmCny>1e6)throw Error('填写有效的近30天合格曝光与每千次收益（元）。');
     const saved=(await chrome.storage.local.get('xEarningsAssumptions')).xEarningsAssumptions||{};saved[account]={qualified30:value.qualified30,rpmCny:value.rpmCny,source:'manual',observed_at:Date.now()};
     for(const key of Object.keys(saved).sort((a,b)=>saved[b].observed_at-saved[a].observed_at).slice(5))delete saved[key];
     await chrome.storage.local.set({xEarningsAssumptions:saved});return accountSummary(false);
    }
    if(message.type==='GET_ACCOUNT_SUMMARY')return accountSummary(false);
    if(message.type==='REFRESH_ACCOUNT_SUMMARY')return accountSummary(true);
    if(message.type==='GET_TRANSLATION_STATUS'){
      let service=null,error='';
      try{
        if(!await chrome.permissions.contains({origins:['http://127.0.0.1:18427/*']}))throw new Error('请在设置中保存，允许访问本机模型。');
        await migrateBrowserData();
        const response=await fetch('http://127.0.0.1:18427/metrics',{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('本机模型状态暂不可用');service=await response.json();
      }catch(cause){error=cause.message.startsWith('请')?cause.message:'本机翻译服务未连接';}
      return {browser_data_bytes:await chrome.storage.local.getBytesInUse(null),stats:service?.translation_stats||{since:null,segments:0,inference:0,cache_hits:0,total_ms:0},service,error:error||service?.data_warning||''};
    }
    if (message.type === 'GET_SETTINGS') {
      const extra = await chrome.storage.local.get(['usage', 'lastError']);
      return {config: await getConfig(), usage: extra.usage, lastError: extra.lastError || ''};
    }
    if (message.type === 'SAVE_SETTINGS') {
      const config = validateSettings(message.config);
      revision++;
      await chrome.storage.local.set({config, lastError: ''});
      await syncWebScripts();
      await activateWebTabs();
      await notifyTabs();
      return publicConfig(await getConfig());
    }
    if (message.type === 'CLEAR_CACHE') {
      revision++;
      await localRequest('/cache/clear',{});
      await chrome.storage.local.remove(['translationCache','postAnalysisCache','cache','lastError']);
      await notifyTabs();
      return true;
    }
    throw new Error('未知操作。');
  })().then(data => respond({ok: true, data}), error => respond({ok: false, error: error.message, retryable:error.retryable===true}));
  return true;
});

import {LANGUAGES} from './languages.mjs';
import './analysis-core.js';
import {DEFAULTS, validateSettings, translationAllowed, translationHosts, referenceOnly} from './core.js';

const WEB_ORIGINS=['https://*/*','http://*/*'];
chrome.action.setIcon({path:chrome.runtime.getManifest().action.default_icon}).catch(console.warn);
chrome.runtime.onInstalled.addListener(()=>chrome.storage.local.remove(['translationCache','postAnalysisCache','cache']));
const ready = chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'}).then(syncWebScripts);
let revision = 0;
const getConfig = async () => ({...DEFAULTS, ...(await chrome.storage.local.get('config')).config,enabled:false,collectMetrics:false});
const publicConfig = (config,url) => ({enabled: config.enabled, autoTranslate: config.autoTranslate&&(!url||translationAllowed(url,config)), translatePageAllowed:!url||translationAllowed(url,config), allWebsites:config.allWebsites, composeTranslate:config.composeTranslate, composeTarget:config.composeTarget, readingTarget:config.readingTarget, languages:LANGUAGES, collectMetrics:config.collectMetrics, postAnalysis:config.postAnalysis, mode: config.mode, threshold: config.threshold});
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
async function analyzePost(text,sender,toChinese=false){
 if(typeof text!=='string'||!text.trim()||text.length>24000)throw new Error('评分支持 1–24000 字符的正文。');
 if(!(await getConfig()).postAnalysis)throw new Error('推文分析已关闭。');
 if(!await chrome.permissions.contains({origins:['http://127.0.0.1:18427/*']}))throw new Error('请先保存插件设置，允许访问本机模型。');
 const tab=sender.tab?.id??'settings',control=new AbortController(),atRevision=revision;analysisRequests.get(tab)?.abort();analysisRequests.set(tab,control);
 try{const value=await localRequest('/analyze',{text,to_chinese:toChinese},AbortSignal.any([control.signal,AbortSignal.timeout(180000)]));if(atRevision!==revision)throw new Error('设置已改变，分析取消');return value;}finally{if(analysisRequests.get(tab)===control)analysisRequests.delete(tab);}
}
async function observeContent(source,sender){
 if(!source||typeof source.original!=='string')throw new Error('无效正文');const current=new URL(sender.tab.url),url=new URL(source.url||current.href);
 const x=host=>['x.com','twitter.com'].includes(host);
 if(x(current.hostname)){if(!x(url.hostname)||!/^\/[^/]+\/status\/\d+/.test(url.pathname))throw new Error('无效帖子来源');}
 else if(url.origin!==current.origin)throw new Error('网页来源不匹配');
 return localRequest('/observe',{...source,url:url.href});
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

function translationLines(text) {
  const lines=[];
  for(let line of text.split(/\n+/).map(s=>s.trim()).filter(Boolean)) {
    while(line.length>2000) {
      let end=line.lastIndexOf(' ',2000);
      if(end<1000)end=2000;
      if(/[\uD800-\uDBFF]/.test(line[end-1]))end--;
      lines.push(line.slice(0,end).trim());line=line.slice(end).trim();
    }
    if(line)lines.push(line);
  }
  return lines;
}

async function translate(text, expectedRevision, automatic, readFull, postUrl, target='zh', draft=false, progress=()=>{}, cancelled=()=>false) {
  if(!Object.hasOwn(LANGUAGES,target))throw new Error('不支持的目标语言。');
  const check=()=>{if(expectedRevision!==revision||cancelled())throw new Error('翻译已取消。');};check();
  if(automatic&&!(draft?(await getConfig()).composeTranslate:(await getConfig()).autoTranslate))throw new Error('自动翻译已暂停。');
  if(typeof text!=='string'||!text.trim()||text.length>12000)throw new Error('本地翻译支持 1–12000 字符的正文。');
  if(!await chrome.permissions.contains({origins:['http://127.0.0.1:18427/*']}))throw new Error('请先在设置里保存，允许访问本机翻译服务。');
  if(readFull)text=await readFullPost(postUrl,expectedRevision,cancelled);check();
  if(text.length>12000)throw new Error('全文超过 12000 字符，请分段查看。');
  const sourceLines=translationLines(text),started=performance.now();
  if(sourceLines.length>200)throw new Error('正文段落超过 200 段，请分块查看。');
  const paragraphs=sourceLines.map(()=>null);
  const paragraphCached=paragraphs.map(line=>line!==null),paragraphMs=sourceLines.map(()=>null),paragraphSkipped=sourceLines.map(referenceOnly);
  let source_lang='auto';
  progress({kind:'source',sourceLines,expanded:!!readFull});
  const jobs=sourceLines.map((line,index)=>{
    if(paragraphSkipped[index]){paragraphs[index]=line;paragraphCached[index]=false;progress({kind:'paragraph',index,text:line,referenceOnly:true,unchanged:true});return Promise.resolve();}
    return scheduleInference(async()=>{
      check();let response;
      try{response=await fetch('http://127.0.0.1:18427/translate',{
        method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(120000),
        headers:{'Content-Type':'application/json'},body:JSON.stringify({text:line,target_lang:target,purpose:draft?'draft':'reading'})
      });}catch(cause){
        const error=new Error(cause.name==='TimeoutError'?'本机翻译超时，请稍后重试。':'本机翻译服务未连接，请先启动本地模型。');error.retryable=cause.name!=='TimeoutError';throw error;
      }
      const data=await response.json();
      if(!response.ok){const error=new Error(data.error||`本机翻译返回 HTTP ${response.status}`);error.retryable=response.status===503||String(data.error).includes('服务未就绪');throw error;}
      if(typeof data.text!=='string'||!data.text.trim()||data.text.length>24000)throw new Error('译文格式不正确。');
      check();paragraphs[index]=data.text;
      paragraphCached[index]=data.cached===true;paragraphMs[index]=data.elapsed_ms;
      if(data.source_lang&&(source_lang==='auto'||source_lang==='zh'))source_lang=data.source_lang;
      progress({kind:'paragraph',index,text:data.text,source_lang,cached:paragraphCached[index],elapsed_ms:data.elapsed_ms});
    },draft);
  });
  const results=await Promise.allSettled(jobs);check();
  const value={target_lang:target,text:paragraphs.filter(line=>line!==null).join('\n\n'),paragraphs,source_lang,elapsed_ms:Math.round(performance.now()-started)};
  if(value.text.length>24000)throw new Error('全文译文过长，请分段查看。');
  const failure=results.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  return {...value,sourceLines,expanded:!!readFull,cached:paragraphCached.every((cached,index)=>cached||paragraphSkipped[index]),paragraphCached,paragraphMs,paragraphSkipped};
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
    if(message.type==='ANALYZE_POST'&&(xPage||ownPage))return analyzePost(message.text,sender,message.toChinese===true);
    if(message.type==='CANCEL_POST_ANALYSIS'&&xPage){analysisRequests.get(sender.tab.id)?.abort();return true;}
    if (message.type === 'TRANSLATE' && (xPage || ownPage || allowedWeb)) {
      if(!ownPage&&!translationAllowed(sender.tab?.url||sender.url,await getConfig()))throw new Error('当前 URL 不在阅读翻译白名单中。');
      const currentRevision = revision;
      return translate(message.text, currentRevision, message.automatic === true, (xPage||ownPage)&&message.readFull === true, message.postUrl,(await getConfig()).readingTarget);
    }
    if(message.type==='TRANSLATE_DRAFT'&&(xPage||ownPage)) {
      const currentRevision=revision;
      const config=await getConfig();
      if(!config.composeTranslate)throw new Error('发帖翻译已关闭。');
      return translate(message.text,currentRevision,true,false,null,config.composeTarget,true);
    }
    if (!ownPage) throw new Error('该操作仅限扩展设置页。');
    if(message.type==='GET_TRANSLATION_STATUS'){
      let service=null,error='';
      try{
        if(!await chrome.permissions.contains({origins:['http://127.0.0.1:18427/*']}))throw new Error('请在设置中保存，允许访问本机模型。');
        await migrateBrowserData();
        const response=await fetch('http://127.0.0.1:18427/metrics',{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(4000)});
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

export async function downloadTikTokVideo(call){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!Number.isInteger(tab?.id)||!videoUrl(tab.url))throw Error('请先打开一条具体的 TikTok 视频');
 return call(tab.url);
}

function videoUrl(raw){
 try{const url=new URL(raw);if(url.protocol!=='https:'||!['www.tiktok.com','tiktok.com'].includes(url.hostname)||url.port||url.username||url.password)return null;const match=url.pathname.match(/^\/@([A-Za-z0-9_.-]{1,64})\/video\/(\d{1,30})\/?$/),embed=url.pathname.match(/^\/embed\/v2\/(\d{1,30})\/?$/);return match?{url:`https://www.tiktok.com/@${match[1]}/video/${match[2]}`,id:match[2]}:embed?{url:`https://www.tiktok.com/embed/v2/${embed[1]}`,id:embed[1]}:null;}catch{return null;}
}
export function inspectTikTokVideos(requestedSource='https://www.tiktok.com/',parse=videoUrl){
 if(location.protocol!=='https:'||!['www.tiktok.com','tiktok.com'].includes(location.hostname))throw Error('TikTok 来源尚未打开或已离开本站');
 const home=['','/foryou','/explore'].includes(new URL(requestedSource).pathname.replace(/\/$/,''));
 if(home&&!['','/foryou','/explore'].includes(location.pathname.replace(/\/$/,'')))throw Error('当前页面已离开 TikTok 首页推荐流');
 const candidates=[],seen=new Set(),add=(raw,text='')=>{const video=parse(raw);if(!video||seen.has(video.id)||candidates.length>=50)return;seen.add(video.id);candidates.push({url:video.url,text:String(text).slice(0,4000)});};
 const main=document.querySelector?.('main')||document.querySelector?.('[role="main"]');
 for(const anchor of main?.querySelectorAll('a[href*="/video/"]')||[]){
  const card=anchor.closest('article,[data-e2e="recommend-list-item-container"]');if(home&&!card)continue;
  add(anchor.href,(card||anchor.parentElement)?.innerText||'');
 }
 for(const id of ['__UNIVERSAL_DATA_FOR_REHYDRATION__','SIGI_STATE']){
  const raw=document.getElementById(id)?.textContent;if(!raw||raw.length>2000000)continue;
  try{
   const data=JSON.parse(raw),scope=data.__DEFAULT_SCOPE__;let items=[];
   if(scope){
    const key=home?'webapp.foryou.video':location.pathname.startsWith('/@')?'webapp.user-post':'webapp.search.video';
    items=scope[key]?.itemList||[];
   }else if(home){items=(data.ItemList?.forYou?.list||[]).map(id=>data.ItemModule?.[id]);}
   for(const item of Array.isArray(items)?items.slice(0,50):[]){
    if(!item?.video||typeof item.id!=='string'||!/^\d{1,30}$/.test(item.id)||item.privateItem||item.secret||item.forFriend||item.isProhibited||item.takeDown||item.imagePost?.images?.length)continue;
    const author=item.author&&typeof item.author==='object'?item.author:{};
    const text=[item.desc,item.text,author.nickname,author.signature,...(Array.isArray(item.textExtra)?item.textExtra:[]).map(tag=>tag?.hashtagName),item.locationCreated==='CN'?'China':'',item.isAd||item.is_ad?'sponsored':''].filter(Boolean).join(' ');
    add(`https://www.tiktok.com/embed/v2/${item.id}`,text);
   }
  }catch{}
 }
 const text=(document.body?.innerText||'').slice(0,12000),urls=candidates.map(video=>video.url);
 return {urls,candidates,blocked:!urls.length&&/verify to continue|security verification|access denied|验证码|安全验证|访问被拒绝/i.test(text),page:{path:location.pathname,ready:document.readyState,videos:document.querySelectorAll('video').length}};
}
export async function collectTikTokVideos(job,call,account,verify){
 const sources=job.input?.source_urls;
 if(!Array.isArray(sources)||!sources.length||sources.length>20)throw Error('TikTok 来源配置无效');
 const known=new Set(job.input.known_ids||[]);let candidates=[];
 if(sources.every(source=>videoUrl(source)))candidates=sources.map(url=>({url,text:''}));
 else{
  if(sources.length!==1)throw Error('每个视频计划只支持一个列表来源');
  const source=new URL(sources[0]);
  if(source.protocol!=='https:'||!['www.tiktok.com','tiktok.com'].includes(source.hostname)||source.port||source.username||source.password||!/^\/(?:foryou\/?|explore\/?|search(?:\/video)?\/?|@[A-Za-z0-9_.-]{1,64}\/?|)$/.test(source.pathname))throw Error('TikTok 来源页面无效');
  const sourceKey=raw=>{try{const url=new URL(raw);if(url.username||url.password)return '';url.searchParams.delete('lang');url.searchParams.sort();const path=url.pathname.replace(/\/$/,'');return url.origin+(path==='/foryou'?'':path)+url.search;}catch{return '';}};
  await verify();const existing=(await chrome.debugger.getTargets()).find(target=>target.type==='page'&&!target.attached&&Number.isInteger(target.tabId)&&sourceKey(target.url)===sourceKey(source.href));
  for(const reused of existing?[existing,null]:[null]){
  const tab=reused?{id:reused.tabId}:await chrome.tabs.create({url:source.href,active:false});let attached=false,read=false,lastPage,lastError='';
  try{
   await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;
   for(let attempt=0;attempt<(reused?1:60);attempt++){
    const response=await chrome.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression:`(${inspectTikTokVideos.toString()})(${JSON.stringify(source.href)},${videoUrl.toString()})`,returnByValue:true});
    lastPage=response.result?.value?.page||lastPage;
    if(response.exceptionDetails)lastError=(response.exceptionDetails.exception?.description||response.exceptionDetails.text||'页面脚本读取失败').slice(0,250);
    if(response.result?.value?.blocked)throw Error('TikTok 要求安全验证或拒绝访问，请先在浏览器检查来源页面');
    const value=response.result?.value;const videos=Array.isArray(value?.candidates)?value.candidates:(value?.urls||[]).map(url=>({url,text:''}));
    if(videos.length){read=true;candidates.push(...videos);if(candidates.some(candidate=>{const video=videoUrl(candidate.url);return video&&!known.has(video.id);}))break;}
    if(!reused&&(attempt===10||attempt===20))await chrome.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression:'window.scrollBy(0,innerHeight)',returnByValue:true});
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!read&&!reused)throw Error(lastPage?`TikTok 来源未返回可核实的视频ID（页面 ${lastPage.path}；加载状态 ${lastPage.ready}；播放器 ${lastPage.videos} 个），本轮未调用模型`:`TikTok 页面读取未完成：${lastError||'页面尚未准备好'}，本轮未调用模型`);
  }finally{if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});if(!reused)await chrome.tabs.remove(tab.id).catch(()=>{});}
  if(candidates.some(candidate=>{const video=videoUrl(candidate.url);return video&&!known.has(video.id);}))break;
  }
 }
 let unavailable=0,processed=0;
 for(const candidate of candidates){
  const video=videoUrl(candidate?.url);if(!video||known.has(video.id))continue;if(processed++>=30||unavailable>=3)break;
  known.add(video.id);await verify();const result=await call('download_tiktok_video',{account,url:video.url,capture_job:job.id,client:job.client,...(candidate.text?{source_text:String(candidate.text).slice(0,4000)}:{})},90000);
  if(result?.skipped){if(result.unavailable)unavailable++;continue;}return;
 }
}

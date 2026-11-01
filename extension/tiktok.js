export async function downloadTikTokVideo(call){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!Number.isInteger(tab?.id)||!/^https:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.-]+\/video\/\d{1,30}(?:[/?#]|$)/.test(tab.url||''))throw Error('请先打开一条具体的 TikTok 视频');
 return call(tab.url);
}

function videoUrl(raw){
 try{const url=new URL(raw);if(url.protocol!=='https:'||!['www.tiktok.com','tiktok.com'].includes(url.hostname)||url.port||url.username||url.password)return null;const match=url.pathname.match(/^\/@([A-Za-z0-9_.-]{1,64})\/video\/(\d{1,30})\/?$/);return match?{url:`https://www.tiktok.com/@${match[1]}/video/${match[2]}`,id:match[2]}:null;}catch{return null;}
}
export function inspectTikTokVideos(){
 if(location.protocol!=='https:'||!['www.tiktok.com','tiktok.com'].includes(location.hostname))throw Error('TikTok 来源尚未打开或已离开本站');
 const urls=[...document.querySelectorAll('a[href*="/video/"]')].map(a=>a.href).slice(0,300);
 const text=(document.body?.innerText||'').slice(0,12000);
 return {urls,blocked:!urls.length&&/verify to continue|security verification|access denied|验证码|安全验证|访问被拒绝/i.test(text)};
}
export async function collectTikTokVideos(job,call,account,verify){
 const sources=job.input?.source_urls;
 if(!Array.isArray(sources)||!sources.length||sources.length>20)throw Error('TikTok 来源配置无效');
 const known=new Set(job.input.known_ids||[]);let candidates=[];
 if(sources.every(source=>videoUrl(source)))candidates=sources;
 else{
  if(sources.length!==1)throw Error('每个视频计划只支持一个列表来源');
  const source=new URL(sources[0]);
  if(source.protocol!=='https:'||!['www.tiktok.com','tiktok.com'].includes(source.hostname)||source.port||source.username||source.password||!/^\/(?:foryou\/?|explore\/?|search(?:\/video)?\/?|@[A-Za-z0-9_.-]{1,64}\/?|)$/.test(source.pathname))throw Error('TikTok 来源页面无效');
  await verify();const tab=await chrome.tabs.create({url:source.href,active:false});let attached=false,read=false;
  try{
   await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;
   for(let attempt=0;attempt<30;attempt++){
    const response=await chrome.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression:`(${inspectTikTokVideos.toString()})()`,returnByValue:true});
    if(response.result?.value?.blocked)throw Error('TikTok 要求安全验证或拒绝访问，请先在浏览器检查来源页面');
    const urls=response.result?.value?.urls;
    if(Array.isArray(urls)&&urls.length){read=true;candidates.push(...urls);if(candidates.some(raw=>{const video=videoUrl(raw);return video&&!known.has(video.id);}))break;}
    if(attempt===10||attempt===20)await chrome.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression:'window.scrollBy(0,innerHeight)',returnByValue:true});
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!read)throw Error('TikTok 页面未读取到视频，请检查登录、地区限制或更换来源页面');
  }finally{if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});await chrome.tabs.remove(tab.id).catch(()=>{});}
 }
 for(const raw of candidates){
  const video=videoUrl(raw);if(!video||known.has(video.id))continue;
  await verify();await call('download_tiktok_video',{account,url:video.url,capture_job:job.id,client:job.client},90000);return;
 }
}

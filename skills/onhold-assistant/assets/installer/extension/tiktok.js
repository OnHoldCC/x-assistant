export function inspectTikTokVideo(){
 if(location.protocol!=='https:'||!['www.tiktok.com','tiktok.com'].includes(location.hostname))throw Error('请先打开 TikTok 视频页');
 const id=location.pathname.match(/^\/@[A-Za-z0-9_.-]+\/video\/(\d{1,30})\/?$/)?.[1];
 if(!id)throw Error('请打开一条具体的 TikTok 视频，再点击下载');
 const raw=document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__')?.textContent;
 if(!raw||raw.length>10000000)throw Error('视频资料尚未加载，请等待页面显示视频后重试');
 const scope=JSON.parse(raw).__DEFAULT_SCOPE__||{},item=scope['webapp.video-detail']?.itemInfo?.itemStruct||scope['webapp.foryou.video']?.itemList?.find(item=>item.id===id);
 if(item?.id!==id||item.privateItem||item.isAd||item.isProhibited||item.takeDown)throw Error('此视频不可下载，或页面资料与视频不匹配');
 const url=new URL(item.video?.playAddr||'https://invalid.local');
 if(url.protocol!=='https:'||url.username||url.password||url.port||!['tiktokcdn.com','tiktokcdn-us.com','tiktokv.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))throw Error('未获取到可信的播放地址，不回退到带平台水印的下载版');
 const author=item.author?.uniqueId;
 if(typeof author!=='string'||!/^[A-Za-z0-9_.-]{1,64}$/.test(author))throw Error('视频作者资料无效');
 return {id,author,title:String(item.desc||'').slice(0,4000),duration:item.video?.duration,url:url.href,source:'https://www.tiktok.com/@'+author+'/video/'+id};
}

export async function downloadTikTokVideo(){
 if(!await chrome.permissions.contains({permissions:['downloads']}))throw Error('请先允许插件下载文件');
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!Number.isInteger(tab?.id)||!/^https:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.-]+\/video\/\d{1,30}(?:[/?#]|$)/.test(tab.url||''))throw Error('请先打开一条具体的 TikTok 视频');
 let attached=false,video;
 try{
  await chrome.debugger.attach({tabId:tab.id},'1.3');attached=true;
  const inspected=await chrome.debugger.sendCommand({tabId:tab.id},'Runtime.evaluate',{expression:'('+inspectTikTokVideo.toString()+')()',returnByValue:true});
  if(inspected.exceptionDetails)throw Error(inspected.exceptionDetails.exception?.description||'TikTok 视频资料读取失败');
  video=inspected.result?.value;
  if(!video?.id||!video.url)throw Error('TikTok 视频资料为空');
 }finally{if(attached)await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});}
 const downloadId=await chrome.downloads.download({url:video.url,filename:'OnHold/TikTok/'+video.id+'.mp4',saveAs:false,conflictAction:'uniquify'});
 for(let attempt=0;attempt<60;attempt++){
  const [file]=await chrome.downloads.search({id:downloadId});
  if(file?.state==='interrupted')throw Error('TikTok 下载中断：'+(file.error||'请重试'));
  if(file?.state==='complete'){
   if(!file.fileSize||file.mime&&!['video/mp4','application/octet-stream'].includes(file.mime))throw Error('下载结果不是有效视频，请检查下载文件');
   return {id:video.id,author:video.author,title:video.title,source:video.source,filename:file.filename,bytes:file.fileSize};
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw Error('下载仍在进行，请到浏览器下载列表检查；不会重复启动下载');
}

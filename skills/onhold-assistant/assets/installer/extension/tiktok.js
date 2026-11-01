export async function downloadTikTokVideo(call){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!Number.isInteger(tab?.id)||!/^https:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.-]+\/video\/\d{1,30}(?:[/?#]|$)/.test(tab.url||''))throw Error('请先打开一条具体的 TikTok 视频');
 return call(tab.url);
}

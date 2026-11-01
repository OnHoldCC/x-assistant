export async function createTaskTab(options){
 for(let attempt=0;;attempt++){
  try{return await chrome.tabs.create(options);}
  catch(error){
   if(!String(error?.message||error).includes('Tabs cannot be edited right now'))throw error;
   if(attempt>=8)throw Error('Chrome 标签页暂时被锁定，等待后仍无法打开任务页面；请结束拖动后重试。',{cause:error});
   await new Promise(resolve=>setTimeout(resolve,Math.min(250*(attempt+1),1000)));
  }
 }
}

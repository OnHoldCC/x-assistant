const reconnect=document.getElementById('reconnect-page');
reconnect.addEventListener('click',async()=>{
 const status=document.getElementById('model-error');reconnect.disabled=true;status.textContent='正在重新连接当前页…';
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw Error('请在需要翻译的网页中打开助手。');
  const [check]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>
   [...document.querySelectorAll('[contenteditable="true"]')].some(node=>node.innerText.trim())||
   [...document.querySelectorAll('input,textarea')].some(node=>node.type==='checkbox'||node.type==='radio'?node.checked!==node.defaultChecked:!['hidden','submit','button','reset'].includes(node.type)&&node.value!==node.defaultValue)
  });
  if(typeof check?.result!=='boolean')throw Error('未能确认当前页草稿状态，请手动刷新页面。');
  if(check.result)throw Error('当前页有未保存的输入，请先保存后再恢复连接。');
  await chrome.tabs.reload(tab.id);status.textContent='已重新连接当前页。';window.close();
 }catch(error){status.textContent=error.message;}
 finally{reconnect.disabled=false;}
});

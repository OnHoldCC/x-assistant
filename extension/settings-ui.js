(() => {
 const $=id=>document.getElementById(id);let current='overview',busy=false;
 const number=(value,suffix='')=>Number.isFinite(value)?new Intl.NumberFormat('zh-CN',{maximumFractionDigits:1}).format(value)+suffix:'—';
 async function refresh(){if(busy)return;busy=true;try{
  const response=await chrome.runtime.sendMessage({type:'GET_TRANSLATION_STATUS'});if(!response?.ok)throw new Error(response?.error||'读取失败');
  const {stats,service,error,browser_data_bytes}=response.data;$('translation-count').textContent=number(stats.segments);$('translation-average').textContent=stats.inference?number(stats.total_ms/stats.inference):'—';$('translation-count-note').textContent=`模型推理 ${stats.inference} · 缓存命中 ${stats.cache_hits}`;
  $('model-state').textContent=service?.translation_loaded?'模型就绪':'未连接';$('model-name').textContent=service?.translation_model?service.translation_model+(service.translation_device?' · '+service.translation_device:''):'Hy-MT2 · 正文与发帖翻译';$('model-error').textContent=error||'';
  $('decision-state').textContent=service?.decision_loaded?'模型就绪':'未连接';$('decision-name').textContent=service?.decision_model?service.decision_model+(service.decision_device?' · '+service.decision_device:''):'Laya 多语版';
  $('translation-cpu').textContent=number(service?.translation_cpu_percent,'%');$('translation-gpu').textContent=number(service?.translation_gpu_percent,'%');$('translation-memory').textContent=number(service?.translation_process_rss_mb??service?.translation_backend_rss_mb,' MB');
  const size=bytes=>{const unit=bytes>=1024**3?'GiB':bytes>=1024**2?'MiB':bytes>=1024?'KiB':'B';return number(bytes/({GiB:1024**3,MiB:1024**2,KiB:1024,B:1}[unit]),' '+unit);};
  const stored=service?.translation_data_bytes;$('translation-data').textContent=Number.isFinite(stored)&&Number.isFinite(browser_data_bytes)?size(stored+browser_data_bytes):'—';$('translation-data').title=Number.isFinite(stored)?`浏览器设置 ${size(browser_data_bytes||0)} + SQLite 数据 ${size(stored)}`:'本机数据索引未连接';
  if(service&&service.translation_gpu_percent==null)$('translation-gpu').textContent='不可读取';
 }catch(error){$('model-state').textContent='未连接';$('decision-state').textContent='未连接';$('model-error').textContent=error.message;}finally{busy=false;}}
 for(const button of document.querySelectorAll('[data-pane]'))button.addEventListener('click',()=>{current=button.dataset.pane;for(const node of document.querySelectorAll('[data-pane]')){node.classList.toggle('selected',node===button);node.setAttribute('aria-pressed',String(node===button));}for(const pane of document.querySelectorAll('.pane'))pane.hidden=pane.id!==`pane-${current}`;if(current==='overview')refresh();});
 $('refresh-status').addEventListener('click',refresh);setInterval(()=>{if(current==='overview'&&!document.hidden)refresh();},5000);refresh();
})();

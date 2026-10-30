import {LANGUAGES} from './languages.mjs';
import {DEFAULTS,validateSettings} from './core.js';
const $=id=>document.getElementById(id),fields=['autoTranslate','allWebsites','composeTranslate','composeTarget','readingTarget','hideAds','translationAllowlist'];let saved={};
for(const id of ['readingTarget','composeTarget'])$(id).replaceChildren(...Object.entries(LANGUAGES).map(([value,name])=>{const option=document.createElement('option');option.value=value;option.textContent=name;return option;}));
const send=async message=>{const response=await chrome.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error||'扩展连接失败');return response.data;};
async function load(){
 const response=await send({type:'GET_SETTINGS'});
 const config={...DEFAULTS,...response.config,autoTranslate:false,composeTranslate:false,allWebsites:false};saved=config;
 for(const key of fields){if(typeof config[key]==='boolean')$(key).checked=config[key];else $(key).value=key==='translationAllowlist'?config[key].join('\n'):config[key];}
 document.dispatchEvent(new Event('x-select-sync'));
}
$('settings').addEventListener('submit',async event=>{
 event.preventDefault();$('save').disabled=true;
 try{
  const config=validateSettings({...saved,enabled:false,collectMetrics:false,hideAds:$('hideAds').checked});
  await send({type:'SAVE_SETTINGS',config});saved=config;$('status').textContent='已保存';$('status').classList.remove('error');
 }catch(error){$('status').textContent=error.message;$('status').classList.add('error');}finally{$('save').disabled=false;}
});
load().catch(error=>{$('status').textContent=error.message;});

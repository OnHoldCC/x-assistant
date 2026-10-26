import {LANGUAGES} from './languages.mjs';
import {DEFAULTS,validateSettings,translationHosts,translationSiteRule} from './core.js';
const $=id=>document.getElementById(id),fields=['autoTranslate','allWebsites','composeTranslate','composeTarget','readingTarget','postAnalysis','translationAllowlist'];let saved={};
for(const id of ['readingTarget','composeTarget'])$(id).replaceChildren(...Object.entries(LANGUAGES).map(([value,name])=>{const option=document.createElement('option');option.value=value;option.textContent=name;return option;}));
const send=async message=>{const response=await chrome.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error||'扩展连接失败');return response.data;};
let currentSite='';
function showCurrentSite(){
 const added=currentSite&&saved.translationAllowlist?.includes(currentSite)&&saved.autoTranslate&&(saved.allWebsites||['x.com','twitter.com'].includes(new URL(currentSite).hostname));
 $('add-current-site').disabled=!currentSite||added;
 $('add-current-site').textContent=added?'当前网站已开启自动翻译':'将当前网站加入自动翻译';
 if(currentSite){$('current-site-status').textContent=new URL(currentSite).host+' · 全部路径';$('current-site-status').classList.remove('error');}
}
async function persist(config){
 const origins=new Set(['http://127.0.0.1:18427/*']);if(config.allWebsites)for(const origin of translationHosts(config))origins.add(origin);
 const permission=chrome.permissions.request({origins:[...origins]});
 if(!await permission)throw new Error('未授予权限，设置尚未保存。');
 await send({type:'SAVE_SETTINGS',config});saved=config;
}
async function load(){
 const [response,tabs]=await Promise.all([send({type:'GET_SETTINGS'}),chrome.tabs.query({active:true,currentWindow:true})]);
 const config={...DEFAULTS,...response.config};saved=config;
 for(const key of fields){if(typeof config[key]==='boolean')$(key).checked=config[key];else $(key).value=key==='translationAllowlist'?config[key].join('\n'):config[key];}
 try{currentSite=translationSiteRule(tabs[0]?.url);}catch(error){$('current-site-status').textContent=error.message;}
 showCurrentSite();document.dispatchEvent(new Event('x-select-sync'));
}
$('add-current-site').addEventListener('click',async()=>{
 if(!currentSite)return;
 try{
 const config=validateSettings({...saved,autoTranslate:true,allWebsites:true,translationAllowlist:[...new Set([...saved.translationAllowlist,currentSite])]});
 const saving=persist(config);$('save').disabled=true;$('add-current-site').disabled=true;$('add-current-site').setAttribute('aria-busy','true');$('current-site-status').textContent='正在开启…';
 await saving;
 $('translationAllowlist').value=config.translationAllowlist.join('\n');$('autoTranslate').checked=true;$('allWebsites').checked=true;showCurrentSite();
 }catch(error){showCurrentSite();$('current-site-status').textContent=error.message;$('current-site-status').classList.add('error');}
 finally{$('save').disabled=false;$('add-current-site').removeAttribute('aria-busy');}
});
$('settings').addEventListener('submit',async event=>{
 event.preventDefault();try{
 const config=validateSettings({...saved,enabled:false,collectMetrics:false,...Object.fromEntries(fields.map(key=>[key,key==='composeTarget'||key==='readingTarget'||key==='translationAllowlist'?$(key).value:$(key).checked]))});
 const saving=persist(config);$('save').disabled=true;$('add-current-site').disabled=true;await saving;showCurrentSite();$('status').textContent='已保存';$('status').classList.remove('error');
 }catch(error){$('status').textContent=error.message;$('status').classList.add('error');}finally{$('save').disabled=false;showCurrentSite();}
});
load().catch(error=>{$('status').textContent=error.message;});

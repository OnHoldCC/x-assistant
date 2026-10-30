import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createGateway} from '../lib/gateway.mjs';
const lock=JSON.parse(fs.readFileSync(new URL('../lib/runtime-lock.json',import.meta.url)));
const backendKey=fs.readFileSync('/secrets/backend-key','utf8').trim();
const config={port:18427,backendPort:18428,backendUrl:'http://translation:18428',container:true,backendKey,concurrency:1,
  database:'/data/gateway/data.sqlite3',modelHash:lock.model.sha256,device:'CPU',cores:2,
  extensionIds:['efnelpfiicmcfahpkoidcegnebndoiad','hffgfbgnlpclaibfceoihghioflhecmj'],codeVersion:'0.9.5',instance:'docker',
  translationState:'not_loaded',controlToken:createHash('sha256').update(backendKey+':control').digest('hex')};
fs.mkdirSync('/data/gateway',{recursive:true,mode:0o700});
async function refresh() {
  try {
    const response=await fetch(config.backendUrl+'/v1/models',{headers:{Authorization:`Bearer ${backendKey}`},signal:AbortSignal.timeout(2000)});
    const value=await response.json();config.translationState=response.ok&&value.data?.some(row=>row.id==='hy-mt2-1.8b-q8')?'ready':'loading';
  }catch{config.translationState='not_loaded';}

}
await refresh();
const gateway=createGateway(config);
gateway.server.on('error',error=>{console.error(error.message);process.exit(1);});
gateway.server.listen(18427,'0.0.0.0',()=>console.log('[网关就绪] 模型未启用时可继续使用后台；按需安装翻译模型'));
setInterval(refresh,5000).unref();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{gateway.close();setTimeout(()=>process.exit(0),1000).unref();});

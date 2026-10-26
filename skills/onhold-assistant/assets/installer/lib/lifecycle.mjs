import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import net from 'node:net';
const owned=['app','extension','runtime','models','tools','python','uv-cache','decisions','downloads','backend-key','service.log','config.json','install.json'];
export function writeJson(file,value){const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(temp,file);}
export function readOwned(home){
 home=path.resolve(home);if(home===path.parse(home).root||home===os.homedir())throw Error('拒绝将系统或用户根目录作为安装目录');
 const file=path.join(home,'config.json');if(!fs.existsSync(file))throw Error('尚未安装');const config=JSON.parse(fs.readFileSync(file));
 if(!/^[a-f0-9]{32}$/.test(config.instance||'')||!config.controlToken||path.resolve(config.extensionPath||'')!==path.join(home,'extension')||!path.resolve(config.database||'').startsWith(path.join(home,'data')+path.sep)||!fs.existsSync(path.join(home,'app/lib/gateway.mjs')))throw Error('目录不属于本安装器，未修改文件');
 const marker=path.join(home,'install.json');if(fs.existsSync(marker)){const value=JSON.parse(fs.readFileSync(marker));if(value.service!=='onhold-assistant'||value.instance!==config.instance)throw Error('安装标识不匹配');}
 return config;
}
export function markOwned(home,config,version){writeJson(path.join(home,'install.json'),{service:'onhold-assistant',instance:config.instance,version});}
export async function serviceStatus(config){try{return await fetch(`http://127.0.0.1:${config.port}/health`,{signal:AbortSignal.timeout(1000)}).then(r=>r.json());}catch{return null;}}
const portBusy=port=>new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.setTimeout(700);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('timeout',()=>{socket.destroy();resolve(true);});socket.once('error',error=>resolve(error.code!=='ECONNREFUSED'));});
export async function stopOwned(config){
 const status=await serviceStatus(config);if(status&&status.instance!==config.instance)throw Error('端口属于其他服务，未停止它');
 if(status){const result=await fetch(`http://127.0.0.1:${config.port}/control/stop`,{method:'POST',headers:{Authorization:`Bearer ${config.controlToken}`},signal:AbortSignal.timeout(3000)});if(!result.ok)throw Error('停止请求被拒绝');}
 const ports=[config.port,config.backendPort,config.decisionPort].filter(port=>Number.isInteger(port)&&port>0);
 for(let n=0;n<80;n++){if(!(await Promise.all(ports.map(portBusy))).some(Boolean))return;await new Promise(resolve=>setTimeout(resolve,125));}
 throw Error('服务尚未退出或端口未释放，文件保持不变');
}
export function backupDatabase(database,destination){
 if(!fs.existsSync(database))return;fs.mkdirSync(path.dirname(destination),{recursive:true});const db=new DatabaseSync(database);
 try{db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.prepare('VACUUM INTO ?').run(destination);if(process.platform!=='win32')fs.chmodSync(destination,0o600);}finally{db.close();}
}
function stageExtension(source,target,port){fs.cpSync(source,target,{recursive:true});if(port!==18427)for(const name of ['background.js','settings.js','manifest.json']){const file=path.join(target,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('18427',String(port)));}}
export async function upgradeInstall({home,packageRoot,version,start,patch={}}){
 const before=readOwned(home),backup=path.join(home,'backups',Date.now()+'-'+randomUUID().slice(0,8)),stage=path.join(home,'.stage-'+randomUUID());
 const next={...before,...patch,codeVersion:version};let stopped=false,appMoved=false,extensionMoved=false;
 try{
  fs.mkdirSync(stage);for(const item of ['lib','extension'])fs.cpSync(path.join(packageRoot,item),path.join(stage,'app',item),{recursive:true});stageExtension(path.join(packageRoot,'extension'),path.join(stage,'extension'),before.port);
  await stopOwned(before);stopped=true;fs.mkdirSync(backup,{recursive:true});backupDatabase(before.database,path.join(backup,'data.sqlite3'));writeJson(path.join(backup,'config.json'),before);
  fs.renameSync(path.join(home,'app'),path.join(backup,'app'));appMoved=true;fs.renameSync(path.join(home,'extension'),path.join(backup,'extension'));extensionMoved=true;
  fs.renameSync(path.join(stage,'app'),path.join(home,'app'));fs.renameSync(path.join(stage,'extension'),path.join(home,'extension'));writeJson(path.join(home,'config.json'),next);markOwned(home,next,version);await start(next);return {config:next,backup};
 }catch(error){
  if(!stopped)throw error;await stopOwned(next).catch(()=>{});
  if(appMoved){fs.rmSync(path.join(home,'app'),{recursive:true,force:true});fs.renameSync(path.join(backup,'app'),path.join(home,'app'));}
  if(extensionMoved){fs.rmSync(path.join(home,'extension'),{recursive:true,force:true});fs.renameSync(path.join(backup,'extension'),path.join(home,'extension'));}
  writeJson(path.join(home,'config.json'),before);markOwned(home,before,before.codeVersion||'legacy');let restored=false;try{await start(before);restored=true;}catch{}
  throw Error(`更新失败：${error.message}；旧代码和配置已还原，旧服务${restored?'已恢复':'需检查日志后启动'}。数据库备份：${backup}`);
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
export async function uninstallInstall(home,{purgeData=false}={}){
 const config=readOwned(home);await stopOwned(config);for(const name of owned)fs.rmSync(path.join(home,name),{recursive:true,force:true,maxRetries:20,retryDelay:100});if(purgeData)for(const name of ['data','backups'])fs.rmSync(path.join(home,name),{recursive:true,force:true,maxRetries:20,retryDelay:100});return {dataRetained:!purgeData,home};
}

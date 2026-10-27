#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createReadStream} from 'node:fs';
import {openData} from '../lib/data.mjs';
import {probeAccelerator,usesGpu} from '../lib/acceleration.mjs';
import {validateOffline} from '../lib/offline.mjs';
import {materializeDecisionModel} from '../lib/models.mjs';
import {writeJson,readOwned,markOwned,upgradeInstall,uninstallInstall,stopOwned} from '../lib/lifecycle.mjs';
const packageRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'))).version;
const lock=JSON.parse(fs.readFileSync(path.join(packageRoot,'lib/runtime-lock.json')));
export function platformPlan(platform=process.platform,arch=process.arch){const runtime=lock.platforms[`${platform}-${arch}`];if(!runtime)throw new Error(`暂不支持 ${platform}/${arch}；支持 Mac 和 Windows 的 x64/arm64`);return {runtime,device:platform==='darwin'?'Metal':'auto',platform,arch};}
const option=name=>{const index=process.argv.indexOf('--'+name);return index>=0?process.argv[index+1]:undefined;};
const home=path.resolve(option('home')||(process.platform==='win32'?path.join(process.env.LOCALAPPDATA||os.homedir(),'OnHoldAssistant'):path.join(os.homedir(),'Library/Application Support/OnHoldAssistant')));
const configPath=path.join(home,'config.json');
const offlineDirectory=option('offline-dir')?path.resolve(option('offline-dir')):null;let offlineMetadata;
const progress=message=>console.log('[进度] '+message);
const runLive=(command,args)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(command+' 退出码 '+code)));});
async function sha(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function verify(file,asset){return fs.existsSync(file)&&fs.statSync(file).size===asset.size&&await sha(file)===asset.sha256;}
export async function download(asset,directory){
 fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,asset.name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});if(await verify(file,asset)){progress('复用已校验文件 '+asset.name);return file;}
 if(fs.existsSync(file))throw new Error(`文件校验不符，保留原文件：${file}`);
 if(offlineDirectory){const source=path.join(offlineDirectory,asset.name);if(!await verify(source,asset))throw Error('离线包缺少或损坏：'+asset.name);progress('从离线包安装 '+asset.name);fs.copyFileSync(source,file);return file;}
 const partial=file+'.part';if(await verify(partial,asset)){fs.renameSync(partial,file);return file;}console.log(`下载 ${asset.name}（${Math.round(asset.size/1024**2)} MB）`);
 for(let attempt=0;attempt<3;attempt++){try{await runLive('curl',['--fail','--location','--http1.1','--retry','2','--continue-at','-','--connect-timeout','30','--speed-limit','1024','--speed-time','120','--output',partial,asset.url]);break;}catch(error){if(attempt===2)throw error;progress('下载连接中断，断点重试 '+asset.name+'（'+(attempt+1)+'/2）');}}
 progress('校验下载文件 '+asset.name);if(!await verify(partial,asset))throw new Error(`下载校验失败，未执行：${partial}`);fs.renameSync(partial,file);return file;
}
function findBinary(directory,pattern=/^llama-server(?:\.exe)?$/){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isFile()&&pattern.test(entry.name))return file;if(entry.isDirectory()){const found=findBinary(file,pattern);if(found)return found;}}}
const psQuote=value=>"'"+value.replaceAll("'","''")+"'";
async function prepareRuntime(plan){
 async function extract(asset){
  const archive=await download(asset,path.join(home,'downloads')),destination=path.join(home,'runtime',asset.name.replace(/\.(?:zip|tar\.gz)$/,''));fs.mkdirSync(destination,{recursive:true,mode:0o700});
  if(plan.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Expand-Archive -LiteralPath ${psQuote(archive)} -DestinationPath ${psQuote(destination)} -Force`],{stdio:'inherit',windowsHide:true});
  else execFileSync('tar',['-xf',archive,'-C',destination],{stdio:'inherit'});
  const binary=findBinary(destination);if(!binary)throw Error('运行时中没有 llama-server');return binary;
 }
 if(option('runtime')){const binary=findBinary(path.resolve(option('runtime')));if(!binary)throw Error('指定目录中找不到 llama-server');return {binary,...(plan.platform==='darwin'?{device:'Metal'}:probeAccelerator(binary)||{device:'CPU'})};}
 progress('准备模型运行时并检测 GPU');
 const gpu=lock.gpu_platforms?.[`${plan.platform}-${plan.arch}`];
 if(gpu)try{const binary=await extract(gpu),device=probeAccelerator(binary);if(device){progress('翻译模型使用 '+device.device+' · '+device.acceleratorName);return {binary,...device};}progress('未检测到可用 GPU 后端，回退 CPU');}catch(error){progress('GPU 运行时不可用，回退 CPU：'+error.message);}
 return {binary:await extract(plan.runtime),device:plan.platform==='darwin'?'Metal':'CPU'};
}

export async function verifyDecisionManifest(directory,manifest){
 if(!Array.isArray(manifest.files)||manifest.files.length>32||new Set(manifest.files.map(file=>file.name)).size!==manifest.files.length)throw Error('模型清单无效');
 for(const required of lock.decision_model.files.map(file=>file.name))if(!manifest.files.some(file=>file.name===required))throw Error('模型清单缺少 '+required);
 for(const asset of manifest.files){if(typeof asset.name!=='string')throw Error('模型清单无效');const file=path.resolve(directory,asset.name);if(!file.startsWith(directory+path.sep)||!/^[a-f0-9]{64}$/.test(asset.sha256||'')||!Number.isSafeInteger(asset.size)||asset.size<0||!await verify(file,asset))throw Error('模型文件校验失败：'+asset.name);}
 return {decisionModel:directory,decisionHash:[...manifest.files].sort((a,b)=>a.name.localeCompare(b.name)).map(file=>file.sha256).join(':'),decisionName:String(manifest.name||path.basename(directory)).slice(0,120)};
}
async function prepareDecisions(plan){
 progress('准备 Laya 模型与独立 Python 环境');
 let python=option('decision-python');const modelDirectory=option('decision-model')?path.resolve(option('decision-model')):path.join(home,'models/laya-multilingual');
 if(!option('decision-model'))for(const asset of lock.decision_model.files)await download(asset,modelDirectory);
 const manifest=option('decision-manifest')?JSON.parse(fs.readFileSync(path.resolve(option('decision-manifest')))):{name:'convaiinnovations/laya-multilingual',files:lock.decision_model.files};
 const decisionConfig=materializeDecisionModel(home,await verifyDecisionManifest(modelDirectory,manifest),manifest.files);
 if(!python){
  const archive=await download(lock.decision_runtime[`${plan.platform}-${plan.arch}`],path.join(home,'downloads')),tools=path.join(home,'tools/uv');fs.mkdirSync(tools,{recursive:true});
  if(plan.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Expand-Archive -LiteralPath ${psQuote(archive)} -DestinationPath ${psQuote(tools)} -Force`],{stdio:'inherit',windowsHide:true});else execFileSync('tar',['-xf',archive,'-C',tools],{stdio:'inherit'});
  const uv=findBinary(tools,/^uv(?:\.exe)?$/);if(!uv)throw new Error('Python 引导器解压不完整');
  const env={...process.env,UV_PYTHON_INSTALL_DIR:path.join(home,'python'),UV_PYTHON_BIN_DIR:path.join(home,'python/bin'),UV_CACHE_DIR:path.join(home,'uv-cache')},version=plan.platform==='win32'&&plan.arch==='arm64'?'3.13':'3.12';
  let pythonSource=version;
  if(offlineDirectory){
   const base=path.join(home,'python/offline-base');if(!fs.existsSync(base))fs.cpSync(path.join(offlineMetadata.root,'python'),base,{recursive:true,verbatimSymlinks:true});
   pythonSource=path.join(base,...offlineMetadata.python_entry.slice('python/'.length).split('/'));progress('使用离线 Python 运行时');
  }else{progress('安装独立 Python '+version);execFileSync(uv,['python','install',version],{env,stdio:'inherit',windowsHide:true});}
  const venv=path.join(home,'decisions');execFileSync(uv,['venv',venv,'--allow-existing','--python',pythonSource,...(offlineDirectory?['--offline']:[])],{env,stdio:'inherit',windowsHide:true});
  python=path.join(venv,plan.platform==='win32'?'Scripts/python.exe':'bin/python');
  progress(offlineDirectory?'从离线 wheelhouse 安装 PyTorch / Laya':'安装 PyTorch / Laya，自动选择可用加速后端');
  const pip=['pip','install','--python',python,...(offlineDirectory?['--offline','--no-index','--find-links',path.join(offlineDirectory,'wheels')]:['--torch-backend',plan.platform==='win32'?'auto':'cpu']),'laya[serve]==0.4.15','jieba==0.42.1'];
  try{execFileSync(uv,pip,{env,stdio:'inherit',windowsHide:true});}catch(error){if(offlineDirectory||plan.platform!=='win32')throw error;progress('评分 GPU 依赖不可用，使用 CPU 依赖');pip[pip.indexOf('--torch-backend')+1]='cpu';execFileSync(uv,pip,{env,stdio:'inherit',windowsHide:true});}

 }
 python=path.resolve(python);if(!fs.existsSync(python))throw new Error('找不到决策模型 Python 运行环境');
 return {decisionPython:python,...decisionConfig};
}
const readConfig=()=>JSON.parse(fs.readFileSync(configPath,'utf8'));
async function status(config){try{return await fetch(`http://127.0.0.1:${config.port}/health`,{signal:AbortSignal.timeout(1500)}).then(response=>response.json());}catch{return null;}}
async function free(port){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(new Error(`端口 ${port} 已被占用；不会停止现有服务`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
async function start(config){
 const current=await status(config);if(current?.instance===config.instance)return current;if(current)throw new Error('端口属于其他服务，不会覆盖或停止它');await free(config.port);await free(config.backendPort);if(config.decisionPython)await free(config.decisionPort);
 const fd=fs.openSync(config.log,'a',0o600);const child=spawn(process.execPath,[path.join(home,'app/lib/gateway.mjs'),configPath],{cwd:home,detached:true,stdio:['ignore',fd,fd],windowsHide:true});fs.closeSync(fd);child.unref();let launchError;child.on('error',error=>{launchError=error;});
 try{
  for(let i=0;i<120;i++){if(launchError)throw launchError;if(child.exitCode!==null)throw Error('本机模型启动失败，请检查 '+config.log);const value=await status(config);if(value?.instance===config.instance)return value;await new Promise(resolve=>setTimeout(resolve,500));}
  throw Error('模型启动超时，请查看 '+config.log);
 }catch(error){
  child.kill('SIGTERM');await stopOwned(config);
  if(!usesGpu(config.device))throw error;
  progress('GPU 启动验证失败，使用 CPU 重试：'+error.message);config.device='CPU';config.accelerationWarning='GPU 启动验证失败，已回退 CPU';writeJson(configPath,config);return start(config);
 }

}
function open(url){if(process.argv.includes('--no-open'))return;const child=process.platform==='darwin'?spawn('open',[url],{stdio:'ignore'}):spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();}
async function replaceModel(config,plan){
 const translation=option('translation'),decision=option('decision');if(!translation&&!decision)throw Error('指定 --translation GGUF路径|default 或 --decision Laya目录|default');const patch={};
 if(translation){
  const model=translation==='default'?await download(lock.model,path.join(home,'models')):path.resolve(translation),expected=translation==='default'?lock.model.sha256:option('sha256');
  if(!/^[a-f0-9]{64}$/.test(expected||'')||await sha(model)!==expected)throw Error('翻译模型 SHA-256 不匹配');const fd=fs.openSync(model,'r');const magic=Buffer.alloc(4);try{fs.readSync(fd,magic,0,4,0);}finally{fs.closeSync(fd);}if(magic.toString()!=='GGUF')throw Error('仅支持 llama.cpp 兼容 GGUF');
  Object.assign(patch,{model,modelHash:expected,modelName:translation==='default'?'tencent/Hy-MT2-1.8B-GGUF Q8_0':path.basename(model)});
 }
 if(decision){
  if(decision==='default'){const directory=path.join(home,'models/laya-multilingual');for(const asset of lock.decision_model.files){const file=path.join(directory,asset.name);if(fs.existsSync(file)&&!await verify(file,asset))fs.renameSync(file,file+'.previous-'+Date.now());await download(asset,directory);}Object.assign(patch,materializeDecisionModel(home,await verifyDecisionManifest(directory,{name:'convaiinnovations/laya-multilingual',files:lock.decision_model.files}),lock.decision_model.files));}
  else{const directory=path.resolve(decision),manifestPath=option('manifest');if(!manifestPath)throw Error('替换 Laya 需要 --manifest 校验清单');const manifest=JSON.parse(fs.readFileSync(path.resolve(manifestPath)));Object.assign(patch,materializeDecisionModel(home,await verifyDecisionManifest(directory,manifest),manifest.files));}
 }
 const result=await upgradeInstall({home,packageRoot,version,start,patch});console.log(`模型已替换并通过启动检查；原模型与数据保留。备份：${result.backup}`);
}
async function mainUnlocked(){
 const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||major===22&&minor<20)throw new Error('需要 Node.js 22.20 或更新版本');
 const action=process.argv[2]||'help';
 if(action==='help'||['--help','-h'].includes(action)){console.log('onhold-assistant setup|upgrade|uninstall|replace-model|prepare-translation|start|stop|status|doctor [--home 路径] [--no-open]\nsetup：默认下载并校验 Laya 决策模型；翻译模型首次需要时再准备。首次加载扩展需要浏览器确认。\n可选离线资源：--model GGUF路径 --runtime llama目录。Windows 自动检测 GPU，失败回退 CPU；Mac 优先 Metal。');return;}
 const plan=platformPlan();
 if(offlineDirectory&&['setup','replace-model','prepare-translation'].includes(action)){progress('校验完整离线包');offlineMetadata=await validateOffline(offlineDirectory,verify);}
 if(action==='doctor'){console.log(JSON.stringify({platform:plan.platform,arch:plan.arch,device:plan.device,node:process.version,memory_gb:Math.round(os.totalmem()/1024**3),model_download_mb:Math.round(lock.model.size/1024**2),decision_download_mb:Math.round(lock.decision_model.files.reduce((sum,file)=>sum+file.size,0)/1024**2),minimum_disk_gib:8,runtime:plan.runtime.name,home},null,2));return;}
 fs.mkdirSync(home,{recursive:true,mode:0o700});
 if(action==='setup'){
  if(fs.existsSync(configPath)){const config=readOwned(home);await start(config);console.log(`已安装，扩展目录：${config.extensionPath}`);open(`http://127.0.0.1:${config.port}/setup`);return;}
  const port=Number(option('port')||18427),backendPort=Number(option('backend-port')||18428),decisionPort=Number(option('decision-port')||18430);const ports=[port,backendPort,decisionPort];if(ports.some(value=>!Number.isInteger(value)||value<1024||value>65535)||new Set(ports).size!==ports.length)throw new Error('端口无效');for(const value of ports)await free(value);
  const disk=fs.statfsSync(home);if(Number(disk.bavail)*Number(disk.bsize)<8*1024**3&&!option('model'))throw new Error('翻译和评分模型安装至少需要 8 GiB 可用磁盘空间');
  progress('准备默认决策模型；翻译模型按需下载');
  const decisions=await prepareDecisions(plan),model=option('model')?path.resolve(option('model')):path.join(home,'models',lock.model.name),runtime={};
  if(option('model')){if(!await verify(model,lock.model))throw Error('模型版本或 SHA-256 不匹配');Object.assign(runtime,await prepareRuntime(plan));}
  const app=path.join(home,'app');fs.mkdirSync(app,{recursive:true});for(const item of ['bin','lib','extension','package.json'])fs.cpSync(path.join(packageRoot,item),path.join(app,item),{recursive:true});
  const extensionPath=path.join(home,'extension');fs.cpSync(path.join(packageRoot,'extension'),extensionPath,{recursive:true});
  if(port!==18427)for(const name of ['background.js','settings.js','manifest.json']){const file=path.join(extensionPath,name);fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll('18427',String(port)));}
  const backendKey=randomBytes(32).toString('hex'),keyFile=path.join(home,'backend-key');fs.writeFileSync(keyFile,backendKey,{mode:0o600});
  const metadata=JSON.parse(fs.readFileSync(path.join(packageRoot,'lib/extension.json')));if(option('extension-id')&&!/^[a-p]{32}$/.test(option('extension-id')))throw Error('扩展 ID 无效');
  const config={port,backendPort,decisionPort,...decisions,instance:randomBytes(16).toString('hex'),controlToken:randomBytes(32).toString('hex'),...runtime,model,modelHash:lock.model.sha256,backendKey,keyFile,extensionPath,extensionIds:[...new Set([metadata.id,...(option('extension-id')?[option('extension-id')]:[])])],cores:os.availableParallelism(),database:path.join(home,'data/onhold.sqlite3'),log:path.join(home,'service.log'),nodeBinary:process.execPath,codeVersion:version,translationDeferred:true,translationOfflineDirectory:offlineDirectory,modelName:'tencent/Hy-MT2-1.8B-GGUF Q8_0'};
  progress('保存安装配置和本机数据库');writeJson(configPath,config);markOwned(home,config,version);if(option('import-data')){const store=openData(config.database);try{store.importLegacy(path.resolve(option('import-data')));}finally{store.close();}}progress('启动并验证决策模型');await start(config);progress('安装完成');console.log(`模型就绪。扩展目录：${extensionPath}`);open(`http://127.0.0.1:${port}/setup`);return;
 }
 if(!fs.existsSync(configPath))throw new Error('尚未安装，请先运行 setup');const config=readOwned(home);
 if(action==='prepare-translation'){
  progress('按需准备翻译模型');
  if(!fs.existsSync(config.model)){if(config.modelHash!==lock.model.sha256)throw Error('自定义翻译模型不存在，请重新指定模型');await download(lock.model,path.join(home,'models'));}
  if(await sha(config.model)!==config.modelHash)throw Error('翻译模型 SHA-256 不匹配，未启动');
  const runtime=config.binary&&fs.existsSync(config.binary)?{}:await prepareRuntime(plan);
  writeJson(configPath,{...config,...runtime,translationDeferred:true});progress('翻译模型与运行时已准备完成');return;
 }
 if(action==='status'){const value=await status(config);console.log(JSON.stringify({running:value?.instance===config.instance,extension:config.extensionPath,...(value?.instance===config.instance?{service:value}: {})},null,2));return;}
 if(action==='start'){await start(config);console.log('本机翻译服务已就绪');return;}
 if(action==='stop'){await stopOwned(config);console.log('本安装器服务已停止；模型和数据保留');return;}
 if(action==='upgrade'){progress('备份数据，升级代码并验证模型启动');const result=await upgradeInstall({home,packageRoot,version,start,patch:{translationDeferred:true}});console.log(`已升级至 ${version}，数据保留；备份：${result.backup}。请重载浏览器扩展。`);return;}
 if(action==='uninstall'){progress('停止本安装服务并清理受管依赖与模型');const result=await uninstallInstall(home,{purgeData:process.argv.includes('--purge-data')});console.log(`服务和本安装器文件已卸载；${result.dataRetained?'数据和备份保留于 '+home:'数据已按 --purge-data 删除'}。浏览器扩展请在扩展管理页移除。`);return;}
 if(action==='replace-model'){await replaceModel(config,plan);return;}
 throw new Error('未知命令；运行 onhold-assistant help');
}
export async function main(){
 const action=process.argv[2]||'help';if(['help','--help','-h','doctor','status'].includes(action))return mainUnlocked();
 fs.mkdirSync(home,{recursive:true,mode:0o700});const file=path.join(home,'.onhold-operation.lock');
 if(fs.existsSync(file)){const lock=JSON.parse(fs.readFileSync(file));if(lock.service!=='onhold-assistant')throw Error('安装目录存在未知锁文件');let running=true;try{process.kill(lock.pid,0);}catch(error){if(error.code==='ESRCH')running=false;}if(running)throw Error('另一个安装维护操作正在进行');fs.unlinkSync(file);}
 const fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({service:'onhold-assistant',pid:process.pid}));fs.closeSync(fd);
 try{return await mainUnlocked();}finally{fs.rmSync(file,{force:true});}
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});

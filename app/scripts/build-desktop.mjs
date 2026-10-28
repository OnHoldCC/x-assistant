import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateOffline} from '../../lib/offline.mjs';
import {verify} from '../../bin/cli.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const at=process.argv.indexOf('--bundle'),bundle=path.resolve(at>=0?process.argv[at+1]:path.join(root,'../desktop/payload'));
try{
  if(!['darwin','win32'].includes(process.platform))throw Error('请在目标 Mac / Windows 平台构建桌面包');
  const meta=await validateOffline(path.join(bundle,'assets'),verify);
  const lock=JSON.parse(fs.readFileSync(path.join(root,'../lib/runtime-lock.json')));
  for(const asset of [lock.model,...lock.decision_model.files,lock.platforms[process.platform+'-'+process.arch],lock.decision_runtime[process.platform+'-'+process.arch],lock.gpu_platforms?.[process.platform+'-'+process.arch]].filter(Boolean)){
    if(!meta.files.some(file=>file.name===asset.name&&file.sha256===asset.sha256&&file.size===asset.size))throw Error('内置包缺少固定模型或运行时：'+asset.name);
  }
  const args=process.argv.slice(2);if(at>=0)args.splice(at-2,2);
  if(args.includes('--target'))throw Error('包含离线模型时，请在对应系统和架构原生构建');
  const config={bundle:{resources:{'../dist/':'web/','../../extension/':'extension/',[bundle+'/']:'offline/'}}};
  const result=spawnSync(process.execPath,[path.join(root,'node_modules/@tauri-apps/cli/tauri.js'),'build','--config',JSON.stringify(config),...args],{cwd:root,stdio:'inherit',env:process.env,windowsHide:true});
  if(result.error)throw result.error;process.exitCode=result.status??1;
  if(result.status===0&&process.platform==='darwin'){
    const installer=spawnSync(process.execPath,[path.join(root,'scripts/build-macos-installer.mjs')],{cwd:path.join(root,'..'),stdio:'inherit',env:process.env});
    if(installer.error)throw installer.error;process.exitCode=installer.status??1;
  }
}catch(error){console.error(error.message);process.exitCode=1;}

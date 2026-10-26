#!/usr/bin/env node
import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
import {readOwned} from '../lib/lifecycle.mjs';import {verify,download} from './cli.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),lock=JSON.parse(fs.readFileSync(path.join(root,'lib/runtime-lock.json'))),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
const option=name=>{const at=process.argv.indexOf('--'+name);return at<0?null:process.argv[at+1];};
const nodeAssets={
 'darwin-arm64':['tar.gz','89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7'],
 'darwin-x64':['tar.gz','d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035'],
 'win32-x64':['zip','d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5'],
 'win32-arm64':['zip','a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171']
};
async function digest(file){const h=createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function main(){
 if(!option('home')||!option('output'))throw Error('用法：node bin/build-offline.mjs --home 已验证安装目录 --output 新离线包目录');
 const home=path.resolve(option('home')),out=path.resolve(option('output')),config=readOwned(home),platform=process.platform,arch=process.arch,key=platform+'-'+arch;
 if(fs.existsSync(out))throw Error('输出目录已存在，不覆盖');if(!nodeAssets[key])throw Error('不支持当前系统');
 if(config.modelHash!==lock.model.sha256)throw Error('首版离线构建仅支持官方默认模型；请先切回默认模型');
 const skill=fs.existsSync(path.join(root,'skills/onhold-assistant/SKILL.md'))?path.join(root,'skills/onhold-assistant'):path.resolve(root,'../..');if(!fs.existsSync(path.join(skill,'SKILL.md')))throw Error('找不到配套 Skill');
 fs.mkdirSync(out,{recursive:true});const assets=path.join(out,'assets');fs.mkdirSync(assets);fs.cpSync(skill,path.join(out,'skill'),{recursive:true});for(const name of ['LICENSE','THIRD_PARTY_NOTICES.txt'])fs.copyFileSync(path.join(root,name),path.join(out,name));
 async function asset(value,existing){const target=path.join(assets,value.name);fs.mkdirSync(path.dirname(target),{recursive:true});if(existing&&await verify(existing,value))fs.copyFileSync(existing,target);else await download(value,assets);}
 console.log('[离线构建] 收集已验证官方模型与运行时');await asset(lock.model,config.model);
 for(const value of lock.decision_model.files)await asset(value,path.join(config.decisionSource,value.name));
 for(const value of [lock.platforms[key],lock.gpu_platforms?.[key],lock.decision_runtime[key]].filter(Boolean))await asset(value,path.join(home,'downloads',value.name));
 const [extension,checksum]=nodeAssets[key],nodePlatform=platform==='win32'?'win':'darwin',nodeName=`node-v24.22.1-${nodePlatform}-${arch}.${extension}`,nodeFile=path.join(assets,nodeName);
 const response=await fetch('https://nodejs.org/dist/v24.22.1/'+nodeName);if(!response.ok)throw Error('Node 离线归档下载失败 '+response.status);await fsp.writeFile(nodeFile,response.body);if(await digest(nodeFile)!==checksum)throw Error('Node 离线归档校验失败');
 const pythonInfo=JSON.parse(execFileSync(config.decisionPython,['-c','import json,sys; print(json.dumps([sys.base_prefix,sys._base_executable]))'],{encoding:'utf8'}));const pythonBase=fs.realpathSync(pythonInfo[0]),pythonExecutable=fs.realpathSync(pythonInfo[1]),relativePython=path.relative(pythonBase,pythonExecutable);
 if(relativePython.startsWith('..')||path.isAbsolute(relativePython))throw Error('无法确定可迁移 Python 入口');
 console.log('[离线构建] 复制独立 Python；排除字节码和用户配置');fs.cpSync(pythonBase,path.join(assets,'python'),{recursive:true,verbatimSymlinks:true,filter:source=>!source.split(path.sep).includes('__pycache__')&&!source.endsWith('.pyc')});
 const uv=findBinary(path.join(home,'tools/uv'),/^uv(?:\.exe)?$/);if(!uv)throw Error('找不到受管 uv');
 const frozen=execFileSync(uv,['pip','freeze','--python',config.decisionPython],{encoding:'utf8'}).trim();if(!frozen.split(/\r?\n/).every(line=>/^[a-zA-Z0-9_.-]+==[a-zA-Z0-9.+_-]+$/.test(line)))throw Error('依赖包含未固定或本地来源，拒绝打包');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-offline-build-')),buildEnv={...process.env,UV_CACHE_DIR:path.join(home,'uv-cache'),PIP_CACHE_DIR:path.join(home,'uv-cache/offline-wheel-cache')};
 try{
  const requirements=path.join(temporary,'requirements.txt');fs.writeFileSync(requirements,frozen+'\n');fs.mkdirSync(path.join(assets,'wheels'));
  execFileSync(uv,['venv',path.join(temporary,'builder'),'--seed','--python',config.decisionPython],{env:buildEnv,stdio:'inherit',windowsHide:true});const builder=path.join(temporary,'builder',platform==='win32'?'Scripts/python.exe':'bin/python');
  const torchLine=frozen.split(/\r?\n/).find(line=>line.startsWith('torch==')),backend=torchLine?.split('+')[1],extra=backend?['--extra-index-url','https://download.pytorch.org/whl/'+backend]:[];
  console.log('[离线构建] 下载并构建完整 wheelhouse');execFileSync(builder,['-m','pip','wheel','--no-deps','--wheel-dir',path.join(assets,'wheels'),'--requirement',requirements,...extra],{env:buildEnv,stdio:'inherit',windowsHide:true});
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
 const licenseDir=path.join(assets,'licenses');fs.mkdirSync(licenseDir);const licenses=[
  ['Hy-MT2-LICENSE.txt','https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/a0c709d9fac510f2c807aa3af52872340dc37a4a/LICENSE.txt'],
  ['Laya-LICENSE','https://raw.githubusercontent.com/NandhaKishorM/laya/main/LICENSE'],
  ['Laya-MODEL-CARD.md','https://huggingface.co/convaiinnovations/laya-multilingual/resolve/1720e3e3357cfe1e281542e223f8273b0890ca34/README.md'],
  ['llama.cpp-LICENSE','https://raw.githubusercontent.com/ggml-org/llama.cpp/b11669/LICENSE'],
  ['uv-LICENSE-MIT','https://raw.githubusercontent.com/astral-sh/uv/0.13.5/LICENSE-MIT'],
  ['uv-LICENSE-APACHE','https://raw.githubusercontent.com/astral-sh/uv/0.13.5/LICENSE-APACHE']
 ];
 for(const [name,url]of licenses){const r=await fetch(url);if(!r.ok)throw Error('无法取得第三方许可 '+name+' '+r.status);fs.writeFileSync(path.join(licenseDir,name),await r.text());}
 const entries=[];for(const file of files(assets)){const stat=fs.statSync(file);entries.push({name:path.relative(assets,file).split(path.sep).join('/'),size:stat.size,sha256:await digest(file)});}
 const meta={format:1,version,platform,arch,python_entry:'python/'+relativePython.split(path.sep).join('/'),files:entries};fs.writeFileSync(path.join(assets,'offline.json'),JSON.stringify(meta,null,2));
 fs.writeFileSync(path.join(out,'install.command'),`#!/bin/bash\nset -euo pipefail\nfolder=$(cd "$(dirname "$0")" && pwd)\noperation=setup\ncase "\${1:-}" in setup|upgrade|uninstall|start|stop|status|doctor|replace-model) operation="$1"; shift;; esac\nbash "$folder/skill/scripts/bootstrap.sh" "$operation" --offline-dir "$folder/assets" --no-open "$@"\n`,{mode:0o755});
 fs.writeFileSync(path.join(out,'install.ps1'),`$ErrorActionPreference = 'Stop'\n$operation = 'setup'\n$remaining = @($args)\nif ($remaining.Count -gt 0 -and $remaining[0] -in @('setup','upgrade','uninstall','start','stop','status','doctor','replace-model')) { $operation=$remaining[0]; $remaining=@($remaining | Select-Object -Skip 1) }\n& (Join-Path $PSScriptRoot 'skill/scripts/bootstrap.ps1') $operation --offline-dir (Join-Path $PSScriptRoot 'assets') --no-open @remaining\n`);
 console.log(JSON.stringify({output:out,version,platform,arch,files:entries.length,total_bytes:entries.reduce((n,e)=>n+e.size,0)}));
}
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const file=path.join(directory,entry.name);return entry.isDirectory()?files(file):entry.isSymbolicLink()&&fs.statSync(file).isDirectory()?[]:[file];});}
function findBinary(directory,pattern){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isFile()&&pattern.test(entry.name))return file;if(entry.isDirectory()){const found=findBinary(file,pattern);if(found)return found;}}}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});

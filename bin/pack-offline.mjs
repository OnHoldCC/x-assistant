#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {once} from 'node:events';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {validateOffline} from '../lib/offline.mjs';import {verify} from './cli.mjs';
const at=process.argv.indexOf('--bundle'),folder=at<0?null:process.argv[at+1];
async function main(){
 if(!folder)throw Error('用法：node bin/pack-offline.mjs --bundle 离线包目录');const bundle=path.resolve(folder),name=path.basename(bundle),parent=path.dirname(bundle);if(!/^[a-zA-Z0-9_.-]+$/.test(name))throw Error('离线包目录名称仅使用英文字母、数字、点、横线和下划线');
 await validateOffline(path.join(bundle,'assets'),verify);const archive=path.join(parent,name+'.tar.gz');if(fs.existsSync(archive))throw Error('归档已存在，不覆盖');
 console.log('[离线构建] 压缩已校验包');execFileSync('tar',['-czf',archive,'-C',parent,name],{stdio:'inherit',windowsHide:true});
 const max=1536*1024**2,parts=[],archiveHash=createHash('sha256');let output,hash,bytes=0,part=0,current;
 async function finish(){if(!output)return;output.end();await once(output,'close');parts.push({name:current,size:bytes,sha256:hash.digest('hex')});output=null;}
 for await(const chunk of fs.createReadStream(archive,{highWaterMark:16*1024**2})){
  archiveHash.update(chunk);let offset=0;
  while(offset<chunk.length){if(!output){current=name+'.tar.gz.part'+String(++part).padStart(3,'0');if(fs.existsSync(path.join(parent,current)))throw Error('分片已存在');output=fs.createWriteStream(path.join(parent,current));hash=createHash('sha256');bytes=0;}
   const length=Math.min(chunk.length-offset,max-bytes),slice=chunk.subarray(offset,offset+length);if(!output.write(slice))await once(output,'drain');hash.update(slice);bytes+=length;offset+=length;if(bytes===max)await finish();
  }
 }
 await finish();const metadata={archive:path.basename(archive),sha256:archiveHash.digest('hex'),parts};fs.writeFileSync(path.join(parent,name+'.manifest.json'),JSON.stringify(metadata,null,2));fs.writeFileSync(path.join(parent,name+'.SHA256SUMS'),parts.map(p=>p.sha256+'  '+p.name).join('\n')+'\n');
 const quoted=parts.map(p=>'"'+p.name+'"').join(' '),sums=parts.map(p=>p.sha256+'  '+p.name).join('\n');
 fs.writeFileSync(path.join(parent,name+'-install.command'),`#!/bin/bash\nset -euo pipefail\ncd "$(dirname "$0")"\nshasum -a 256 -c <<'ONHOLD_SUMS'\n${sums}\nONHOLD_SUMS\ntemporary=$(mktemp -d)\ntrap 'rm -rf "$temporary"' EXIT\ncat ${quoted} | tar -xz -C "$temporary"\nbash "$temporary/${name}/install.command" "$@"\n`,{mode:0o755});
 const checks=parts.map(p=>`if ((Get-FileHash (Join-Path $PSScriptRoot '${p.name}') -Algorithm SHA256).Hash.ToLowerInvariant() -ne '${p.sha256}') { throw 'Part checksum mismatch: ${p.name}' }`).join('\n');
 const copy=parts.map(p=>`$inputFile=[IO.File]::OpenRead((Join-Path $PSScriptRoot '${p.name}')); try { $inputFile.CopyTo($target) } finally { $inputFile.Dispose() }`).join('\n');
 fs.writeFileSync(path.join(parent,name+'-install.ps1'),`$ErrorActionPreference='Stop'\n${checks}\n$temporary=Join-Path ([IO.Path]::GetTempPath()) ('onhold-offline-'+[Guid]::NewGuid())\nNew-Item -ItemType Directory $temporary | Out-Null\ntry {\n$target=[IO.File]::Create((Join-Path $temporary 'package.tar.gz'))\ntry {\n${copy}\n} finally { $target.Dispose() }\ntar -xzf (Join-Path $temporary 'package.tar.gz') -C $temporary\nif ($LASTEXITCODE -ne 0) { throw 'Archive extraction failed' }\n& (Join-Path $temporary '${name}/install.ps1') @args\n} finally { Remove-Item $temporary -Recurse -Force }\n`);
 console.log(JSON.stringify({archive,parts,installers:[name+'-install.command',name+'-install.ps1']}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});

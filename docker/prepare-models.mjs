import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
export async function verify(file, asset) {
  try {
    if (fs.statSync(file).size !== asset.size) return false;
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest('hex') === asset.sha256;
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export async function download(asset, file) {
  const url=new URL(asset.url); if(url.protocol!=='https:') throw Error('模型下载必须使用 HTTPS');
  let previous=fs.existsSync(file)?fs.statSync(file).size:0;
  if(previous>=asset.size){fs.truncateSync(file,0);previous=0;}
  const response=await fetch(url,{headers:previous?{Range:`bytes=${previous}-`}:{},signal:AbortSignal.timeout(3600000)});
  if(!response.ok) throw Error(`下载返回 HTTP ${response.status}`);
  if(response.url&&new URL(response.url).protocol!=='https:') throw Error('拒绝非 HTTPS 下载跳转');
  if(response.status===206) {
    if(!response.headers.get('content-range')?.startsWith(`bytes ${previous}-`)) throw Error('下载断点不匹配，保留临时文件');
  } else { previous=0; }
  let bytes=previous,last=0;const started=Date.now();
  const counter=new Transform({transform(chunk,encoding,done){
    bytes+=chunk.length;
    if(bytes>asset.size){done(Error('模型下载超过预期大小'));return;}
    if(Date.now()-last>3000){last=Date.now();console.log(`[下载进度] ${asset.name} ${bytes}/${asset.size} bytes (${(bytes/asset.size*100).toFixed(1)}%) ${Math.round((bytes-previous)/Math.max(1,(Date.now()-started)/1000)/1024)} KiB/s`);}
    done(null,chunk);
  }});
  await pipeline(Readable.fromWeb(response.body),counter,fs.createWriteStream(file,{flags:previous?'a':'w',mode:0o600}));
}
export async function prepare(root='/models', secrets='/secrets', state='/data', mode='all') {
  const lock = JSON.parse(fs.readFileSync(new URL('../lib/runtime-lock.json',import.meta.url)));
  for (const directory of [root,secrets,state,...['admin','gateway','codex'].map(name=>path.join(state,name))]) {
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    if(process.getuid?.()===0) fs.chownSync(directory,1000,1000);
  }
  const key = path.join(secrets,'backend-key');
  if (!fs.existsSync(key)) fs.writeFileSync(key,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
  if(!/^[a-f0-9]{64}$/.test(fs.readFileSync(key,'utf8'))) throw Error('模型密钥文件无效，请保留文件并检查，未覆盖');
  if(process.getuid?.()===0) fs.chownSync(key,1000,1000);
  if(!['all','translation'].includes(mode)) throw Error('无效模型选择');
  const assets = [lock.model];
  let completed=0;
  for (const asset of assets) {
    const file=path.join(root,asset.name);
    fs.mkdirSync(path.dirname(file),{recursive:true});
    if(await verify(file,asset)) console.log(`[模型校验] ${++completed}/${assets.length} 复用 ${asset.name}`);
    else {
      if(fs.existsSync(file)) throw Error(`模型校验失败，保留原文件：${file}`);
      console.log(`[模型下载] ${completed+1}/${assets.length} ${asset.name} ${asset.size} bytes`);
      const temporary=file+'.part';
      if(!await verify(temporary,asset)) await download(asset,temporary);
      if(!await verify(temporary,asset)) throw Error(`下载校验失败：${asset.name}`);
      fs.renameSync(temporary,file);completed++;
      console.log(`[模型校验] ${completed}/${assets.length} SHA-256 通过 ${asset.name}`);
    }
    fs.chmodSync(file,0o644);
  }
  console.log(`[模型文件就绪] ${mode} 的 ${assets.length} 个权重文件已验证，接下来启动所选推理服务`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) prepare('/models','/secrets','/data',process.argv[2]||'all').catch(error=>{console.error(error.message);process.exitCode=1;});

import fs from 'node:fs';import path from 'node:path';
export async function validateOffline(directory,verify,platform=process.platform,arch=process.arch){
 const root=fs.realpathSync(directory),meta=JSON.parse(fs.readFileSync(path.join(root,'offline.json'),'utf8'));
 if(meta.format!==1||meta.platform!==platform||meta.arch!==arch)throw Error('离线包与当前系统/架构不匹配');
 if(!Array.isArray(meta.files)||!meta.files.length||meta.files.length>10000||new Set(meta.files.map(file=>file.name)).size!==meta.files.length)throw Error('离线校验清单无效');
 for(const asset of meta.files){
  if(typeof asset.name!=='string'||path.isAbsolute(asset.name)||!Number.isSafeInteger(asset.size)||asset.size<0||!/^[a-f0-9]{64}$/.test(asset.sha256||''))throw Error('离线文件记录无效');
  const file=path.resolve(root,asset.name);if(!file.startsWith(root+path.sep)||!fs.realpathSync(file).startsWith(root+path.sep)||!await verify(file,asset))throw Error('离线文件校验失败：'+asset.name);
 }
 const listed=new Set(meta.files.map(file=>file.name));
 function inspect(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name),name=path.relative(root,file).split(path.sep).join('/');if(name==='offline.json')continue;if(entry.isSymbolicLink()&&!fs.realpathSync(file).startsWith(root+path.sep))throw Error('离线符号链接越界：'+name);if(entry.isDirectory())inspect(file);else if(!(entry.isSymbolicLink()&&fs.statSync(file).isDirectory())&&!listed.has(name))throw Error('离线包包含未校验文件：'+name);}}
 inspect(root);
 if(typeof meta.python_entry!=='string'||!meta.python_entry.startsWith('python/')||!listed.has(meta.python_entry))throw Error('离线 Python 入口无效');
 return {...meta,root};
}

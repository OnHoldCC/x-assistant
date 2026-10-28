import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const config=JSON.parse(fs.readFileSync(path.join(root,'app/src-tauri/tauri.conf.json')));
const target=process.env.CARGO_TARGET_DIR?path.resolve(root,'app',process.env.CARGO_TARGET_DIR):path.join(root,'app/src-tauri/target');
const app=path.resolve(process.argv[2]||path.join(target,'release/bundle/macos/OnHold Admin.app'));
const policy=path.join(root,'app/installer/macos');
let temporary;
try{
  if(process.platform!=='darwin')throw Error('Mac 覆盖安装包需要在 macOS 构建');
  if(config.identifier!=='cc.onhold.admin'||config.productName!=='OnHold Admin')throw Error('应用名称和标识必须保持不变，避免重复安装');
  const read=key=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :'+key,path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim();
  if(path.basename(app)!=='OnHold Admin.app'||read('CFBundleIdentifier')!==config.identifier||read('CFBundleShortVersionString')!==config.version)throw Error('请先构建同版本 OnHold Admin.app');
  execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
  temporary=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-pkg-'));
  const payload=path.join(temporary,'payload'),scripts=path.join(temporary,'scripts');
  fs.mkdirSync(payload);fs.cpSync(path.join(policy,'scripts'),scripts,{recursive:true});
  for(const name of ['preinstall','postinstall'])fs.chmodSync(path.join(scripts,name),0o755);
  execFileSync('/bin/cp',['-cR',app,payload]);
  const component=path.join(temporary,'onhold.pkg');
  execFileSync('/usr/bin/pkgbuild',['--root',payload,'--component-plist',path.join(policy,'components.plist'),'--scripts',scripts,'--identifier','cc.onhold.admin','--version',config.version,'--install-location','/Applications','--ownership','recommended',component],{stdio:'inherit'});
  const distribution=path.join(temporary,'distribution.xml');
  fs.writeFileSync(distribution,fs.readFileSync(path.join(policy,'distribution.xml'),'utf8').replaceAll('@ARCH@',process.arch==='arm64'?'arm64':'x86_64'));
  const output=path.join(root,'desktop/dist',`OnHold-Admin-${config.version}-mac-${process.arch}.pkg`);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  execFileSync('/usr/bin/productbuild',['--distribution',distribution,'--package-path',temporary,output],{stdio:'inherit'});
  console.log('覆盖安装包：'+output);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});}

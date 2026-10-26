#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const option=name=>{const at=process.argv.indexOf('--'+name);if(at<0||!process.argv[at+1])throw Error('需要 --'+name);return path.resolve(process.argv[at+1]);};
const bundle=option('bundle'),home=option('home'),windows=process.platform==='win32',root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(fs.existsSync(home))throw Error('离线测试目录已存在，不覆盖');
const env={...process.env,PATH:windows?`${process.env.WINDIR}\\System32;${process.env.WINDIR}\\System32\\WindowsPowerShell\\v1.0`:'/usr/bin:/bin:/usr/sbin:/sbin',HTTP_PROXY:'http://127.0.0.1:9',HTTPS_PROXY:'http://127.0.0.1:9',ALL_PROXY:'http://127.0.0.1:9',NO_PROXY:'127.0.0.1,localhost',NODE_USE_ENV_PROXY:'1',UV_OFFLINE:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'};
const entry=path.join(bundle,'skill/scripts/bootstrap.'+(windows?'ps1':'sh')),command=windows?path.join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe'):'/bin/bash',prefix=windows?['-NoProfile','-File',entry]:[entry];
const run=operation=>execFileSync(command,[...prefix,operation,'--home',home,'--offline-dir',path.join(bundle,'assets'),'--no-open',...(operation==='setup'?['--port','21427','--backend-port','21428','--decision-port','21430']:[])],{env,stdio:'inherit',windowsHide:true});
try{
 run('setup');execFileSync(process.execPath,[path.join(root,'test/live-models.mjs'),'http://127.0.0.1:21427'],{env,stdio:'inherit',windowsHide:true});
 run('stop');run('start');execFileSync(process.execPath,[path.join(root,'test/live-models.mjs'),'http://127.0.0.1:21427'],{env,stdio:'inherit',windowsHide:true});
}finally{if(fs.existsSync(path.join(home,'config.json')))run('uninstall');}
for(const name of ['agent-node','models','python','decisions','runtime','config.json'])if(fs.existsSync(path.join(home,name)))throw Error('卸载遗留 '+name);
if(!fs.existsSync(path.join(home,'data/onhold.sqlite3')))throw Error('卸载丢失持久数据');
console.log('离线安装、真实翻译/分析、重启缓存、卸载检查通过；未使用系统 Node，外网代理已阻断。');

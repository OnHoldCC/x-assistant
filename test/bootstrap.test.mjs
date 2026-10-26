import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {execFileSync} from 'node:child_process';
const script=path.resolve(import.meta.dirname,'../skills/onhold-assistant/scripts/bootstrap.'+(process.platform==='win32'?'ps1':'sh'));
const run=args=>execFileSync(process.platform==='win32'?'powershell.exe':'/bin/bash',process.platform==='win32'?['-NoProfile','-File',script,...args]:[script,...args],{encoding:'utf8',windowsHide:true});
test('bootstrap reuses system Node and uninstall removes only its marked private runtime',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'onhold bootstrap '));
 try{
  const info=JSON.parse(run(['doctor','--home',root]));assert.equal(info.node,process.version);assert.equal(fs.existsSync(path.join(root,'agent-node')),false);
  for(const owned of [true,false]){
   for(const p of ['app/lib','extension','data','agent-node'])fs.mkdirSync(path.join(root,p),{recursive:true});
   fs.writeFileSync(path.join(root,'app/lib/gateway.mjs'),'fixture code');fs.writeFileSync(path.join(root,'data/saved.txt'),'retained user data');fs.writeFileSync(path.join(root,'agent-node/.onhold-node'),owned?'onhold-assistant-node-v1':'unrelated-runtime');
   const config={instance:'a'.repeat(32),controlToken:'fixture',port:0,extensionPath:path.join(root,'extension'),database:path.join(root,'data/results.sqlite3')};fs.writeFileSync(path.join(root,'config.json'),JSON.stringify(config));
   run(['uninstall','--home',root,'--no-open']);assert.equal(fs.existsSync(path.join(root,'agent-node')),!owned);assert.equal(fs.readFileSync(path.join(root,'data/saved.txt'),'utf8'),'retained user data');
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

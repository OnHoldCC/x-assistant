import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('release parts verify before extraction and preserve installer arguments',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'onhold pack ')),bundle=path.join(root,'onhold-test'),asset=path.join(bundle,'assets/python/bin/python3'),marker=path.join(root,'installed.txt');
 try{
  fs.mkdirSync(path.dirname(asset),{recursive:true});fs.writeFileSync(asset,'fixture');fs.writeFileSync(path.join(bundle,'assets/offline.json'),JSON.stringify({format:1,platform:process.platform,arch:process.arch,python_entry:'python/bin/python3',files:[{name:'python/bin/python3',size:7,sha256:createHash('sha256').update('fixture').digest('hex')}]}));
  fs.writeFileSync(path.join(bundle,'install.command'),'#!/bin/bash\nprintf "%s" "$2" > "$1"\n');
  execFileSync(process.execPath,[fileURLToPath(new URL('../bin/pack-offline.mjs',import.meta.url)),'--bundle',bundle]);
  const metadata=JSON.parse(fs.readFileSync(path.join(root,'onhold-test.manifest.json')));assert.equal(metadata.parts.length,1);assert.ok(metadata.parts[0].size<2*1024**3);
  if(process.platform!=='win32'){
   const entry=path.join(root,'onhold-test-install.command');execFileSync('bash',[entry,marker,'argument with spaces']);assert.equal(fs.readFileSync(marker,'utf8'),'argument with spaces');fs.unlinkSync(marker);
   fs.appendFileSync(path.join(root,metadata.parts[0].name),'tampered');assert.throws(()=>execFileSync('bash',[entry,marker,'must not execute'],{stdio:'pipe'}));assert.equal(fs.existsSync(marker),false);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

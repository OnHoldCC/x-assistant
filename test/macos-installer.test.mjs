import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const policy=path.resolve('app/installer/macos');
const postinstall=path.join(policy,'scripts/postinstall');
const bundle=(root,name,id,version)=>{
  const app=path.join(root,'Applications',name),contents=path.join(app,'Contents');
  fs.mkdirSync(contents,{recursive:true});
  fs.writeFileSync(path.join(contents,'Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`);
  return app;
};
const run=root=>spawnSync('/bin/sh',[postinstall,'test.pkg','/Applications',root],{encoding:'utf8'});

test('Mac installer keeps one fixed identity, target and replacement policy',{skip:process.platform!=='darwin'},()=>{
  const config=JSON.parse(fs.readFileSync('app/src-tauri/tauri.conf.json'));
  assert.equal(config.productName,'OnHold Admin');assert.equal(config.identifier,'cc.onhold.admin');
  const [component]=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',path.join(policy,'components.plist')],{encoding:'utf8'}));
  assert.deepEqual(component,{RootRelativeBundlePath:'OnHold Admin.app',BundleIsRelocatable:false,BundleIsVersionChecked:true,BundleHasStrictIdentifier:true,BundleOverwriteAction:'upgrade'});
  const distribution=fs.readFileSync(path.join(policy,'distribution.xml'),'utf8');
  assert.match(distribution,/enable_currentUserHome="false" enable_localSystem="true"/);
  for(const id of ['cc.onhold.admin','cc.onhold.assistant'])assert.ok(distribution.includes(`<app id="${id}"/>`));
  for(const script of ['preinstall','postinstall'])execFileSync('/bin/sh',['-n',path.join(policy,'scripts',script)]);
});

test('upgrade archives only the known legacy prototype after the new app exists; keeps user data and is repeatable',{skip:process.platform!=='darwin'},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-upgrade-test-'));
  try{
    const legacy=bundle(root,'OnHold Assistant.app','cc.onhold.assistant','0.7.0');
    const current=bundle(root,'OnHold Admin.app','cc.onhold.admin','0.9.0');
    const data=path.join(root,'Library/Application Support/cc.onhold.admin/data.sqlite3');
    fs.mkdirSync(path.dirname(data),{recursive:true});fs.writeFileSync(data,'existing account data');
    const before=fs.readFileSync(path.join(legacy,'Contents/Info.plist'));
    const result=run(root);assert.equal(result.status,0,result.stderr);
    assert.equal(fs.existsSync(legacy),false);assert.equal(fs.existsSync(current),true);
    const archives=path.join(root,'Library/Application Support/OnHold/Previous Versions');
    const entries=fs.readdirSync(archives);assert.equal(entries.length,1);
    assert.deepEqual(fs.readFileSync(path.join(archives,entries[0],'OnHold Assistant.app.backup/Contents/Info.plist')),before);
    assert.equal(fs.readFileSync(data,'utf8'),'existing account data');
    assert.equal(run(root).status,0);assert.equal(fs.readdirSync(archives).length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('migration leaves unrelated, symlinked and unrecognized versions in place, and refuses to archive before installation',{skip:process.platform!=='darwin'},()=>{
  for(const [id,version,installed,symlink,status] of [['other.app','0.7.0',true,false,0],['cc.onhold.assistant','0.8.0',true,false,0],['cc.onhold.assistant','0.7.0',false,false,1],['cc.onhold.assistant','0.7.0',true,true,0]]){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-upgrade-test-'));
    try{
      const legacy=bundle(root,'OnHold Assistant.app',id,version);
      if(installed)bundle(root,'OnHold Admin.app','cc.onhold.admin','0.9.0');
      if(symlink){fs.renameSync(legacy,legacy+'.original');fs.symlinkSync(legacy+'.original',legacy);}
      const result=run(root);assert.equal(result.status,status,result.stderr);assert.equal(fs.existsSync(legacy),true);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  }
});

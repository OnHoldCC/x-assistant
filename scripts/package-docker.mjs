// The installation Skill fetches source; no application image or source archive is distributed.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-skill-package-'));
const stage=path.join(temporary,'onhold-assistant');
try {
  for(const file of ['SKILL.md','references/docker.md']) {
    const target=path.join(stage,file);fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.copyFileSync(path.join(root,'skills/onhold-assistant',file),target);
  }
  for(const file of ['LICENSE','THIRD_PARTY_NOTICES.txt'])fs.copyFileSync(path.join(root,file),path.join(stage,file));
  const release=path.join(root,'desktop/dist');fs.mkdirSync(release,{recursive:true});
  const name='OnHold-Docker-Skill-0.9.5.tgz',bundle=path.join(release,name);
  execFileSync('tar',['-czf',bundle,'-C',temporary,'onhold-assistant'],{stdio:'inherit',env:{...process.env,COPYFILE_DISABLE:'1'}});
  const hash=createHash('sha256').update(fs.readFileSync(bundle)).digest('hex');
  fs.writeFileSync(bundle+'.sha256',hash+'  '+name+'\n');
  console.log(`安装 Skill 包：${bundle}\n${fs.statSync(bundle).size} bytes SHA-256 ${hash}`);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}

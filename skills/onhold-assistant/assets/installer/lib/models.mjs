import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
// Laya normalizes tokenizer JSON at load time. Keep verified source assets separate.
export function materializeDecisionModel(home,verified,files){
 const id=createHash('sha256').update(verified.decisionHash+':laya-0.4.15').digest('hex').slice(0,20),destination=path.join(home,'models','runtime-laya-'+id);
 if(!fs.existsSync(destination)){const stage=destination+'.'+randomUUID();fs.mkdirSync(stage,{recursive:true,mode:0o700});try{
  for(const asset of files){const source=path.join(verified.decisionModel,asset.name),target=path.join(stage,asset.name);fs.mkdirSync(path.dirname(target),{recursive:true});if(asset.name.endsWith('.safetensors')){try{fs.linkSync(source,target);}catch{fs.copyFileSync(source,target);}}else fs.copyFileSync(source,target);}
  fs.renameSync(stage,destination);
 }finally{fs.rmSync(stage,{recursive:true,force:true});}}
 return {...verified,decisionSource:verified.decisionModel,decisionModel:destination};
}

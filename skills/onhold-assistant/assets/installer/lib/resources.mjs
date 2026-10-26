import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import fs from 'node:fs/promises';
const exec=promisify(execFile);const prior=new Map();
export async function dataUsage(database){
 let total=0;for(const suffix of ['','-wal','-shm'])try{total+=(await fs.stat(database+suffix)).size;}catch(error){if(error.code!=='ENOENT')throw error;}return total;
}
export function cpuSeconds(text){
 const match=text.trim().match(/^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
 return match?Number(match[1]||0)*86400+Number(match[2]||0)*3600+Number(match[3])*60+Number(match[4]):null;
}
export async function resources(pid,database,extraPids=[]){
 const result={translation_cpu_percent:null,translation_process_rss_mb:null,translation_data_bytes:null};
 if(database)try{result.translation_data_bytes=await dataUsage(database);}catch{}
 let cpuTotal=0,rssTotal=0,measured=false,hasRss=false;
 for(const modelPid of new Set([pid,...extraPids].filter(Boolean)))try{
  let seconds,rss;
  if(process.platform==='win32'){
   const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$p=Get-Process -Id ${Number(modelPid)} -ErrorAction Stop; @{seconds=$p.CPU;rss=$p.WorkingSet64}|ConvertTo-Json -Compress`],{timeout:3000,windowsHide:true});
   const value=JSON.parse(stdout);seconds=value.seconds;rss=value.rss;
  }else{
   const {stdout}=await exec('ps',['-p',String(modelPid),'-o','time=,rss='],{timeout:2000});const [time,memory]=stdout.trim().split(/\s+/);seconds=cpuSeconds(time);rss=Number(memory)*1024;
  }
  const now=performance.now(),old=prior.get(modelPid);if(old&&Number.isFinite(seconds)&&now>old.at){cpuTotal+=Math.max(0,(seconds-old.seconds)/(now-old.at)*100000);measured=true;}
  prior.set(modelPid,{at:now,seconds});if(Number.isFinite(rss)){rssTotal+=rss;hasRss=true;}
 }catch{}
 if(measured)result.translation_cpu_percent=Math.round(cpuTotal*10)/10;if(hasRss)result.translation_process_rss_mb=Math.round(rssTotal/1024**2*10)/10;
 return result;
}

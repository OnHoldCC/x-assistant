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
 const pids=[...new Set([pid,...extraPids].filter(Boolean))],samples=new Map();
 if(pids.includes(process.pid)){const cpu=process.cpuUsage();samples.set(process.pid,{seconds:(cpu.user+cpu.system)/1e6,rss:process.memoryUsage.rss()});}
 const external=pids.filter(value=>value!==process.pid);
 if(process.platform==='win32'&&external.length)try{
  const ids=external.map(Number).join(',');
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-Process -Id @(${ids}) -ErrorAction SilentlyContinue | ForEach-Object { @{pid=$_.Id;seconds=$_.CPU;rss=$_.WorkingSet64} }) | ConvertTo-Json -Compress`],{timeout:8000,windowsHide:true});
  for(const value of [JSON.parse(stdout)].flat())samples.set(value.pid,value);
 }catch{}
 let cpuTotal=0,rssTotal=0,measured=true,hasRss=true;
 for(const modelPid of pids)try{
  let sample=samples.get(modelPid);
  if(!sample&&process.platform!=='win32'){
   const {stdout}=await exec('ps',['-p',String(modelPid),'-o','time=,rss='],{timeout:2000});const [time,memory]=stdout.trim().split(/\s+/);sample={seconds:cpuSeconds(time),rss:Number(memory)*1024};
  }
  if(!sample)throw Error('Process measurement unavailable');const {seconds,rss}=sample;
  const now=performance.now(),old=prior.get(modelPid);if(old&&Number.isFinite(seconds)&&now>old.at)cpuTotal+=Math.max(0,(seconds-old.seconds)/(now-old.at)*100000);else measured=false;
  prior.set(modelPid,{at:now,seconds});if(Number.isFinite(rss))rssTotal+=rss;else hasRss=false;
 }catch{measured=false;hasRss=false;}
 if(pids.length&&measured)result.translation_cpu_percent=Math.round(cpuTotal*10)/10;if(pids.length&&hasRss)result.translation_process_rss_mb=Math.round(rssTotal/1024**2*10)/10;

 return result;
}

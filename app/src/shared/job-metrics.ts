import type {Job} from './types';
export function jobMetrics(job:Job){
 const runs=job.input?.telemetry?.generations||[];
 const known=runs.filter(run=>run.usage!=null),missing=runs.length-known.length;
 const input=known.reduce((sum,run)=>sum+run.usage!.input_tokens,0),output=known.reduce((sum,run)=>sum+run.usage!.output_tokens,0);
 const cached=known.every(run=>run.usage!.cached_input_tokens!=null)?known.reduce((sum,run)=>sum+run.usage!.cached_input_tokens!,0):null;
 const ended=job.state==='completed'||job.state==='failed';
 return {attempts:runs.length,missing,known_tokens:input+output,total_tokens:runs.length&&!missing?input+output:null,input_tokens:known.length?input:null,output_tokens:known.length?output:null,cached_input_tokens:known.length?cached:null,generation_ms:runs.length?runs.reduce((sum,run)=>sum+run.duration_ms,0):null,total_ms:ended?Math.max(0,job.updated_at-job.created_at):null,send_ms:ended&&job.input?.telemetry?.send_started_at!=null?Math.max(0,job.updated_at-job.input.telemetry.send_started_at):null};
}
export function duration(ms:number|null){
 if(ms===null)return '未记录';
 if(ms<1000)return `${ms} 毫秒`;
 const seconds=Math.round(ms/100)/10;
 return seconds<60?`${seconds} 秒`:`${Math.floor(seconds/60)} 分 ${Math.round(seconds%60)} 秒`;
}

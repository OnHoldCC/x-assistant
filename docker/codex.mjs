import http from 'node:http';
import {codexUsage,normalizeUsage} from '../lib/codex-usage.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL,fileURLToPath} from 'node:url';
function execute(args,prompt,timeout=120000,directory){return new Promise((resolve,reject)=>{
  const events=directory&&path.join(directory,'events.jsonl'),fd=events?fs.openSync(events,'w',0o600):'ignore';
  const child=spawn('codex',args,{cwd:directory,stdio:[prompt?'pipe':'ignore',fd,'ignore'],env:process.env});if(typeof fd==='number')fs.closeSync(fd);
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Codex 调用超时'));},timeout);
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);let usage=null;if(events&&fs.existsSync(events)&&fs.statSync(events).size<=8_000_000)usage=codexUsage(fs.readFileSync(events,'utf8'));resolve(events?{code,usage}:code);});
  if(prompt){child.stdin.on('error',()=>{});child.stdin.end(prompt);}
});}
export function createCodexServer(key,run=execute){
let busy=false;
return http.createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(req.method!=='POST'||req.url!=='/rpc'||req.headers.origin||req.headers.authorization!==`Bearer ${key}`)return send(403,{error:'Access denied'});
  if(req.headers['content-type']?.split(';')[0]!=='application/json')return send(415,{error:'JSON required'});
  try {
    const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>160000)return send(413,{error:'Input too large'});chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks));
    if(body.operation==='status'){const ready=await run(['login','status'],null,10000)===0;return send(200,{ready,message:ready?'Codex CLI 已登录':'Codex 尚未登录，请通过安装 Skill 完成设备登录'});}
    if(body.operation!=='generate'||typeof body.instructions!=='string'||body.instructions.length>10000||typeof body.prompt!=='string'||body.prompt.length>120000)return send(422,{error:'Invalid input'});
    if(body.output_format!=null&&!['replicate_v1','reply_v1','news_v1'].includes(body.output_format))return send(422,{error:'Invalid output format'});
    if(busy)return send(409,{error:'Model busy'});busy=true;
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'onhold-codex-'));fs.chmodSync(directory,0o700);
    try {
      const output=path.join(directory,'response.txt');
      const args=['exec','--json','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--ignore-user-config','--ignore-rules','--disable','shell_tool','--disable','unified_exec','-c',body.output_format==='news_v1'?'web_search="live"':'web_search="disabled"','--color','never','--output-last-message',output,'-'];
      if(body.output_format)args.push('--output-schema',fileURLToPath(new URL(body.output_format==='news_v1'?'../lib/news-schema.json':body.output_format==='reply_v1'?'../lib/reply-schema.json':'../lib/replicate-schema.json',import.meta.url)));
      if(body.model){if(typeof body.model!=='string'||body.model.length>120)return send(422,{error:'Invalid model'});args.push('--model',body.model);}
      const outcome=await run(args,body.instructions+'\n\n'+body.prompt,120000,directory),usage=normalizeUsage(outcome?.usage);
      if((typeof outcome==='number'?outcome:outcome.code)!==0)return send(422,{error:'Codex 执行失败，请检查登录及模型权限',usage});
      if(fs.statSync(output).size>64000)throw Error('Codex 正文过长');
      const text=fs.readFileSync(output,'utf8');if(!text.trim())throw Error('Codex 正文为空');
      const events=path.join(directory,'events.jsonl');let searched=false;
      if(body.output_format==='news_v1'&&fs.existsSync(events)&&fs.statSync(events).size<=8_000_000)searched=fs.readFileSync(events,'utf8').split('\n').some(line=>{try{const event=JSON.parse(line);return event.type==='item.completed'&&['web_search','web_search_call'].includes(event.item?.type);}catch{return false;}});
      if(body.output_format==='news_v1'&&!searched)return send(422,{error:'未确认实际新闻搜索，未发布',usage});
      send(200,{text,usage,...(body.output_format==='news_v1'?{searched}:{})});
    }finally{fs.rmSync(directory,{recursive:true,force:true});busy=false;}
  }catch(error){send(422,{error:error.message});}
});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const server=createCodexServer(fs.readFileSync('/secrets/backend-key','utf8').trim());
  server.listen(18432,'0.0.0.0',()=>console.log('[Codex 服务就绪] 需要用户自行完成设备登录'));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}

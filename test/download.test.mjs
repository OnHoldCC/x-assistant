import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {createHash} from 'node:crypto';import {download} from '../bin/cli.mjs';
test('interrupted downloads resume their verified file and completed partial files avoid redownloading',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'onhold download ')),payload=Buffer.alloc(65536,42),ranges=[];
 const server=http.createServer((req,res)=>{ranges.push(req.headers.range);const start=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]||0);res.writeHead(start?206:200,{'Content-Length':payload.length-start,...(start?{'Content-Range':`bytes ${start}-${payload.length-1}/${payload.length}`}:{})});if(ranges.length===1){res.flushHeaders();res.write(payload.subarray(0,32768));setTimeout(()=>res.destroy(),30);}else res.end(payload.subarray(start));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const asset={name:'fixture.bin',size:payload.length,sha256:createHash('sha256').update(payload).digest('hex'),url:`http://127.0.0.1:${server.address().port}/fixture`};
  const file=await download(asset,root);assert.deepEqual(fs.readFileSync(file),payload);assert.ok(ranges.some(value=>value==='bytes=32768-'));
  fs.renameSync(file,file+'.part');const requests=ranges.length;await download(asset,root);assert.equal(ranges.length,requests);assert.equal(fs.existsSync(file+'.part'),false);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

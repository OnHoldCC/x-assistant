import test from 'node:test';
import assert from 'node:assert/strict';
import {jobProgress} from '../app/src/shared/job-progress.ts';
import {jobLabel,jobMessage} from '../app/src/views/onhold/format.ts';
const job=(value)=>({id:'fixture',account:'owner',action:'rewrite_publish',state:'queued',created_at:1,updated_at:1,error:null,...value});
test('publication progress follows validated stages and requires an owner-matching receipt',()=>{
  assert.equal(jobProgress(job({input:{mode:'replicate',stage:'rewrite'}})).value,0);
  const generating=jobProgress(job({state:'rewriting',input:{mode:'replicate',stage:'rewrite'}}));assert.equal(generating.value,null);assert.match(generating.text,/Codex 分析原帖/);
  assert.equal(jobProgress(job({input:{mode:'replicate',stage:'ready'}})).value,2);
  assert.equal(jobProgress(job({state:'running',input:{stage:'sending'}})).value,3);
  const failed=jobProgress(job({state:'failed',input:{stage:'sending'}}));assert.equal(failed.value,3);assert.match(failed.text,/不会自动重发/);
  assert.equal(jobProgress(job({state:'completed',result:{url:'https://x.com/owner/status/123'}})).value,4);
  assert.equal(jobProgress(job({state:'completed',result:{url:'https://x.com/other/status/123'}})).value,3);
});
test('automation progress counts actual unique receipts, skips and partial termination',()=>{
  const input={targets:['alice','bob','carol'],limit:5};
  const running=jobProgress(job({action:'follow_back',state:'running',input,result:{completed:['alice','alice']}}));assert.equal(running.max,3);assert.equal(running.value,1);assert.match(running.text,/成功 1/);
  const ended=jobProgress(job({action:'unfollow',state:'completed',input,result:{completed:['alice'],skipped:['alice','bob']}}));assert.equal(ended.value,2);assert.equal(ended.max,3);assert.match(ended.text,/剩余 1 未处理/);
  const failed=jobProgress(job({action:'follow_back',state:'failed',input,result:{completed:['alice']}}));assert.equal(failed.value,1);assert.match(failed.text,/已停止/);
  assert.equal(jobProgress(job({action:'capture',state:'running'})).value,null);
});
test('For You progress uses actual child outcomes and reply receipts require the target post',()=>{
 const parent=job({action:'capture_for_you',state:'completed',result:{reply_progress:{total:3,completed:1,failed:1}}});
 assert.deepEqual(jobProgress(parent),{value:2,max:3,text:'本轮 2/3 · 已回复 1 · 失败 1'});
 const reply=job({state:'completed',input:{mode:'reply',source:{id:'101'}},result:{url:'https://x.com/owner/status/999',reply_to:'101'}});
 assert.equal(jobProgress(reply).value,4);reply.result.reply_to='102';assert.equal(jobProgress(reply).value,3);
});
test('news skips are distinct from sent posts and generation errors retain their cause',()=>{
 const skipped=jobProgress(job({state:'completed',input:{mode:'news',stage:'skipped'},result:{sent:false,skip_reason:'未找到可核实的新新闻，本轮未发布'}}));
 assert.equal(skipped.value,0);assert.match(skipped.text,/本轮跳过/);assert.doesNotMatch(skipped.text,/已确认发布/);
 assert.equal(jobProgress(job({state:'failed',input:{mode:'news'},error:'来源不可访问'})).text,'来源不可访问');
 const record=job({state:'completed',input:{mode:'news',stage:'skipped'},result:{sent:false,skip_reason:'没有候选新闻'}});
 assert.equal(jobLabel(record),'本轮跳过');assert.equal(jobMessage(record),'没有候选新闻');
});

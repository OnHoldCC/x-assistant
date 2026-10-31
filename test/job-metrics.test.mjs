import test from 'node:test';import assert from 'node:assert/strict';
import {jobMetrics,duration} from '../app/src/shared/job-metrics.ts';
import {codexUsage} from '../lib/codex-usage.mjs';
import {parseNotificationReplies} from '../extension/notifications.js';
const job={id:'x',account:'owner',action:'rewrite_publish',state:'completed',created_at:1000,updated_at:11000,error:null};
test('execution metrics preserve unknown historical usage and never double-count cached input',()=>{
 assert.equal(jobMetrics(job).total_tokens,null);assert.equal(jobMetrics(job).generation_ms,null);assert.equal(jobMetrics(job).total_ms,10000);
 const run={started_at:2000,finished_at:5000,duration_ms:3000,usage:{input_tokens:100,output_tokens:20,cached_input_tokens:60,total_tokens:120}};
 const input={telemetry:{send_started_at:10000,generations:[run]}};let metrics=jobMetrics({...job,input});assert.equal(metrics.total_tokens,120);assert.equal(metrics.send_ms,1000);assert.equal(metrics.cached_input_tokens,60);assert.equal(jobMetrics({...job,input:{telemetry:{generations:[run,run]}}}).total_tokens,240);
 input.telemetry.generations.push({...run,usage:null});metrics=jobMetrics({...job,input});assert.equal(metrics.total_tokens,null);assert.equal(metrics.known_tokens,120);assert.equal(metrics.missing,1);assert.equal(metrics.generation_ms,6000);
 assert.equal(duration(null),'未记录');assert.equal(duration(3000),'3 秒');
});
test('Codex JSONL usage sums completed turns, ignores model text and keeps missing values unknown',()=>{
 const first=JSON.stringify({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:60,output_tokens:20}}),second=JSON.stringify({type:'turn.completed',usage:{input_tokens:200,cached_input_tokens:100,output_tokens:30}});
 assert.deepEqual(codexUsage(first+'\n'+second),{input_tokens:300,cached_input_tokens:160,output_tokens:50,total_tokens:350});
 assert.equal(codexUsage(JSON.stringify({type:'item.completed',item:{text:'{"usage":{"input_tokens":999}}'}})),null);
 assert.equal(codexUsage('{invalid}\n'),null);assert.equal(codexUsage(JSON.stringify({type:'turn.completed',usage:{input_tokens:-1,output_tokens:1}})),null);
 assert.equal(codexUsage(first+'\n'+JSON.stringify({type:'turn.completed',usage:{input_tokens:5,output_tokens:1}})).cached_input_tokens,null);
});
test('notification collector accepts only replies to the current account, excluding mentions, own messages and truncation',()=>{
 const tweet=(id,uid='99',parent='123',author='2')=>({id_str:id,user_id_str:author,in_reply_to_user_id_str:uid,in_reply_to_status_id_str:parent,full_text:'这个功能什么时候上线？',truncated:false});
 const payload={timeline:{instructions:[{entries:['101','102','103','104','105'].map(id=>({entryId:'tweet-'+id}))}]},globalObjects:{users:{2:{id_str:'2',screen_name:'Writer'},99:{id_str:'99',screen_name:'owner'}},tweets:{a:tweet('101'),b:tweet('102','88'),c:tweet('103',null,null),d:tweet('104','99','123','99'),e:{...tweet('105'),truncated:true}}}};
 const parsed=parseNotificationReplies(payload,'owner','99');assert.equal(parsed.length,1);assert.equal(parsed[0].id,'101');assert.equal(parsed[0].in_reply_to_user_id,'99');
 const graphql={timeline:{instructions:[{entries:[{entryId:'tweet-201'}]}]},data:{result:{rest_id:'201',legacy:tweet('201'),core:{user_results:{result:{rest_id:'2',core:{screen_name:'Writer'}}}}}}};assert.equal(parseNotificationReplies(graphql,'owner','99')[0].author,'writer');
 assert.throws(()=>parseNotificationReplies(payload,'owner','legacy:owner'),/标识/);
});

test('a verified non-call is zero usage while legacy missing telemetry remains unknown',()=>{
 const metrics=jobMetrics({...job,input:{model_not_called:true}});
 assert.equal(metrics.attempts,0);assert.equal(metrics.total_tokens,0);assert.equal(metrics.generation_ms,0);
 assert.equal(metrics.input_tokens,0);assert.equal(metrics.output_tokens,0);assert.equal(metrics.cached_input_tokens,0);
 assert.equal(jobMetrics(job).total_tokens,null);
 const actual={duration_ms:10,usage:null};
 assert.equal(jobMetrics({...job,input:{model_not_called:true,telemetry:{generations:[actual]}}}).total_tokens,null,'real missing usage cannot be hidden by a zero-call flag');
});

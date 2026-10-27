import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDecisionRequest} from '../lib/decisions.mjs';
test('decision API supports Choice, Score and Noul with bounded schemas',()=>{
 const body={model:'multilingual',state:'A useful original post',questions:{n:{type:'noul',instructions:'Is this useful?'},c:{type:'choice',instructions:'Which version is clearer?',criteria:{A:'original',B:'revised'}},s:{type:'score',instructions:'Rate clarity',criteria:['unclear','partly clear','clear']}}};
 assert.equal(validateDecisionRequest(body).max_len,1536);
 for(const questions of [{s:{type:'score',instructions:'Rate',criteria:['only one']}},{c:{type:'choice',instructions:'Pick',criteria:['A','B']}},{x:{type:'publish',instructions:'Post'}},[],null])assert.throws(()=>validateDecisionRequest({...body,questions}));
 assert.throws(()=>validateDecisionRequest({...body,state:'a'.repeat(2001)}));
});

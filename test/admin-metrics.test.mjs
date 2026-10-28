import test from 'node:test';
import assert from 'node:assert/strict';
import {interactionMetrics,summarizePosts} from '../app/src/shared/metrics.ts';
test('public interaction rates use the displayed view denominator, preserve missing data and mark approximations',()=>{
 const count=(value,approximate=false)=>({value,approximate,observed_at:1});const result=interactionMetrics({views:count(566000,true),replies:count(290),likes:count(390),reposts:count(15)});
 assert.equal(result.weightedRate.toFixed(2),'0.30');assert.equal(result.commentRate.toFixed(3),'0.051');assert.equal(result.approximate,true);
 assert.equal(interactionMetrics({views:count(0),replies:count(3)}).commentRate,null);assert.equal(interactionMetrics({views:count(1000),likes:count(0)}).weightedRate,null);assert.equal(interactionMetrics({views:count(1000),replies:count(0)}).commentRate,0);
});
test('review summary compares matched observations and keeps missing data out of the denominator',()=>{
 const count=(value,at=1,approximate=false)=>({value,observed_at:at,approximate});
 const posts=[{metrics:{views:count(100,1,true),replies:count(10)}},{metrics:{views:count(900,2),replies:count(90,1)}},{metrics:{views:count(null),replies:count(5)}},{metrics:{views:count(0),replies:count(0)}}];
 assert.deepEqual(summarizePosts(posts),{commentRate:10,comparable:2,approximate:true,knownViews:3});
 assert.equal(summarizePosts([]).commentRate,null);
});

test('rates reject mixed or unknown observations rather than inventing comparable results',()=>{
 const value=(value,at)=>({value,observed_at:at,approximate:false});
 assert.equal(interactionMetrics({views:value(100,1),replies:value(20,2)}).commentRate,null);
 assert.equal(interactionMetrics({views:value(100,null),replies:value(20,null)}).commentRate,null);
 assert.equal(interactionMetrics({views:value(100,1),replies:value(20,1),likes:value(10,1),reposts:value(1,2)}).weightedRate,null);
 assert.equal(summarizePosts([{metrics:{views:value(100,null),replies:value(20,null)}}]).comparable,0);
});

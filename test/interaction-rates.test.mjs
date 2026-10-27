import test from 'node:test';import assert from 'node:assert/strict';import '../extension/metrics-core.js';
test('reference weighted rate uses complete observed counts, propagates estimates and is not clamped to a probability',()=>{
 const rate=globalThis.XAIMetrics.interactionRates;
 assert.deepEqual(rate({views:100,likes:10,replies:2,reposts:1}),{visible:13,weighted:17.6,approximate:false});
 assert.equal(rate({impressions:{value:19800,approximate:true},likes:192,replies:123,reposts:5}).approximate,true);
 assert.equal(rate({views:0,likes:0,replies:0,reposts:0}).weighted,null);assert.equal(rate({views:100,likes:1,replies:2}).weighted,null);
 assert.equal(rate({views:1,likes:0,replies:1,reposts:0}).weighted,500);
});

test('creator overview hides graduated progress and gates monetary estimates on eligibility and explicit calibration',()=>{
 const outlook=XAIMetrics.creatorOutlook,creator={verified_followers:{current:{value:447},target:500},verified_impressions:{current:{value:227},target:500000}};
 const current=outlook(creator,null);assert.equal(current.graduated,false);assert.equal(current.progress,227/500000*100);assert.equal(current.amount,0);
 const graduate={verified_followers:{current:{value:500},target:500},verified_impressions:{current:{value:500000},target:500000},state:'enrolled'};
 assert.equal(outlook(graduate,null).graduated,true);assert.equal(outlook(graduate,null).amount,null);assert.equal(outlook(graduate,{qualified30:50000,rpmCny:2}).amount,100);
 assert.equal(outlook(graduate,{qualified30:0,rpmCny:2}).amount,0);assert.equal(outlook(graduate,{qualified30:-1,rpmCny:2}).amount,null);assert.equal(outlook(null,null).amount,null);
 assert.equal(outlook({...graduate,state:'ineligible'},{qualified30:50000,rpmCny:2}).amount,0);
});

test('operating rates use aligned Analytics counts and keep missing data unknown',()=>{
 const rates=XAIMetrics.operatingRates;assert.deepEqual(rates({impressions:{value:1000},profile_visits:{value:10},engagements:{value:20}}),{profileVisitRate:1,engagementsPer1000:20,profileVisitsPer1000:10,approximate:false});assert.equal(rates({impressions:{value:1000}}).profileVisitRate,null);assert.equal(rates({impressions:{value:0},profile_visits:{value:0}}).profileVisitRate,null);assert.equal(rates({impressions:{value:1000},profile_visits:{value:0}}).profileVisitRate,0);
});

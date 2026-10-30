import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnalyticsCsv} from '../extension/analytics-export.js';
import {analyticsChartData,creatorOutlook,unsettledRewardEstimate} from '../app/src/shared/metrics.ts';
const header='Date,Impressions,Likes,Engagements,Bookmarks,Shares,New follows,Unfollows,Replies,Reposts,Profile visits,Create Post,Video views,Media views';
const csv=header+'\r\n"Wed, Oct 28, 2026",100,0,10,0,0,2,5,3,0,4,1,0,0\r\n"Tue, Oct 27, 2026",200,7,20,1,0,6,1,4,1,8,2,0,0\r\n';
test('official CSV preserves calendar dates, exact zero counts, net follows and source rate denominators',()=>{
 const data=parseAnalyticsCsv(csv);assert.equal(data[0].date,'2026-10-27');assert.equal(data[1].metrics.likes,0);assert.equal(data[1].metrics.net_follows,-3);assert.equal(data[1].metrics.engagement_rate,10);
 const weekly=analyticsChartData(data,'week');assert.equal(weekly.length,1);assert.equal(weekly[0].metrics.impressions,300);assert.equal(weekly[0].metrics.engagement_rate,10);assert.equal(weekly[0].metrics.net_follows,2);
 const missing=parseAnalyticsCsv(csv.replace(',100,0,10,',',100,,10,'));assert.equal(missing[1].metrics.likes,null);assert.equal(analyticsChartData(missing,'week')[0].metrics.likes,null);
});
test('CSV rejects invalid dates, duplicate dates, negative counts, ragged rows and quote tricks',()=>{
 for(const value of [csv.replace('Wed, Oct 28, 2026','Wed, Oct 99, 2026'),csv.replace('Wed, Oct 28, 2026','Tue, Oct 27, 2026'),csv.replace(',100,0,10,',',-100,0,10,'),csv+'2026-10-26,1\n',csv+'"bad"x,1\n'])assert.throws(()=>parseAnalyticsCsv(value));
 assert.equal(parseAnalyticsCsv('\uFEFF'+csv).length,2);
});
test('creator estimates never use total Analytics impressions or the 90-day qualification count',()=>{
 const creator={account:'example',state:'ineligible',verified_followers:{current:{value:492},target:500},verified_impressions:{current:{value:291},target:500000,days:90}};
 assert.equal(creatorOutlook(creator,{qualified30:100000,rpmCny:3}).amount,0);
 assert.equal(creatorOutlook({account:'example',state:'enrolled'},null).amount,null);
 assert.equal(creatorOutlook({account:'example',state:'enrolled'},{qualified30:100000,rpmCny:3}).amount,300);
});

test('Analytics reward estimates use same-basis historical calibration, preserve zeros and reject missing data',async()=>{
 const {analyticsRewardEstimate}=await import('../app/src/shared/metrics.ts');
 const calibration={payout:20,currency:'USD',impressions:1000,start_date:'2026-10-01',end_date:'2026-10-14',period:'2W',verified_only:false,observed_at:1};
 const summary={account:'example',snapshot:{data:{account:'example',state:'enrolled'},source:'x',observed_at:1},assumptions:null,calibration};
 const snap={data:{series:[{date:'2026-10-15',metrics:{impressions:500}},{date:'2026-10-16',metrics:{impressions:0}}]},source:'x',observed_at:2};
 assert.equal(analyticsRewardEstimate(snap,summary).amount,10);
 assert.equal(analyticsRewardEstimate(snap,{...summary,calibration:{...calibration,payout:0}}).amount,0);
 assert.equal(analyticsRewardEstimate({...snap,data:{...snap.data,verified_only:true}},summary).amount,null);
 assert.equal(analyticsRewardEstimate({...snap,data:{series:[{date:'2026-10-15',metrics:{impressions:null}}]}},summary).amount,null);
 assert.equal(analyticsRewardEstimate(snap,{...summary,calibration:null}).amount,null);
 assert.equal(analyticsRewardEstimate(snap,{...summary,snapshot:{...summary.snapshot,data:{account:'example',state:'ineligible'}}}).amount,0);
});

test('unsettled rewards exclude the paid period, merge exports once and disclose missing days',()=>{
 const summary={calibration:{payout:20,currency:'USD',impressions:1000,start_date:'2026-10-01',end_date:'2026-10-14',verified_only:false}};
 const snapshot=(at,rows,verified_only=false)=>({observed_at:at,data:{verified_only,series:rows.map(([date,impressions])=>({date,metrics:{impressions}}))}});
 const snapshots={month:snapshot(1,[['2026-10-14',999],['2026-10-15',100],['2026-10-16',100]]),week:snapshot(2,[['2026-10-16',200],['2026-10-17',0],['2026-10-18',999]])};
 let result=unsettledRewardEstimate(snapshots,summary,'2026-10-17');
 assert.equal(result.amount,6);assert.equal(result.start,'2026-10-15');assert.equal(result.through,'2026-10-17');
 result=unsettledRewardEstimate({month:snapshots.month},summary,'2026-10-17');
 assert.equal(result.amount,4);assert.equal(result.through,'2026-10-16');assert.match(result.reason,/今日数据/);
 assert.equal(unsettledRewardEstimate({week:snapshots.week},summary,'2026-10-17').amount,null);
 assert.equal(unsettledRewardEstimate({only:snapshot(3,[['2026-10-15',50]],true)},summary,'2026-10-16').amount,null);
 assert.equal(unsettledRewardEstimate({only:snapshot(3,[['2026-10-15',null]])},summary,'2026-10-15').amount,null);
 assert.equal(unsettledRewardEstimate(snapshots,null,'2026-10-17').amount,null);
 assert.equal(unsettledRewardEstimate(snapshots,{calibration:{...summary.calibration,payout:0}},'2026-10-17').amount,0);
 assert.equal(unsettledRewardEstimate(snapshots,summary,'2026-10-13').amount,null);
});

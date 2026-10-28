import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnalyticsCsv} from '../extension/analytics-export.js';
import {analyticsChartData,creatorOutlook} from '../app/src/shared/metrics.ts';
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

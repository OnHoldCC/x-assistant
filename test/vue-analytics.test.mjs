import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsModel,metricText} from '../app/src/views/onhold/analytics-chart.ts';
import {jobLabel,jobMessage,safeResultUrl} from '../app/src/views/onhold/format.ts';
const snapshot={data:{period_key:'7d',metrics:{new_follows:{value:5},unfollows:{value:2}},series:[{date:'2026-10-23',metrics:{impressions:100,likes:0,replies:null}},{date:'2026-10-24',metrics:{impressions:300,likes:0,replies:4}},{date:'2026-10-25',metrics:{impressions:150,likes:0,replies:null}}]},observed_at:1,source:'x'};
test('Vue chart keeps reference normalization, actual values, gaps and real zeroes without mutating snapshots',()=>{
 const data={analytics:snapshot,analytics_periods:{'7d':snapshot}},before=structuredClone(data),all=analyticsModel(data,'7d','day',null);
 assert.equal(all.values[0].impressions,100/300*100);assert.equal(all.values[1].impressions,100);assert.deepEqual(all.values.map(p=>p.likes),[0,0,0]);assert.deepEqual(all.values.map(p=>p.replies),[null,100,null]);assert.equal(all.counts.net_follows.value,3);
 const single=analyticsModel(data,'7d','day','impressions');assert.deepEqual(single.values.map(p=>p.impressions),[100,300,150]);assert.deepEqual(single.shown.map(p=>p[0]),['impressions']);assert.deepEqual(data,before);
 assert.equal(analyticsModel(data,'90d','day',null).series.length,0,'another period never reuses the 7-day snapshot');assert.equal(metricText(null,'impressions','USD'),'未采集');assert.equal(metricText(0,'engagement_rate','USD'),'0%');
});
test('Vue task labels preserve draft state and failed sends remain explicit rather than retryable receipts',()=>{
 const job={action:'rewrite_publish',state:'queued',input:{stage:'ready',mode:'similar'},error:null};assert.equal(jobLabel(job),'待设置时间');assert.match(jobMessage(job),/可复制或安排发布/);
 assert.equal(safeResultUrl('https://x.com/example/status/123'),true);for(const url of ['javascript:alert(1)','https://evil.example/status/123','https://x.com/example/status/123?redirect=evil'])assert.equal(safeResultUrl(url),false);
});

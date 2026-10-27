'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildGoogleSnapshot,summarizeGsc,dateWindow}=require('../src/ai/growth/gscService');
const startDate='2026-10-18',endDate='2026-10-19';
const row=(key,clicks,impressions,position)=>({keys:[key],clicks,impressions,
 ctr:impressions?clicks/impressions:0,position});
function fixture(){return {
 daily:{rows:[row(startDate,10,100,4),row(endDate,20,200,6)]},
 queries:{rows:[row('holder distribution',2,150,8),row('wallet holder map',5,200,4)]},
 pages:{rows:[row('https://logearn.com/holders',8,240,4)]}
}}
test('real GSC daily property totals are independent of query and page top-row subsets',()=>{
 const raw=buildGoogleSnapshot('sc-domain:logearn.com',{startDate,endDate},fixture());
 const report=summarizeGsc({id:'snapshot',fetched_at:1234,...raw});
 assert.equal(report.source,'gsc-api');assert.equal(report.dataState,'final');
 assert.equal(report.metrics.clicks,30);assert.equal(report.metrics.impressions,300);
 assert.equal(report.metrics.ctr,0.1);
 assert.equal(report.metrics.position,(100*4+200*6)/300);
 assert.equal(report.queries.reduce((n,r)=>n+r.impressions,0),350);
 assert.equal(report.coverage.reportedDays,2);
 assert.equal(report.coverage.queryRowsReturned,2);
 assert.equal(report.coverage.googleApiVerifiedForServiceIdentity,true);
 assert.equal(report.opportunities.length,1);
 assert.equal(report.opportunities[0].query,'holder distribution');
 assert.ok(report.warnings.some(w=>w.includes('不能')));
});
test('missing finalized daily rows remain incomplete, never a verified zero',()=>{
 const raw=buildGoogleSnapshot('sc-domain:logearn.com',{startDate,endDate},{
  daily:{rows:[]},queries:{rows:[]},pages:{rows:[]}
 });
 assert.equal(raw.property_totals.clicks,null);
 assert.equal(raw.property_totals.impressions,null);
 assert.equal(raw.coverage.reportedDays,0);
 assert.equal(raw.coverage.unreportedDates.length,2);
 const one=buildGoogleSnapshot('sc-domain:logearn.com',{startDate,endDate},{
  ...fixture(),daily:{rows:[row(startDate,2,20,4)]}
 });
 assert.equal(one.coverage.status,'incomplete-or-zero-traffic-days');
 assert.deepEqual(one.coverage.unreportedDates,[endDate]);
});
test('date range, corrupt GSC metrics and oversized remote responses fail closed',()=>{
 const time=Date.parse('2026-10-27T00:00:00Z');
 assert.deepEqual(dateWindow(startDate,endDate,time),{startDate,endDate});
 assert.throws(()=>dateWindow('2026-10-26','2026-10-26',time),/早于今天2天/);
 assert.throws(()=>dateWindow('2026-09-01','2026-10-19',time),/31天/);
 assert.throws(()=>dateWindow('2026-02-30','2026-02-30',time),/日期/);
 const wrong=fixture();wrong.queries.rows[0].ctr=3;
 assert.throws(()=>buildGoogleSnapshot('sc-domain:logearn.com',{startDate,endDate},wrong),/无效/);
 const huge=fixture();huge.queries.rows=Array(501).fill(row('same',1,2,5));
 assert.throws(()=>buildGoogleSnapshot('sc-domain:logearn.com',{startDate,endDate},huge),/预算/);
});

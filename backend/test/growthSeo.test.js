'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateImport,summarizeSeo}=require('../src/ai/growth/seoStore');
const rows=[
 {date:'2026-10-20',query:'holder distribution',page:'https://logearn.com/holders',
  country:'USA',device:'DESKTOP',clicks:4,impressions:200,position:7.2,ctr:0.02},
 {date:'2026-10-21',query:'holder distribution',page:'https://logearn.com/holders',
  country:'USA',device:'DESKTOP',clicks:2,impressions:100,position:8.1,ctr:0.02},
 {date:'2026-10-21',query:'meme analytics',page:'https://logearn.com/learn',
  country:'USA',device:'MOBILE',clicks:20,impressions:100,position:2.1,ctr:0.2}
];
const input={siteUrl:'https://logearn.com/',startDate:'2026-10-20',
 endDate:'2026-10-21',source:'gsc-manual-export',rows};
test('GSC import accepts bounded genuine query-page-date rows and canonicalizes order',()=>{
 const before=JSON.stringify(input),actual=validateImport({...input,rows:[...rows].reverse()});
 const stable=validateImport(input);
 assert.deepEqual(actual,stable);
 assert.equal(actual.coverage,'export-limited');
 assert.equal(actual.rows.length,3);
 assert.equal(JSON.stringify(input),before);
});
test('GSC opportunity diagnosis is observation-only and never asserts entire-site traffic or causal registrations',()=>{
 const data=validateImport(input);
 const s={id:'gsc-snapshot',site_url:data.siteUrl,
  start_date:data.startDate,end_date:data.endDate,
  row_count:data.rows.length,rows:data.rows,imported_at:123};
 const result=summarizeSeo(s);
 assert.equal(result.metrics.clicks,26);
 assert.equal(result.metrics.impressions,400);
 assert.equal(result.opportunities.length,1);
 assert.equal(result.opportunities[0].query,'holder distribution');
 assert.equal(result.opportunities[0].clicks,6);
 assert.equal(result.opportunities[0].impressions,300);
 assert.equal(result.coverage.completeSearchTraffic,false);
 assert.equal(result.coverage.verifiedWithGoogleApi,false);
 assert.ok(result.warnings.some(w=>w.includes('不能据此直接声称')));
 const day=summarizeSeo(s,{startDate:'2026-10-21'});
 assert.equal(day.metrics.clicks,22);assert.equal(day.metrics.impressions,200);
 assert.throws(()=>summarizeSeo(s,{startDate:'2026-10-19'}),/超出/);
});
test('GSC import fails closed for invalid page origin, CTR, unknown dates and repeated dimension rows',()=>{
 const check=(overrides)=>validateImport({...input,...overrides});
 assert.throws(()=>check({rows:[{...rows[0],page:'https://elsewhere.test/holders'}]}),/页面必须属于/);
 assert.throws(()=>check({rows:[{...rows[0],ctr:0.9}]}),/CTR/);
 assert.throws(()=>check({rows:[rows[0],{...rows[0]}]}),/重复维度/);
 assert.throws(()=>check({rows:[{...rows[0],clicks:201}]}),/点击/);
 assert.throws(()=>check({rows:[{...rows[0],date:'2026-10-22'}]}),/日期不在/);
 assert.throws(()=>check({siteUrl:'http://logearn.com/'}),/HTTPS/);
 assert.throws(()=>check({source:'fake-realtime-google-api'}),/真实 GSC/);
 assert.throws(()=>check({rows:[]}),/1-500/);
 assert.throws(()=>check({startDate:'2026-02-30'}),/日期无效/);
});

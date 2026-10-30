'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeGscWindow,createGscService}=require('../src/ai/growth/gscService');

const rows=Array.from({length:10},(_,i)=>{
 const date=new Date(Date.parse('2026-10-17T00:00:00Z')+i*86400000).toISOString().slice(0,10);
 return {date,clicks:i+1,impressions:(i+1)*10,ctr:.1,position:5};
});
const record={
 id:'stored-snapshot',site_url:'sc-domain:logearn.com',
 start_date:'2026-10-17',end_date:'2026-10-26',fetched_at:1793339000000,
 daily:rows,queries:[{query:'not scoped to week',clicks:100,impressions:1000,position:5}],
 pages:[{page:'https://logearn.com/',clicks:100,impressions:1000,position:5}],
 property_totals:{clicks:55,impressions:550,ctr:.1,position:5},
 coverage:{status:'reported-final-dates'}
};
const week={startDate:'2026-10-19',endDate:'2026-10-25'};

test('stored 10-day GSC snapshot supplies exact 7-day PT aggregate without resync',()=>{
 const out=summarizeGscWindow(record,week);
 assert.equal(out.metrics.clicks,42);
 assert.equal(out.metrics.impressions,420);
 assert.equal(out.metrics.ctr,.1);
 assert.equal(out.coverage.periodMatched,true);
 assert.equal(out.coverage.expectedDays,7);
 assert.equal(out.coverage.reportedDays,7);
 assert.equal(out.coverage.derivedFromStoredDaily,true);
 assert.deepEqual(out.queries,[]);
 assert.deepEqual(out.pages,[]);
 assert.deepEqual(out.opportunities,[]);
});

test('missing dates are partial, never a full-week zero or verified growth',()=>{
 const partial={...record,daily:rows.filter(r=>r.date!=='2026-10-22')};
 const out=summarizeGscWindow(partial,week);
 assert.equal(out.coverage.periodMatched,false);
 assert.deepEqual(out.coverage.unreportedDates,['2026-10-22']);
 assert.equal(out.metrics.clicks,36);
 const absent=summarizeGscWindow({...record,daily:[]},week);
 assert.equal(absent.available,false);
 assert.equal(absent.metrics.clicks,null);
 assert.equal(absent.metrics.impressions,null);
 assert.equal(absent.coverage.periodMatched,false);
});

test('overlapping snapshot lookup stays within owner and selected GSC property',async()=>{
 const calls=[];
 const db={query:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('ai_growth_gsc_settings'))
   return {rows:[{site_url:'sc-domain:logearn.com'}]};
  return {rows:[record]};
 }};
 const service=createGscService({db,client:{}});
 const out=await service.latestOverlapping('owner-1',week);
 assert.equal(out.id,record.id);
 assert.equal(calls.length,2);
 assert.match(calls[1].sql,/owner_id=\$1 AND site_url=\$2/);
 assert.match(calls[1].sql,/start_date<=\$4::date AND end_date>=\$3::date/);
 assert.deepEqual(calls[1].args,['owner-1','sc-domain:logearn.com',
  '2026-10-19','2026-10-25']);
 const outside=await service.latestOverlapping('owner-1',{
  ...week,siteUrl:'sc-domain:unrelated.com'
 });
 assert.equal(outside,null);
 assert.equal(calls.length,3);
});

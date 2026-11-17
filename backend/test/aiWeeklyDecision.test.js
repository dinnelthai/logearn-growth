'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {trustedWeeklyMetrics,ensureWeeklyReport}=require('../src/ai/growth/weeklyReport');
const {planGrowthInvestigation}=require('../src/ai/growth/planner');

const period={start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00'),
 previousStart:Date.parse('2026-10-12T00:00:00+07:00'),
 previousEnd:Date.parse('2026-10-19T00:00:00+07:00'),timezone:'Asia/Bangkok'};
const metric=(id,value,previous=false)=>({
 id:id+'-'+(previous?'prev':'now'),metricId:id,value,
 period:previous?{start:period.previousStart,end:period.previousEnd,timezone:period.timezone}:
  {start:period.start,end:period.end,timezone:period.timezone}
});
const context={period,evidence:[
 metric('active_users',71),metric('active_users',82,true),
 metric('new_users',18),metric('new_users',40,true),
 metric('returning_users',53),metric('returning_users',42,true)
],weeklySources:{seo:{status:'not-synced',periodMatched:false,evidenceIds:[]}}};
test('weekly business KPIs come from immutable period-matched evidence, not generated prose',()=>{
 const rows=trustedWeeklyMetrics(context);
 assert.equal(rows.length,3);
 assert.equal(rows.find(x=>x.metricId==='new_users').changePct,-55);
 assert.equal(rows.find(x=>x.metricId==='active_users').current,71);
 assert.equal(rows.find(x=>x.metricId==='active_users').previous,82);
 assert.deepEqual(rows.find(x=>x.metricId==='active_users').evidenceIds,
  ['active_users-now','active_users-prev']);
});
test('partial AI output retains valid KPI rows and clearly states absent SEO',()=>{
 const result=ensureWeeklyReport({summary:'周报已分析',claims:[],suggestions:[]},{context});
 assert.equal(result.partial,true);
 assert.equal(result.metrics.length,3);
 assert.ok(result.dataGaps.some(x=>x.includes('SEO')));
 assert.ok(result.channelFindings.length===0);
});
test('a mismatched evidence period cannot be silently used for current KPI',()=>{
 const changed={...context,evidence:context.evidence.map(e=>e.metricId==='new_users'&&
  e.id==='new_users-now'?{...e,period:{start:1,end:2}}:e)};
 const rows=trustedWeeklyMetrics(changed);
 const item=rows.find(x=>x.metricId==='new_users');
 assert.equal(item.current,null);
 assert.equal(item.previous,40);
 assert.equal(item.changePct,null);
});
test('SEO and retention are mandatory weekly skills, not privileged for regular activation',()=>{
 const report={business:{scope:{source:'all'}},period,snapshot:{id:'mock'},
  current:{totals:{active_users:71}},previous:{totals:{active_users:82}},
  candidates:[],growth:{channels:[]},warnings:[]};
 const weekly=planGrowthInvestigation({goal:'activation',report,
  maxSkills:12,includeWeeklySpecialties:true,availableSpecialties:['content-growth']});
 const ids=weekly.steps.map(x=>x.skillId);
 for(const required of ['seo-organic','channel-growth','activation-funnel','retention',
  'trade-conversion','content-growth'])assert.ok(ids.includes(required),required);
 assert.ok(weekly.steps.find(x=>x.skillId==='seo-organic').tools.includes('get_seo_performance'));
 const ordinary=planGrowthInvestigation({goal:'activation',report,maxSkills:3});
 assert.equal(ordinary.steps.some(x=>x.skillId==='seo-organic'),false);
});

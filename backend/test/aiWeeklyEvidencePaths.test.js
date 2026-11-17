'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateClaims}=require('../src/ai/business/evidence');
const {modelContext,statView}=require('../src/ai/business/modelTransport');
const {factsFromEvidence,DEFINITIONS}=require('../src/ai/growth/weeklyCoverage');

const period={
 start:Date.parse('2026-10-19T00:00:00+07:00'),
 end:Date.parse('2026-10-26T00:00:00+07:00'),
 previousStart:Date.parse('2026-10-12T00:00:00+07:00'),
 previousEnd:Date.parse('2026-10-19T00:00:00+07:00'),
 timezone:'Asia/Bangkok'
};
const channel={
 id:'channel-aggregate',metricId:'channels',period,
 value:statView({
  total:{users:200,new_users:80,analysis:110},
  groups:[{source:'direct',users:120,new_users:50,analysis:60},
   {source:'seo',users:60,new_users:25,analysis:30}],
  rows:[{user_id:'private-user',users:99999}]
 })
};
const funnel={id:'funnel-aggregate',metricId:'funnel',period,
 value:statView({total_entered:100,total_converted:42,
  steps:[{key:'visit',users:100,previous_conversion_rate:1,drop_off_users:30},
   {key:'chip',users:70,previous_conversion_rate:.7,drop_off_users:28},
   {key:'ai',users:42,previous_conversion_rate:.6,drop_off_users:0}]})
};
const metric={id:'active-aggregate',metricId:'active_users',value:71,period};
const records=[channel,funnel,metric];
const store={get:id=>{
 const row=records.find(x=>x.id===id);
 if(!row)throw Error('Unknown evidence');
 return row;
}};
const claim=(evidenceId,path,value)=>({
 id:'c3',kind:'fact',text:'引用已观测的统计数字',evidenceIds:[evidenceId],
 values:[{evidenceId,path,value}],uncertainties:[]
});

test('a weekly channel or funnel statistic validates by explicit aggregate path',()=>{
 assert.equal(validateClaims([
  claim(channel.id,'stats.groups.seo.new_users',25),
  claim(funnel.id,'stats.steps.ai.users',42),
  claim(metric.id,'value',71),
  claim(metric.id,'stats.active_users',71)
 ],{scope:{source:'all'}},store).length,4);
});

test('a wrong number, root scalar shortcut or private path never validates',()=>{
 for(const [id,path,value] of [
  [channel.id,'stats.groups.seo.new_users',26],
  [channel.id,'value',25],
  [channel.id,'value.rows.0.users',99999],
  [funnel.id,'stats.steps.chip.users',42],
  [metric.id,'value',0],
  [channel.id,'stats.groups.other.new_users',25]
 ])assert.throws(
  ()=>validateClaims([claim(id,path,value)],{scope:{source:'all'}},store),
  /字段|数值不匹配/
 );
});

test('weekly model context exposes same verified aggregate paths and stays bounded',()=>{
 const modules=DEFINITIONS.map(d=>({
  id:d.id,status:'not-investigated',evidenceIds:[],facts:[]
 }));
 for(const [id,ev] of [['channel-growth',channel],['activation-funnel',funnel]]){
  const row=modules.find(x=>x.id===id);
  row.status='collected';row.evidenceIds=[ev.id];row.facts=factsFromEvidence([ev]);
 }
 const report={period,business:{scope:{source:'all'},focusGoal:'activation'},
  snapshot:{asOf:'2026-10-29',historyComplete:false},
  current:{totals:{active_users:71}},previous:{totals:{active_users:82}},
  evidence:records,weeklyCoverage:{version:'weekly-coverage-v1',modules},
  capabilities:[]};
 const view=modelContext(report,{transportVersion:'v4'});
 const channelStats=view.weeklyCoverage.find(x=>x.id==='channel-growth').stats;
 const funnelStats=view.weeklyCoverage.find(x=>x.id==='activation-funnel').stats;
 assert.ok(channelStats.some(x=>x.path==='stats.groups.seo.new_users'&&x.value===25));
 assert.ok(funnelStats.some(x=>x.path==='stats.steps.ai.users'&&x.value===42));
 assert.ok(Buffer.byteLength(JSON.stringify(view),'utf8')<=22000);
 assert.doesNotMatch(JSON.stringify(view),/private-user|99999/);
});

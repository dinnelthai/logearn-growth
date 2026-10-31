'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {modelContext}=require('../src/ai/business/modelTransport');
const {factsFromValue}=require('../src/ai/business/weeklyContextV4');
const {DEFINITIONS}=require('../src/ai/growth/weeklyCoverage');
const period={start:1000000,end:1604800000,previousStart:-603800000,previousEnd:1000000,timezone:'Asia/Bangkok'};
const metric=(id,value,prior=false)=>({id:id+(prior?'-previous':'-current'),
 metricId:id,value,period:{start:prior?period.previousStart:period.start,
 end:prior?period.previousEnd:period.end},
 coverage:{status:'partial'}});
function fixture(){
 const current={new_users:18,active_users:71,returning_users:53};
 const previous={new_users:40,active_users:82,returning_users:42};
 const rows=Object.entries(current).flatMap(([id,value])=>[
  metric(id,value),metric(id,previous[id],true)]);
 const extra=DEFINITIONS.map((m,i)=>({
  id:'module-'+m.id,metricId:m.metric,
  value:m.id==='content-growth'?
   {contentSignals:{views:18000,posts:12,likes:144,replies:29},
    posts:[{text:'DO NOT SEND FULL X TWEET TEXT',userId:'private'}]}:
   m.id==='operations-timeline'?
    {counts:{human_operations_shown:4,channel_observations_shown:3,
      ai_actions_shown:2,total_records_shown:9},
     coverage:{growthActivities:{status:'available',count:12,limit:12,truncated:true}}}:
   {metrics:{clicks:10+i,impressions:110+i,ctr:.12},
    totals:{users:80+i,visits:300+i},rows:[{email:'private@example.test'}]},
  coverage:{status:'partial',periodMatched:true},
  period:{start:period.start,end:period.end}
 }));
 return {
  business:{scope:{source:'all'},focusGoal:'activation',question:'增长与获客周报'},
  period,snapshot:{asOf:'2026-10-29',historyComplete:false},
  current:{totals:current},previous:{totals:previous},
  evidence:[...rows,...extra],
  weeklyCoverage:{version:'weekly-coverage-v1',
   modules:DEFINITIONS.map((x,i)=>({id:x.id,status:'collected',
    evidenceIds:[extra[i].id],
    reason:x.id==='operations-timeline'?'部分来源达到读取上限，结果为有界样本':'已取得只读统计',
    facts:x.id==='operations-timeline'?[
     {metric:'counts.human_operations_shown',value:4},
     {metric:'counts.ai_actions_shown',value:2}
    ]:[]}))},
  weeklySources:{seo:{status:'period-matched',periodMatched:true,
   evidenceIds:['module-seo-organic']}},
  capabilities:DEFINITIONS.map((x,i)=>({
   id:x.tool,description:'通用的只读工具完整参数说明'.repeat(12),
   inputSchema:{properties:{scope:{type:'object'},
    start:{type:'integer'},end:{type:'integer'},
    limit:{type:'integer'},filters:{type:'object'}}}
  })),
  growthPlan:{steps:DEFINITIONS.map(x=>({skillId:x.id,
   instructions:'大量叙述不需要进入模型'.repeat(30)}))},
  definitions:Object.fromEntries(Array.from({length:20},(_,i)=>['key_'+i,'指标定义文字'.repeat(50)])),
  manualActions:[{text:'User private workspace action'}],
  memory:['previous advice message that should not be sent'],
  weeklyOperations:{goalsCount:4,executedActionCount:2}
 };
}
test('v4 makes observed KPIs and major decline first; all 13 modules remain visible',()=>{
 const view=modelContext(fixture(),{transportVersion:'v4'});
 assert.equal(view.transportVersion,'aggregated-business-v4');
 assert.equal(view.coreMetrics.find(m=>m.id==='new_users').changePct,-55);
 assert.equal(view.priorityIssues[0].metricId,'new_users');
 assert.equal(view.weeklyCoverage.length,13);
 assert.equal(view.weeklyCoverage.find(x=>x.id==='seo-organic').status,'collected');
 const operations=view.weeklyCoverage.find(x=>x.id==='operations-timeline');
 assert.ok(operations.stats.some(x=>x.metric==='counts.human_operations_shown'&&x.value===4));
 assert.match(operations.note,/有界样本/);
 assert.ok(view.evidence.some(e=>e.id==='module-seo-organic'));
 assert.ok(view.evidence.length>=12);
 assert.equal(view.capabilities.length,5);
 assert.ok(view.otherAvailableTools.length>0);
 assert.ok(Buffer.byteLength(JSON.stringify(view),'utf8')<14000);
});
test('a decline in first analysis promotes channel, funnel and login investigations',()=>{
 const view=modelContext(fixture(),{transportVersion:'v4'});
 assert.equal(view.investigationFocus.metricId,'new_users');
 assert.ok(view.investigationFocus.question.includes('首次分析人数下降'));
 const ids=view.capabilities.map(x=>x.id);
 assert.deepEqual(ids.slice(0,4),[
  'query_metrics','get_channels','get_funnel','get_login_conversion'
 ]);
 assert.ok(view.investigationFocus.candidateTools.includes('get_channels'));
 assert.ok(view.investigationFocus.candidateTools.includes('get_funnel'));
 assert.ok(view.investigationFocus.candidateTools.includes('get_login_conversion'));
});
test('X contribution only transfers numeric performance and never sends post text or PII',()=>{
 const view=modelContext(fixture(),{transportVersion:'v4'});
 const out=JSON.stringify(view);
 assert.equal(out.includes('DO NOT SEND FULL X TWEET TEXT'),false);
 assert.equal(out.includes('private@example.test'),false);
 assert.equal(out.includes('User private workspace action'),false);
 assert.equal(out.includes('previous advice message'),false);
 const content=view.weeklyCoverage.find(x=>x.id==='content-growth');
 assert.ok(content.stats.some(x=>x.metric.includes('views')&&x.value===18000));
});
test('missing KPI observations are not hallucinated evidence citations',()=>{
 const raw=fixture();
 raw.current.totals.new_users=null;
 raw.evidence=raw.evidence.filter(x=>x.metricId!=='new_users');
 const view=modelContext(raw,{transportVersion:'v4'});
 const row=view.coreMetrics.find(x=>x.id==='new_users');
 assert.equal(row.current,null);
 assert.equal(row.changePct,null);
 assert.deepEqual(row.evidenceIds,[]);
 assert.equal(view.priorityIssues.some(x=>x.metricId==='new_users'),false);
});
test('v5 adds LogEarn business knowledge and bounded reviewed operating memory',()=>{
 const raw=fixture();
 raw.memory=[
  {id:'m1',business_problem:'首次分析用户下降',action:'检查新用户激活漏斗',
   actual_action:'修复渠道落地页说明',result_summary:'复盘后仍未能证明因果',
   effectiveness:'unknown',user_status:'executed',
   validation_metrics:{primary:'new_users',secondary:['active_users']},
   applicable_scope:{source:'all'},executed_at:period.end,reviewed_at:period.end+1},
  {id:'m2',business_problem:'私有联系人 private@example.test',action:'发送消息 https://private.example.test',
   user_status:'rejected',rejection_reason:'不符合用户隐私要求'}
 ];
 const before=JSON.stringify(raw);
 const view=modelContext(raw,{transportVersion:'v5'});
 assert.equal(view.transportVersion,'aggregated-business-v5');
 assert.equal(view.businessBrain.version,'logearn-business-brain-v1');
 assert.equal(view.businessBrain.business.northStarIntent.status,
  'operator-direction-not-a-validated-composite-kpi');
 assert.ok(view.businessBrain.productMap.products.some(x=>x.id==='chip_distribution'));
 assert.ok(view.businessBrain.lifecycle.some(x=>x.id==='trading'));
 assert.ok(view.businessBrain.metricDictionary.some(x=>x.id==='registered_users'));
 assert.equal(view.operatingMemory.status,'available');
 assert.equal(view.operatingMemory.shown,2);
 assert.ok(view.operatingMemory.items.some(x=>x.effectiveness==='unknown'));
 assert.equal(JSON.stringify(view).includes('private@example.test'),false);
 assert.equal(JSON.stringify(view).includes('https://private.example.test'),false);
 assert.equal(JSON.stringify(view).includes('DO NOT SEND FULL X TWEET TEXT'),false);
 assert.equal(Buffer.byteLength(JSON.stringify(view),'utf8')<=22000,true);
 assert.equal(JSON.stringify(raw),before);
});
test('new v5 weekly prompt adds business-owner reasoning without changing v4 prompts',()=>{
 const {buildSystemPrompt}=require('../src/ai/business/runner');
 const old=buildSystemPrompt('weekly','v4');
 const next=buildSystemPrompt('weekly','v5');
 assert.ok(old.includes('token-efficiency-v4'));
 assert.equal(old.includes('Business Brain v1'),false);
 assert.ok(next.includes('token-efficiency-v5'));
 assert.ok(next.includes('Business Brain v1'));
 assert.ok(next.includes('operatingMemory'));
});
test('old v3 remains structurally distinct, v4 does not mutate archived source',()=>{
 const raw=fixture();
 const before=JSON.stringify(raw);
 const v4=modelContext(raw,{transportVersion:'v4'});
 const v3=modelContext(raw,{transportVersion:'v3'});
 assert.equal(JSON.stringify(raw),before);
 assert.equal(v3.transportVersion,'aggregated-business-v3');
 assert.equal(v4.transportVersion,'aggregated-business-v4');
 assert.equal(v3.coreMetrics,undefined);
});

test('weekly evidence projection preserves registration activation numerator, mature denominator and pending cohort',()=>{
 const facts=factsFromValue({cohorts:{registration:{available:true,metrics:{
  users:20,eligible:15,activated:9,pending:5,rate:.6
 }}}},10);
 assert.ok(facts.some(x=>x.metric==='registration_activation_rate'&&x.value===.6));
 assert.ok(facts.some(x=>x.metric==='registration_activation_activated'&&x.value===9));
 assert.ok(facts.some(x=>x.metric==='registration_activation_eligible'&&x.value===15));
 assert.ok(facts.some(x=>x.metric==='registration_pending'&&x.value===5));
 const tradeFacts=factsFromValue({cohorts:{registration:{trade:{
  available:true,conversion_rate:.25,traders:3,eligible:12,pending:4,unmatched:2
 }}}},10);
 assert.ok(tradeFacts.some(x=>x.metric==='registered_trade_conversion_rate'&&x.value===.25));
 assert.ok(tradeFacts.some(x=>x.metric==='registered_trade_eligible'&&x.value===12));
 assert.ok(tradeFacts.some(x=>x.metric==='registered_trade_pending'&&x.value===4));
});

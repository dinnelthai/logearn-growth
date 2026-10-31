'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const brain=require('../src/ai/business/businessBrain');
const {modelContext}=require('../src/ai/business/modelTransport');

const period={start:1000000,end:1600000,previousStart:400000,previousEnd:1000000,timezone:'Asia/Bangkok'};
function raw(){
 return {
  business:{scope:{source:'all'},focusGoal:'activation',question:'检查激活'},
  period,snapshot:{historyComplete:false},definitions:{},
  current:{totals:{new_users:18,active_users:71}},
  previous:{totals:{new_users:40,active_users:82}},
  growth:{},weekly:{},evidence:[],capabilities:[],candidates:[],warnings:[]
 };
}
test('Business Brain exposes the four LogEarn product roles and complete lifecycle',()=>{
 const value=brain.buildBusinessBrainContext({focusGoal:'activation'});
 assert.equal(value.version,'logearn-business-brain-v1');
 assert.deepEqual(value.productMap.products.map(x=>x.id),
  ['ai_strategy','chip_distribution','holder_ranking','wallet_trading']);
 assert.deepEqual(value.lifecycle.map(x=>x.id),
  ['acquisition','registration','activation','engagement','retention','trading','economics']);
 assert.equal(value.focus.goal,'activation');
 assert.ok(value.metricDictionary.some(x=>x.id==='registered_users'));
 assert.ok(value.metricDictionary.some(x=>x.id==='registration_activation_rate'));
 assert.ok(value.metricDictionary.some(x=>x.id==='registered_trade_conversion_rate'));
 assert.ok(value.metricDictionary.some(x=>x.id==='activities'));
 assert.equal(value.operatingModel.capability,'get_operations_timeline');
 assert.match(value.operatingModel.experimentRule,/不代表随机实验/);
 assert.match(value.operatingModel.activityOutcomeRules.join(' '),/未结算/);
 assert.deepEqual(value.operatingModel.layers.map(x=>x.id),
  ['human_operation','channel_observation','ai_suggestion_or_review']);
 assert.ok(value.lifecycle.find(x=>x.id==='registration').metricIds.includes('registration_activation_rate'));
 assert.ok(value.lifecycle.find(x=>x.id==='trading').metricIds.includes('registered_trade_conversion_rate'));
 assert.ok(value.metricDictionary.some(x=>x.id==='new_users'));
 assert.ok(value.operatingRules.some(x=>x.includes('相关性不等于因果')));
 assert.equal(value.business.northStarIntent.status,
  'operator-direction-not-a-validated-composite-kpi');
});
test('unknown focus goals fall back to activation without inventing a new goal',()=>{
 const value=brain.buildBusinessBrainContext({focusGoal:'invented-goal'});
 assert.equal(value.focus.goal,'activation');
});
test('operating memory is owner-scoped, bounded, and distinguishes executed from reviewed',()=>{
 const rows=Array.from({length:8},(_,i)=>({
  business_problem:'Problem '+i+' private@example.test',
  action:'Proposed '+i+' https://private.example.test',
  actual_action:'Actual '+i,user_status:i===0?'executed':'proposed',
  effectiveness:i===0?'unknown':null,
  validation_metrics:{primary:'new_users',secondary:['active_users','not-a-metric']},
  applicable_scope:{source:'all'},executed_at:period.start,reviewed_at:i===0?period.end:null
 }));
 const projected=brain.projectOperatingMemory(rows,{safeText:(value,max=260)=>
  String(value||'').slice(0,max).replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[hidden]')
   .replace(/https?:\/\/\S+/gi,'[hidden]')});
 assert.equal(projected.total,8);
 assert.equal(projected.shown,3);
 assert.equal(projected.items[0].status,'executed');
 assert.equal(projected.items[0].effectiveness,'unknown');
 assert.deepEqual(projected.items[0].validationMetrics,{primary:'new_users',secondary:['active_users']});
 assert.doesNotMatch(JSON.stringify(projected),/private@example\.test|private\.example\.test/);
 assert.match(projected.limitation,/不是全部/);
 assert.match(projected.limitation,/未记录不代表未执行/);
});
test('v5 general analysis receives business knowledge and safe memory; v3 stays unchanged',()=>{
 const value=raw();
 value.memory=[{business_problem:'首次分析下降',action:'检查漏斗',
  actual_action:'修复说明文案',result_summary:'结果仍未知',
  user_status:'executed',effectiveness:'unknown',
  validation_metrics:{primary:'new_users'},applicable_scope:{source:'all'}}];
 const before=JSON.stringify(value);
 const v5=modelContext(value,{transportVersion:'v5'});
 const v3=modelContext(value,{transportVersion:'v3'});
 assert.equal(v5.transportVersion,'aggregated-business-v5');
 assert.equal(v5.businessBrain.version,brain.VERSION);
 assert.equal(v5.operatingMemory.shown,1);
 assert.equal(v5.operatingMemory.items[0].outcome,'结果仍未知');
 assert.equal(v3.transportVersion,'aggregated-business-v3');
 assert.equal(v3.businessBrain,undefined);
 assert.equal(v3.operatingMemory,undefined);
 assert.equal(JSON.stringify(value),before);
 assert.ok(Buffer.byteLength(JSON.stringify(v5),'utf8')<=22000);
});

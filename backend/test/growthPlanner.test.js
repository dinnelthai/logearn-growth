'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {listSkills,getSkill}=require('../src/ai/growth/skills');
const {planGrowthInvestigation}=require('../src/ai/growth/planner');
const report={business:{scope:{source:'all'}},period:{start:100,end:200},
 snapshot:{id:'watermark-1'},candidates:[
 {id:'ret',metric:'d7',priority:'P1'},{id:'act',metric:'activation_rate',priority:'P0'}
 ],warnings:['coverage incomplete']};
test('skill catalog is versioned and only references registered read-only tools',()=>{
 const skills=listSkills(),ids=skills.map(s=>s.id);
 assert.equal(new Set(ids).size,ids.length);
 const toolIds=new Set([...require('../src/ai/business/tools/registry').listToolIds(),
  ...require('../src/ai/business/tools/openseoConnector').getExtensions().map(x=>x.id)]);
 for(const skill of skills){
  assert.equal(skill.version,'1');assert.ok(skill.tools.length);
  for(const tool of skill.tools)assert.ok(toolIds.has(tool),tool);
 }
 assert.throws(()=>getSkill('untrusted-action'),/未知增长技能/);
});
test('planner prioritizes candidate-matching skill without changing original business report',()=>{
 const before=JSON.stringify(report);
 const plan=planGrowthInvestigation({goal:'retention',report});
 assert.equal(plan.steps[0].skillId,'retention');
 assert.equal(plan.steps.length,2);
 assert.ok(plan.steps.every(s=>s.mode==='read-only'));
 assert.equal(plan.requiresApprovalForActions,true);
 assert.equal(plan.sourceSnapshot,'watermark-1');
 assert.equal(JSON.stringify(report),before);
});
test('registration cohort metrics are formal signals and valid reviewed investigation focus',()=>{
 const overview=listSkills().find(x=>x.id==='growth-overview');
 assert.ok(overview.signals.includes('registered_users'));
 assert.ok(overview.signals.includes('registration_activation_rate'));
 assert.ok(overview.signals.includes('registered_trade_conversion_rate'));
 const strategy={version:1,policy:{focusMetrics:['registration_activation_rate','registered_trade_conversion_rate'],
  instructions:'核查成熟注册队列'}};
 const plan=planGrowthInvestigation({goal:'activation',report,strategy});
 assert.deepEqual(plan.learningStrategy.focusMetrics,
  ['registration_activation_rate','registered_trade_conversion_rate']);
 const registry=require('../src/ai/business/metricRegistry');
 for(const id of ['registered_users','registration_activation_rate','registered_trade_conversion_rate']){
  assert.ok(registry.describeMetric(id).definition.length>10);
 }
});
test('planner rejects invalid goal, missing report and excessive skills',()=>{
 assert.throws(()=>planGrowthInvestigation({goal:'seo',report}),/未知增长目标/);
 assert.throws(()=>planGrowthInvestigation({goal:'activation'}),/现有业务报告/);
 assert.throws(()=>planGrowthInvestigation({goal:'activation',report,maxSkills:99}),/技能数量/);
});

test('single-source skill plan excludes global-only tools without changing business scope',()=>{
 const sourceReport={...report,business:{scope:{source:'twitter'}}};
 const plan=planGrowthInvestigation({goal:'revenue',report:sourceReport});
 assert.equal(plan.scope.source,'twitter');
 assert.ok(plan.steps.every(step=>!step.tools.includes('check_data_quality')));
 assert.ok(plan.steps.every(step=>!step.tools.includes('get_channel_economics')));
});

test('reviewed strategy focus changes only read-only investigation order, not source metric rankings',()=>{
 const original=JSON.stringify(report);
 const strategy={version:3,policy:{focusMetrics:['activation_rate'],
  instructions:'核查旧建议的新证据'},
  evidence:{judgementCount:4}};
 const plan=planGrowthInvestigation({goal:'conversion',report,strategy});
 assert.equal(plan.learningStrategy.version,3);
 assert.deepEqual(plan.learningStrategy.focusMetrics,['activation_rate']);
 assert.equal(plan.steps[0].skillId,'channel-growth');
 assert.equal(plan.requiresApprovalForActions,true);
 assert.equal(JSON.stringify(report),original);
 assert.throws(()=>planGrowthInvestigation({goal:'conversion',report,
  strategy:{policy:{focusMetrics:['write-to-product-db']}}}),/未授权/);
});

test('daily conversion specialty signals take precedence without modifying business metric priorities',()=>{
 const before=JSON.stringify(report);
 const plan=planGrowthInvestigation({goal:'conversion',report,maxSkills:5,
  availableSpecialties:['content-growth','follower-quality']});
 assert.deepEqual(plan.steps.slice(0,2).map(s=>s.skillId),['content-growth','follower-quality']);
 assert.ok(plan.steps[0].tools.includes('get_content_growth'));
 assert.ok(plan.steps[1].tools.includes('get_follower_quality'));
 assert.equal(JSON.stringify(report),before);
 assert.throws(()=>planGrowthInvestigation({goal:'conversion',report,
  availableSpecialties:['unreviewed-external-write']}),/每日专项证据输入无效/);
});

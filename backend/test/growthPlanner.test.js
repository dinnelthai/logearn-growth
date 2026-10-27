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
 const toolIds=new Set(require('../src/ai/business/tools/registry').listToolIds());
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
test('planner rejects invalid goal, missing report and excessive skills',()=>{
 assert.throws(()=>planGrowthInvestigation({goal:'seo',report}),/未知增长目标/);
 assert.throws(()=>planGrowthInvestigation({goal:'activation'}),/现有业务报告/);
 assert.throws(()=>planGrowthInvestigation({goal:'activation',report,maxSkills:99}),/技能数量/);
});

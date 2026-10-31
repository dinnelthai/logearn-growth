'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planGrowthInvestigation}=require('../src/ai/growth/planner');
const {modelCapabilities}=require('../src/ai/business/foundation');

const report={
 business:{scope:{source:'all'}},
 period:{start:Date.parse('2026-10-19T00:00:00+07:00'),
  end:Date.parse('2026-10-26T00:00:00+07:00'),timezone:'Asia/Bangkok'},
 candidates:[],warnings:[],snapshot:{id:'report-test'}
};
const special=['content-growth','follower-quality'];
const tools=[
 'query_metrics','check_data_quality','get_funnel','get_paths','get_product_chain',
 'get_content_growth','get_follower_quality','get_operations_timeline'
];
const registry={listCapabilities:()=>tools.map(id=>({
 id,version:'1',description:id,inputSchema:{type:'object'},supportedScopes:['source']
}))};

test('weekly activation report explicitly authorizes discovered channel evidence',()=>{
 const plan=planGrowthInvestigation({goal:'activation',report,maxSkills:12,history:[],
  availableSpecialties:special,includeWeeklySpecialties:true});
 assert.ok(plan.steps.some(s=>s.skillId==='content-growth'));
 assert.ok(plan.steps.some(s=>s.skillId==='follower-quality'));
 const ids=new Set(modelCapabilities(registry,{ownerId:'o',scope:{source:'all'},period:report.period},plan).map(x=>x.id));
 assert.ok(ids.has('get_content_growth'));
 assert.ok(ids.has('get_follower_quality'));
 assert.ok(ids.has('get_operations_timeline'));
 assert.ok(ids.has('get_operations_timeline'));
});
test('ordinary activation tasks do not inherit weekly specialty privileges',()=>{
 const plan=planGrowthInvestigation({goal:'activation',report,maxSkills:5,history:[],
  availableSpecialties:special});
 const ids=new Set(modelCapabilities(registry,{ownerId:'o',scope:{source:'all'},period:report.period},plan).map(x=>x.id));
 assert.equal(ids.has('get_content_growth'),false);
 assert.equal(ids.has('get_follower_quality'),false);
 assert.ok(ids.has('get_operations_timeline'));
 assert.equal(ids.has('get_operations_timeline'),false);
});
test('non-all-source scopes cannot acquire channel specialty tools',()=>{
 const scoped={...report,business:{scope:{source:'direct'}}};
 const plan=planGrowthInvestigation({goal:'activation',report:scoped,maxSkills:5,history:[],
  availableSpecialties:special,includeWeeklySpecialties:true});
 const ids=new Set(plan.steps.flatMap(s=>s.tools));
 assert.equal(ids.has('get_content_growth'),false);
 assert.equal(ids.has('get_follower_quality'),false);
 assert.equal(ids.has('get_operations_timeline'),false);
});
test('weekly opt-in rejects invalid authorization flags',()=>{
 assert.throws(()=>planGrowthInvestigation({goal:'activation',report,maxSkills:5,
  availableSpecialties:special,includeWeeklySpecialties:'true'}),/授权/);
});

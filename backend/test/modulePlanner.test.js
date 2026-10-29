'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {makePlan,runPlan}=require('../src/ai/growth/modulePlanner');
const ctx={ownerId:'alice',period:{start:100,end:200,timezone:'Asia/Bangkok'},scope:{source:'all'}};
function fake({missing=[]}={}){
 const modules=[
  {moduleId:'growth.seo',version:'1.0.0',status:'available',description:'GSC',capabilities:[{id:'get_seo_performance',version:'1',cost:'none'}]},
  {moduleId:'growth.acquisition',version:'1.0.0',status:'available',description:'channels',capabilities:[{id:'get_channels',version:'1',cost:'none'}]},
  {moduleId:'growth.activation',version:'1.0.0',status:'available',description:'funnel',capabilities:[{id:'get_funnel',version:'1',cost:'none'}]},
  {moduleId:'growth.quality',version:'1.0.0',status:'available',description:'quality',capabilities:[{id:'check_data_quality',version:'1',cost:'none'}]}
 ].filter(x=>!missing.includes(x.moduleId));
 const called=[];
 return {called,listBusinessModules:()=>modules,executeBusinessModule:async(request)=>{
  called.push(request);
  if(request.moduleId==='growth.seo')return {status:'unavailable',evidenceIds:[],warnings:['not-synced']};
  return {status:'ok',evidenceIds:['ev-'+request.capabilityId],coverage:{status:'partial'},
   data:{status:'ok',evidence:[]}};
 }};
}
test('dynamic planner selects SEO/channel/funnel and excludes external paid calls',()=>{
 const r=fake(),plan=makePlan(r,ctx,{mode:'focused',goal:'conversion',question:'SEO是否提升激活',
  moduleIds:['growth.seo','growth.acquisition','growth.activation'],maxCalls:4});
 assert.deepEqual(plan.steps.map(x=>x.capabilityId),['get_seo_performance','get_channels','get_funnel']);
 assert.equal(plan.limits.paidCalls,0);
});
test('partial failure continues and one quality followup reuses registry',async()=>{
 const r=fake(),plan=makePlan(r,ctx,{goal:'conversion',maxCalls:4,
  moduleIds:['growth.seo','growth.acquisition','growth.activation']});
 const result=await runPlan(r,ctx,plan);
 assert.equal(result.status,'partial');
 assert.equal(result.steps.length,4);
 assert.equal(result.steps.at(-1).moduleId,'growth.quality');
 assert.equal(r.called.filter(x=>x.capabilityId==='check_data_quality').length,1);
 assert.ok(result.evidenceIds.includes('ev-get_channels'));
});
test('missing modules remain explicit gaps and focus must ask a question',async()=>{
 const r=fake({missing:['growth.activation']});
 const plan=makePlan(r,ctx,{mode:'full',moduleIds:['growth.acquisition','growth.activation']});
 assert.equal(plan.missing[0].moduleId,'growth.activation');
 const result=await runPlan(r,ctx,plan);
 assert.equal(result.status,'partial');
 assert.throws(()=>makePlan(r,ctx,{mode:'focused',moduleIds:['growth.acquisition']}),/问题/);
});
test('scope, authorization, and paid ability remain server selected',async()=>{
 const r=fake();
 const p=makePlan(r,{...ctx,scope:{source:'direct'}},
  {moduleIds:['growth.quality','growth.acquisition'],maxCalls:2});
 assert.ok(p.steps.every(x=>x.capabilityId!=='openseo.saved_rankings'));
 const res=await runPlan(r,{...ctx,scope:{source:'direct'}},p);
 assert.equal(res.steps[0].moduleId,'growth.quality');
 const changed=JSON.parse(JSON.stringify(p));changed.steps[0].capabilityId='unapproved.execute';
 const bad=await runPlan(r,ctx,changed);
 assert.equal(bad.steps[0].status,'not_authorized');
});

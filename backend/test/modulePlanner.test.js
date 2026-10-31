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
test('full scan reports modules omitted by budget rather than claiming completeness',async()=>{
 const r=fake(),plan=makePlan(r,ctx,{mode:'full',goal:'activation',maxCalls:1});
 assert.equal(plan.steps.length,1);
 assert.ok(plan.missing.some(x=>x.moduleId==='growth.seo'&&x.reason==='budget_exceeded'));
 assert.equal((await runPlan(r,ctx,plan)).status,'partial');
});

test('measured owner-local query history selects lower observed latency only among comparable authorized alternatives',()=>{
 const registry=fake();
 const original=registry.listBusinessModules;
 registry.listBusinessModules=ctx=>original(ctx).map(m=>m.moduleId==='growth.activation'?
  {...m,capabilities:[...m.capabilities,{id:'get_paths',version:'1',cost:'none'}]}:m);
 registry.observedToolTimings=ctx=>{
  assert.equal(ctx.ownerId,'alice');
  return {
   get_funnel:{sampleCount:4,medianMs:70,
    basis:'owner-archived-successful-tool-wall-time',monetaryCostKnown:false},
   get_paths:{sampleCount:5,medianMs:15,
    basis:'owner-archived-successful-tool-wall-time',monetaryCostKnown:false},
   get_channels:{sampleCount:3,medianMs:25,
    basis:'owner-archived-successful-tool-wall-time',monetaryCostKnown:false}
  };
 };
 const plan=makePlan(registry,ctx,{mode:'focused',goal:'activation',
  question:'Which step constrains activation?',moduleIds:['growth.activation','growth.acquisition']});
 assert.equal(plan.steps[0].capabilityId,'get_paths');
 assert.equal(plan.steps[0].observedLatency.medianMs,15);
 assert.equal(plan.queryEfficiency.status,'observed-latency-comparable');
 assert.equal(plan.queryEfficiency.bestObservedLatencyTool,'get_paths');
 assert.equal(plan.queryEfficiency.monetaryCost,'unknown');
 assert.equal(plan.limits.paidCalls,0);
 // Never rank an unsampled alternative as faster or cheaper than observed tools.
 registry.observedToolTimings=()=>({
  get_funnel:{sampleCount:4,medianMs:70,
   basis:'owner-archived-successful-tool-wall-time',monetaryCostKnown:false}
 });
 const unknown=makePlan(registry,ctx,{mode:'focused',goal:'activation',
  question:'Next step?',moduleIds:['growth.activation','growth.acquisition']});
 assert.equal(unknown.steps[0].capabilityId,'get_funnel',
  'partially missing measurements preserve reviewed capability order');
 assert.equal(unknown.queryEfficiency.bestObservedLatencyTool,null);
 assert.equal(unknown.queryEfficiency.status,'insufficient-observed-cost-data');
});

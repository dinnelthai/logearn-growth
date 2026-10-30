'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {modelContext}=require('../src/ai/business/modelTransport');
const period={start:1792362000000,end:1792966800000,
 previousStart:1791757200000,previousEnd:1792362000000,timezone:'Asia/Bangkok'};
const evidence=i=>({
 id:'evidence-'+i,metricId:'active_users',unit:'users',value:120+i,
 numerator:200+i,denominator:300+i,sampleSize:300+i,period,
 sourceVersions:{events:'snapshot-v2'},
 watermarks:{events:'2026-10-29T00:00:00.000Z',
  eventsCompleteThrough:'2026-10-28T00:00:00.000Z'},
 coverage:{status:'partial',quality:'unknown'},
 warnings:['未确认完整历史；未观测并不表示零']
});
const schema={
 type:'object',additionalProperties:false,required:['start','end'],
 properties:{start:{type:'integer',minimum:0,maximum:2000000000000},
  end:{type:'integer',minimum:0,maximum:2000000000000},
  scope:{type:'object',properties:{source:{type:'string'}}},
  metrics:{type:'array',items:{type:'string'}},
  dimensions:{type:'array',items:{type:'string'}},
  limit:{type:'integer',minimum:1,maximum:100}}
};
const capabilities=Array.from({length:12},(_,i)=>({
 id:'get_tool_'+i,description:'Read-only statistical tool for authorized business scope',
 supportedScopes:['source'],inputSchema:schema
}));
const raw={business:{scope:{source:'all'}},period,
 definitions:{active_users:'观测到筹码分析的去重用户，不代表注册'},
 snapshot:{id:'snapshot'},current:{totals:{active_users:120}},
 previous:{totals:{active_users:110}},growth:{channels:[]},weekly:{available:true},
 candidates:[],capabilities,
 evidence:Array.from({length:30},(_,i)=>evidence(i))
};
test('v2 keeps more evidenced metrics in a smaller bounded model context',()=>{
 const before=modelContext(raw),after=modelContext(raw,{transportVersion:'v2'});
 const size=x=>Buffer.byteLength(JSON.stringify(x),'utf8');
 assert.equal(before.transportVersion,'aggregated-business-v1');
 assert.equal(after.transportVersion,'aggregated-business-v2');
 assert.ok(size(after)<size(before),'the v2 context should actually be smaller');
 assert.ok(after.evidence.length>=before.evidence.length);
 assert.ok(size(after)<=22000);
 assert.deepEqual(after.evidence.map(x=>x.id),
  Array.from({length:after.evidence.length},(_,i)=>'evidence-'+i));
 assert.ok(after.sharedEvidence?.watermarks);
 assert.ok(after.evidence.some(e=>e.shared?.includes('watermarks')));
 assert.equal(after.evidence[0].value,120);
 assert.equal(after.current.totals.active_users,120);
 assert.equal(after.previous.totals.active_users,110);
});
test('v2 tool specs remain callable but never expand authorized capabilities',()=>{
 const compact=modelContext(raw,{transportVersion:'v2'}).capabilities;
 assert.deepEqual(compact.map(x=>x.id),capabilities.map(x=>x.id));
 assert.equal(compact[0].input.start.type,'integer');
 assert.deepEqual(compact[0].required,['start','end']);
 assert.equal(compact[0].input.end.max,2000000000000);
 assert.equal(compact[0].supportedScopes[0],'source');
});
test('projection still drops private row-level fields and never converts unknown into zero',()=>{
 const report={...raw,evidence:[{...evidence(0),value:null,
  rows:[{user_id:'secret-user',wallet:'0x123'}]}]};
 const view=modelContext(report,{transportVersion:'v2'});
 assert.equal(view.evidence[0].value,null);
 assert.equal(JSON.stringify(view).includes('secret-user'),false);
});
test('unsupported model context protocol is rejected',()=>{
 assert.throws(()=>modelContext(raw,{transportVersion:'v9'}),/版本/);
});

test('v2 also supports an entirely empty evidence catalog',()=>{
 const projected=modelContext({...raw,evidence:[],capabilities:[]},{transportVersion:'v2'});
 assert.deepEqual(projected.evidence,[]);
 assert.equal(projected.evidenceMeta.total,0);
 assert.equal(projected.transportVersion,'aggregated-business-v2');
});

test('v3 trims empty evidence metadata without weakening numeric facts or attribution',()=>{
 const before=modelContext(raw,{transportVersion:'v2'});
 const after=modelContext(raw,{transportVersion:'v3'});
 assert.equal(after.transportVersion,'aggregated-business-v3');
 assert.equal(after.evidence[0].value,120);
 assert.equal(after.current.totals.active_users,120);
 assert.deepEqual(after.evidence.map(x=>x.id),before.evidence.map(x=>x.id));
 assert.deepEqual(after.capabilities.map(x=>x.id),before.capabilities.map(x=>x.id));
 assert.ok(Buffer.byteLength(JSON.stringify(after),'utf8')<=
  Buffer.byteLength(JSON.stringify(before),'utf8'));
});

test('new activation analyses give the model scoped review lessons without exposing action text',()=>{
 const report={...raw,focusGoal:'activation',reviewLessonsVersion:1,
  growthPlan:{experienceFeedback:[{metric:'activation_rate',effectiveReviews:1,ineffectiveReviews:2,
   recentLessons:['private action details']}],steps:[]}};
 const view=modelContext(report,{transportVersion:'v3'});
 assert.deepEqual(view.reviewLessons,[{metric:'activation_rate',observedImproved:1,observedNotImproved:2}]);
 assert.match(view.omissions.reviewLessons,/因果/);
 assert.equal(JSON.stringify(view).includes('private action details'),false);
 assert.equal(modelContext({...report,reviewLessonsVersion:undefined},{transportVersion:'v3'}).reviewLessons,undefined);
});

test('retrospective model input contains observed metric changes and periods',()=>{
 const review={reviewContextVersion:1,suggestion:{problem:'激活下降',action:'检查入口',scope:{source:'all'}},
  periods:{baselineStart:1,baselineEnd:2,effectStart:3,effectEnd:4,days:3},
  metricChanges:{activation_rate:{available:true,baseline:0.2,effect:0.3,absolute:0.1,change:50,direction:'up'},
   d7:{available:false,error:'metric_not_found'}},baseline:{totals:{users:10},rows:[{email:'secret@example.com'}]},effect:{totals:{users:12}}};
 const view=modelContext(review);
 assert.deepEqual(view.review.metricChanges,review.metricChanges);
 assert.deepEqual(view.review.periods,review.periods);
 assert.equal(view.review.suggestion.action,'检查入口');
 assert.equal(JSON.stringify(view).includes('secret@example.com'),false);
});

test('new activation analyses receive the planned investigation and permitted tools',()=>{
 const view=modelContext({...raw,focusGoal:'activation',reviewLessonsVersion:2,
  growthPlan:{experienceFeedback:[],steps:[{skillId:'activation-funnel',label:'激活漏斗诊断',
   investigation:'只比较成熟样本；排除埋点覆盖变化',tools:['get_funnel','check_data_quality']}]}},
  {transportVersion:'v3'});
 assert.equal(view.growthPlan.steps[0].id,'activation-funnel');
 assert.match(view.growthPlan.steps[0].investigation,/成熟样本/);
 assert.deepEqual(view.growthPlan.steps[0].tools,['get_funnel','check_data_quality']);
});

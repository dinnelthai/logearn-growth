'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {modelContext,statView}=require('../src/ai/business/modelTransport');
const {forModel}=require('../src/ai/business/modelEvidence');
const {runTask}=require('../src/ai/business/runner');

const forbidden='private-user@example.com';
const wallet='0x'+'a'.repeat(40);
test('initial model context transports KPI aggregates, not user or event details',()=>{
 const input={business:{scope:{source:'seo'},question:'What is activation of '+forbidden},
  focusGoal:'activation',period:{start:1000,end:2000,timezone:'Asia/Bangkok'},
  snapshot:{id:'source-snapshot-1',asOf:'2026-10-27T00:00:00Z',
   historyComplete:false,eventsCompleteThrough:null},
  current:{totals:{active_users:82,new_users:30,returning_users:52},
   days:[{date:'2026-10-27',active_users:82}],
   members:[{user_id:forbidden}],events:[{userId:'secret'}]},
  growth:{channels:[{source:'seo',users:82,eligible:70,activated:30,
   d7:{eligible:40,returned:12,rate:0.3},
   memberIds:[forbidden],lists:[wallet]}],
   quality:{history_complete:false,events_complete_through:null,events:100},
   lists:{'growth:current':['user:123']},members:{'user:123':{email:forbidden}}},
  evidence:[{id:'ev-123',metricId:'activation_rate',value:0.42,
   numerator:30,denominator:70,sourceVersions:{events:'snapshot-1'},
   coverage:{status:'partial'},query:{user_id:forbidden}}],
  changes:[{content:forbidden}],memory:[{actual_action:wallet}],
  manualActions:[{owner_id:'user:123'}],warnings:['history unverified'],
  candidates:[{metric:'active_users',current:82,previous:95,delta:-13,score:71,priority:'P0'}]};
 const before=JSON.stringify(input),view=modelContext(input),out=JSON.stringify(view);
 assert.equal(JSON.stringify(input),before);
 assert.equal(view.current.totals.active_users,82);
 assert.equal(view.growth.channels[0].d7.eligible,40);
 assert.equal(view.growth.channels[0].d7.returned,12);
 assert.equal(view.evidence[0].id,'ev-123');
 assert.equal(view.evidence[0].numerator,30);
 assert.equal(view.snapshot.historyComplete,false);
 assert.equal(view.snapshot.eventsCompleteThrough,null);
 assert.ok(view.definitions);
 for(const sensitive of [forbidden,wallet,'user:123','memberIds','memberIds'])assert.ok(!out.includes(sensitive),sensitive);
 assert.equal(view.memory,undefined);
 assert.equal(view.manualActions,undefined);
});
test('short nested user rows and user identifiers are NEVER sent to the model',()=>{
 const result={status:'ok',evidence:[{
  id:'ev-provenance',metricId:'funnel',definitionVersion:'1',
  value:{total_entered:100,total_converted:28,pending_count:10,
   steps:[{key:'token',users:100},{key:'chip',users:28}],
   rows:[{userId:forbidden,events:[{wallet}],session_id:'secret'}],
   quality:{missingStartUserIds:['private-key']},active_user_ids:[forbidden]},
  coverage:{status:'partial'},sourceVersions:{events:'watermark-snapshot'},
  watermarks:{events:'2026-10-27T00:00:00Z'}}]};
 const raw=JSON.stringify(result),model=forModel(result);
 const serialized=JSON.stringify(model);
 assert.equal(JSON.stringify(result),raw);
 assert.equal(model.evidence[0].value.total_entered,100);
 assert.equal(model.evidence[0].value.steps[1].users,28);
 assert.equal(model.evidence[0].sourceVersions.events,'watermark-snapshot');
 assert.equal(model.evidence[0].coverage.status,'partial');
 assert.ok(!serialized.includes(forbidden));
 assert.ok(!serialized.includes('session_id'));
 assert.ok(!serialized.includes('active_user_ids'));
 assert.ok(!serialized.includes(wallet));
});
test('a tiny PII-bearing result never bypasses the transport because it fits the byte limit',()=>{
 const raw={status:'ok',evidence:[{id:'e',metricId:'paths',
  value:{users:2,events:[{user_id:'user:37',cookie:forbidden}]}}]};
 const safe=forModel(raw,{maxBytes:1100});
 assert.equal(safe.evidence[0].value.users,2);
 assert.ok(!JSON.stringify(safe).includes(forbidden));
});
test('large aggregates preserve evidence identity, warnings and unknowns within budget',()=>{
 const raw={status:'ok',evidence:[{id:'e1',metricId:'funnel',
  value:{users:50,channels:Array.from({length:500},(_,i)=>({
   source:'channel-'+i,users:1,eligible:0,rate:null}))},
  coverage:{status:'partial'},warnings:['not mature']}]};
 const serialized=JSON.stringify(forModel(raw,{maxBytes:1600}));
 assert.ok(Buffer.byteLength(serialized)<1600);
 assert.ok(serialized.includes('e1'));
 assert.ok(serialized.includes('partial')||serialized.includes('omitted'));
 assert.ok(!serialized.includes('private-user@example.com'));
});
test('model conversation exposes only projected initial report and projected tool evidence',async()=>{
 const seen=[];
 const results=[
  JSON.stringify({investigations:[{tool:'get_funnel',input:{}}],reason:'need funnel'}),
  JSON.stringify({summary:'business summary',keyFindings:[],suggestions:[]})
 ];
 const out=await runTask({context:{business:{scope:{source:'seo'}},
  current:{totals:{active_users:19},rows:[{email:forbidden}]},evidence:[]},
  prompt:'Business reasoning from statistics',ownerId:'alice',
  operationId:'transport-only',operationType:'analysis',
  clientFactory:()=>({modelInfo:{provider:'mock'},chat:async messages=>{
   seen.push(JSON.parse(JSON.stringify(messages)));
   return {content:results.shift(),cost:0,usage:{totalTokens:10},provider:'mock'}
  }}),
  investigate:async()=>({status:'ok',evidence:[{id:'ev-tool',metricId:'funnel',
   value:{total_entered:15,rows:[{email:forbidden}]}}]})
 });
 assert.equal(out.analysis.summary,'business summary');
 assert.equal(seen[0][1].content.includes(forbidden),false);
 assert.equal(seen[1].at(-1).content.includes(forbidden),false);
 assert.match(seen[1].at(-1).content,/ev-tool/);
 assert.match(seen[0][1].content,/active_users/);
});
test('explicit permission, size and rate-budget errors become safe unknown tool observations',async()=>{
 for(const status of [400,403,422,429]){
  const received=[];
  const replies=[
   JSON.stringify({investigations:[{tool:'get_paths',input:{}}]}),
   JSON.stringify({summary:'insufficient evidence',keyFindings:[],suggestions:[]})
  ];
  const result=await runTask({context:{},prompt:'test',ownerId:'alice',
   operationId:'case-'+status,operationType:'analysis',
   clientFactory:()=>({modelInfo:{provider:'mock'},chat:async msgs=>{
    received.push(JSON.parse(JSON.stringify(msgs)));return {content:replies.shift(),usage:{totalTokens:9},cost:0};
   }}),
   investigate:async()=>{throw Object.assign(Error(forbidden),{status})}
  });
  assert.equal(result.analysis.summary,'insufficient evidence');
  assert.equal(result.evidence[0].result.status,'unavailable');
  assert.equal(received[1].at(-1).content.includes(forbidden),false);
  assert.match(received[1].at(-1).content,/unavailable/);
 }
});
test('free-form nested identity keys are not accidentally treated as aggregates',()=>{
 const x=statView({sessions:3,rows:[{wallet}],
  channels:[{source:'reddit',users:7,transactions:0,unknown:2}],
  mystery:{events:[{wallet:forbidden}]}});
 assert.equal(x.sessions,3);
 assert.equal(x.rows,undefined);
 assert.equal(x.channels[0].users,7);
 assert.equal(x.mystery,undefined);
});

test('huge aggregate reports are bounded before any paid request without coercing unknowns to zero',()=>{
 const raw={business:{scope:{source:'all'}},focusGoal:'activation',
  current:{totals:{active_users:100,new_users:40}},
  previous:{totals:{active_users:130,new_users:60}},
  growth:{channels:Array.from({length:400},(_,i)=>({
   source:'campaign-'+i,users:300-i,eligible:250-i,activated:120-i,
   d7:{eligible:100,returned:25,rate:0.25},
   definition:'Cohort attribution is observational '.repeat(20)
  })),quality:{history_complete:false}},
  candidates:Array.from({length:200},(_,i)=>({metric:'active_users',
   score:100-i,source:'campaign-'+i,reason:'test '.repeat(100)})),
  evidence:Array.from({length:100},(_,i)=>({
   id:'evidence-'+i,metricId:'activation_rate',definitionVersion:'1',
   value:{channels:Array.from({length:100},(_,j)=>({source:'s'+j,users:10}))},
   numerator:10,denominator:100,coverage:{status:'partial'}}))};
 const projected=modelContext(raw);
 assert.ok(Buffer.byteLength(JSON.stringify(projected),'utf8')<=22000);
 assert.equal(projected.current.totals.active_users,100);
 assert.equal(projected.previous.totals.new_users,60);
 assert.equal(projected.evidenceMeta.total,100);
 assert.ok(projected.evidenceMeta.shown<=40);
 assert.equal(projected.growth.quality.history_complete,false);
});

test('requested output cap vs relay usage is recorded without retrying provider',async()=>{
 const old=process.env.AI_TASK_MAX_OUTPUT_TOKENS;
 process.env.AI_TASK_MAX_OUTPUT_TOKENS='1024';
 try{
  let calls=0,options=null;
  const result=await runTask({context:{focusGoal:'activation'},prompt:'test',
   ownerId:'alice',operationId:'cap-diagnostic',operationType:'analysis',
   clientFactory:()=>({modelInfo:{provider:'mock'},chat:async(_messages,opts)=>{
    calls++;options=opts;
    return {content:JSON.stringify({summary:'done',keyFindings:[],suggestions:[]}),
     usage:{inputTokens:80,outputTokens:4069,totalTokens:4149},cost:0.1,provider:'mock'}
   }})});
  assert.equal(calls,1,'usage discrepancy must not retry a billable request');
  assert.equal(result.analysis.summary,'done');
  assert.equal(options.maxTokens,1024);
  assert.equal(result.calls[0].requestedMaxOutputTokens,1024);
  assert.equal(result.calls[0].reportedOutputTokens,4069);
  assert.equal(result.calls[0].outputCapDiscrepancy,true);
  assert.equal(result.calls[0].modelTransportVersion,'aggregated-business-v1');
 }finally{
  if(old===undefined)delete process.env.AI_TASK_MAX_OUTPUT_TOKENS;
  else process.env.AI_TASK_MAX_OUTPUT_TOKENS=old;
 }
});

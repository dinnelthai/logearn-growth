'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createToolRegistry}=require('../src/ai/business/tools/registry')
const now=Date.now(),start=now-86400000,end=now-1000
function createRegistry(){
 const saved=[],calls=[]
 const payload={
  period:{start,end,timezone:'Asia/Bangkok',endExclusive:true},asOf:now,
  humanOperations:[
   {id:'activity:activity-uuid',kind:'growth_activity',layer:'human_operation',source:'growth_activities',title:'Campaign',status:'active',memberCount:5,assignments:[{group:'treatment',assigned:3,delivered:2,delivery_unknown:1}],startAt:start,endAt:end-3600000,settledAt:end-1000,
    outcome:{status:'settled',asOf:new Date(end-2000).toISOString(),
     summary:{completed:2,eligible:5,conversion_rate:.4},
     performance:{analysis_users:4,trade_users:1,transactions:2},
     sourceCoverage:{account:'available',analysis:'available',trade:'available'}}},
   {id:'kol-collaboration:collab-uuid',kolRef:'kol:kol-1',kind:'kol_collaboration',layer:'human_operation',source:'crm_collaborations',title:'KOL campaign',startAt:start,endAt:end,linkedActivityIds:['activity-uuid']}
  ],
  channelObservations:[{kind:'x_official_account',layer:'channel_observation',source:'twitterapi.io',title:'X account',metrics:{impressions:10}},
   {kind:'kol_period_observation',layer:'channel_observation',source:'kol-crm-observed-behavior',title:'KOL period',relationshipType:'crm-kol-id-match',kolSummaries:[{kolRef:'kol:kol-1',label:'KOL One',stage:'active',metrics:{observedUsers:5,analysis_events:10},linkedCollaborationRefs:['kol-collaboration:collab-uuid']}]}],
  aiActions:[{kind:'ai_report_action',layer:'ai_suggestion_or_review',source:'business_analysis_actions',title:'Suggested test',status:'pending'}],
  coverage:{growthActivities:{status:'available',count:1},xOfficial:{status:'available',count:1}},
  warnings:['AI suggestions are not completed human operations']
 }
 const registry=createToolRegistry({
  evidenceStore:{save:e=>saved.push(e),get:()=>null},
  lookups:{},
  snapshot:async()=>({snapshot_id:'unused',as_of:new Date(now).toISOString()}),
  runAnalysis:async()=>({}),metrics:async()=>({}),economics:async()=>({}),
  activities:async()=>({}),seoPerformance:async()=>({}),kolPerformance:async()=>({}),
  contentGrowth:async()=>({}),followerQuality:async()=>({}),
  operationsTimeline:async(body,ctx)=>{calls.push({body,ctx});return payload}
 })
 return {registry,saved,calls,payload}
}
test('legacy tool discovery and execution expose the owner-scoped operating timeline',async()=>{
 const {registry,saved,calls}=createRegistry()
 const context={ownerId:'owner-1',runId:'test',scope:{source:'all'},period:{start,end,timezone:'Asia/Bangkok'}}
 const capability=registry.listCapabilities(context).find(x=>x.id==='get_operations_timeline')
 assert.ok(capability)
 assert.match(capability.description,/人工活动/)
 const result=await registry.executeTool('get_operations_timeline',{start,end,limit:20},context)
 assert.equal(result.status,'ok')
 assert.equal(calls.length,1)
 assert.equal(calls[0].ctx.ownerId,'owner-1')
 assert.equal(calls[0].body.source,'all')
 assert.equal(calls[0].body.start,start)
 assert.equal(saved.length,1)
 const value=result.evidence[0].value
 assert.equal(value.humanOperations[0].title,'Campaign')
 assert.match(value.humanOperations[0].recordRef,/^record:[a-f0-9]{16}$/)
 assert.match(value.humanOperations[1].recordRef,/^record:[a-f0-9]{16}$/)
 assert.deepEqual(value.humanOperations[1].relatedRecordRefs,[value.humanOperations[0].recordRef])
 assert.equal(value.humanOperations[1].relationshipType,'explicit-crm-activity-link')
 assert.equal(value.humanOperations[1].kolRef,value.channelObservations[1].kolSummaries[0].kolRef)
 assert.equal(value.channelObservations[1].relationshipType,'crm-kol-id-match')
 assert.equal(value.channelObservations[1].kolSummaries[0].metrics.analysis_events,10)
 assert.equal(value.channelObservations[1].kolSummaries[0].linkedCollaborationRefs[0],value.humanOperations[1].recordRef)
 assert.equal(JSON.stringify(value).includes('activity-uuid'),false)
 assert.equal(JSON.stringify(value).includes('collab-uuid'),false)
 assert.equal(value.channelObservations[0].metrics.impressions,10)
 assert.equal(value.aiActions[0].status,'pending')
 assert.equal(value.coverage.growthActivities.count,1)
 assert.equal(value.counts.human_operations_shown,2)
 assert.equal(value.counts.channel_observations_shown,2)
 assert.equal(value.counts.ai_actions_shown,1)
 assert.equal(value.humanOperations[0].memberCount,5)
 assert.equal(value.humanOperations[0].assignments[0].assigned,3)
 assert.equal(value.humanOperations[0].outcome.summary.completed,2)
 assert.equal(value.outcomeLinks.length,1);
 const linked=value.outcomeLinks[0];
 assert.equal(linked.collaborationRef,value.humanOperations[1].recordRef);
 assert.equal(linked.activityRef,value.humanOperations[0].recordRef);
 assert.equal(linked.relationshipType,'explicit-crm-activity-link');
 assert.equal(linked.attribution,'observed-non-causal');
 assert.equal(linked.window.start,start);
 assert.equal(linked.window.end,end-3600000);
 assert.equal(linked.observed.completed,2);
 assert.equal(linked.observed.analysis_users,4);
 assert.equal(linked.observed.trade_users,1);
 assert.equal(linked.observed.transactions,2);
 assert.equal(linked.coverage.trade,'available');
 assert.equal(JSON.stringify(linked).includes('activity-uuid'),false);
 assert.match(value.warnings.join(' '),/not completed human operations/)
})
test('only explicit CRM keys and comparable mature windows connect outcomes; never time-only attribution',async()=>{
 const cases=[
  payload=>{payload.humanOperations[1].linkedActivityIds=[];},
  payload=>{payload.humanOperations[1].startAt=start+3600000;},
  payload=>{payload.humanOperations[0].outcome.asOf=new Date(end+1000).toISOString();},
  payload=>{payload.humanOperations[0].settledAt=end+1000;},
  payload=>{payload.humanOperations[0].outcome.sourceCoverage={
   account:'unavailable',analysis:'unavailable',trade:'unavailable'};},
  payload=>{payload.humanOperations[0].endAt=end+1000;}
 ];
 for(const modify of cases){
  const {registry,payload}=createRegistry();
  modify(payload);
  const context={ownerId:'owner-1',runId:'test',scope:{source:'all'},
   period:{start,end,timezone:'Asia/Bangkok'}};
  const result=await registry.executeTool('get_operations_timeline',{start,end},context);
  assert.equal(result.status,'ok');
  assert.deepEqual(result.evidence[0].value.outcomeLinks,[]);
  // The independent KOL observation itself never becomes an attributed outcome.
  assert.equal(result.evidence[0].value.channelObservations[1].kolSummaries[0].metrics.analysis_events,10);
 }
});

test('timeline tool refuses unsupported source scopes and invalid periods before reading sources',async()=>{
 const {registry,calls}=createRegistry()
 const context={ownerId:'owner-1',runId:'test',scope:{source:'direct'},period:{start,end,timezone:'Asia/Bangkok'}}
 await assert.rejects(registry.executeTool('get_operations_timeline',{start,end},context),e=>e.status===400||e.status===403)
 assert.equal(calls.length,0)
});

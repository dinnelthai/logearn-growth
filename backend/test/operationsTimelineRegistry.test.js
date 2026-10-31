'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createToolRegistry}=require('../src/ai/business/tools/registry')
const now=Date.now(),start=now-86400000,end=now-1000
function createRegistry(){
 const saved=[],calls=[]
 const payload={
  period:{start,end,timezone:'Asia/Bangkok',endExclusive:true},asOf:now,
  humanOperations:[{kind:'growth_activity',layer:'human_operation',source:'growth_activities',title:'Campaign',status:'active'}],
  channelObservations:[{kind:'x_official_account',layer:'channel_observation',source:'twitterapi.io',title:'X account',metrics:{impressions:10}}],
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
 assert.equal(value.channelObservations[0].metrics.impressions,10)
 assert.equal(value.aiActions[0].status,'pending')
 assert.equal(value.coverage.growthActivities.count,1)
 assert.match(value.warnings.join(' '),/not completed human operations/)
})
test('timeline tool refuses unsupported source scopes and invalid periods before reading sources',async()=>{
 const {registry,calls}=createRegistry()
 const context={ownerId:'owner-1',runId:'test',scope:{source:'direct'},period:{start,end,timezone:'Asia/Bangkok'}}
 await assert.rejects(registry.executeTool('get_operations_timeline',{start,end},context),e=>e.status===400||e.status===403)
 assert.equal(calls.length,0)
});

const {test}=require('node:test')
const assert=require('node:assert/strict')
const evidence=require('../src/data/businessEvidence')
const {metrics}=require('../src/ai/business/tools/adapters')

test('registered_users uses account creation facts and preserves a true zero',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:true,scope:'all',metrics:{users:0,eligible:0,activated:0,pending:0,rate:null}
  }}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},['registered_users'],{})
  assert.equal(result.metrics[0].value,0)
  assert.equal(result.coverage.registrations,'all')
  assert.match(result.metrics[0].warnings.join(' '),/account_v2\.created_at/)
  assert.doesNotMatch(result.metrics[0].warnings.join(' '),/未知不能解释为0/)
 }finally{evidence.fetchGrowthInsights=original}
})

test('registered_users remains unknown when registration facts are unavailable',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:false,scope:'all',metrics:null,error:'registration facts unavailable'
  }}})
  const result=await metrics({start:100,end:200,source:'all'},{snapshot_id:'s'},['registered_users'],{})
  assert.equal(result.metrics[0].value,null)
  assert.equal(result.coverage.registrations,'unknown')
  assert.match(result.metrics[0].warnings.join(' '),/未知不能解释为0/)
 }finally{evidence.fetchGrowthInsights=original}
})

test('source-specific registration counts disclose observed-source attribution limits',async()=>{
 const original=evidence.fetchGrowthInsights
 try{
  evidence.fetchGrowthInsights=async()=>({cohorts:{registration:{
   available:true,scope:'observed_source',metrics:{users:12,eligible:8,activated:6,pending:2,rate:.75}
  }}})
  const result=await metrics({start:100,end:200,source:'x'},{snapshot_id:'s'},['registered_users'],{})
  assert.equal(result.metrics[0].value,12)
  assert.equal(result.coverage.registrations,'observed_source')
  assert.match(result.metrics[0].warnings.join(' '),/未归因账户不会计入该来源/)
 }finally{evidence.fetchGrowthInsights=original}
})

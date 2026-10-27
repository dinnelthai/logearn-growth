'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {tickAutonomousOwner,autonomyConfig}=require('../src/ai/growth/agentAutonomy');
const now=Date.parse('2026-10-27T05:00:00Z'),DAY=86400000;
function fake(){
 const state={rows:[],records:0,queued:0,saved:[],judgements:0};
 const store={
  feedback:async()=>[],upsertJudgements:async()=>{state.judgements++},
  saveStrategy:async()=>{throw Error('cannot learn without reviewed evidence')},
  getStrategy:async()=>null,
  dailyAnalyses:async()=>state.rows,
  targets:async()=>[],
  async upsertBrief(_owner,brief){
   state.saved.push(brief);
   return {id:'brief-one',status:brief.status};
  }
 };
 const records={async createAnalysisRecord(input){
  state.records++;
  const record={id:'analysis-'+state.records,status:'pending',
   date_range_start:input.dateRangeStart,date_range_end:input.dateRangeEnd,
   business_scope:input.businessScope,user_question:input.userQuestion,
   filter_conditions:input.filterConditions};
  state.rows.push(record);return record;
 }};
 const enqueue=async(name,body,options)=>{
  state.queued++;assert.equal(name,'business-analysis');
  assert.equal(body.ownerId,'alice');assert.equal(options.attempts,1);
  return {id:options.jobId};
 };
 return {state,store,records,enqueue};
}
test('autonomy readonly tick consolidates a blocked brief without dispatching paid calls',async()=>{
 const fixture=fake(),input={ownerId:'alice',now,goals:['activation','retention'],
  allowPaidDispatch:false,...fixture};
 const result=await tickAutonomousOwner(input);
 assert.equal(result.day,'2026-10-26');
 assert.equal(result.status,'blocked');
 assert.equal(result.score,null);
 assert.equal(fixture.state.records,0);assert.equal(fixture.state.queued,0);
 assert.equal(fixture.state.saved[0].report.automatedExternalActions,0);
 assert.equal(fixture.state.judgements,1);
});
test('paid opt-in only enqueues missing goals and reuses durable source analysis ids',async()=>{
 const fixture=fake(),input={ownerId:'alice',now,goals:['activation'],
  allowPaidDispatch:true,...fixture};
 let result=await tickAutonomousOwner(input);
 assert.equal(result.enqueued.length,1);
 assert.equal(fixture.state.queued,1);
 assert.equal(fixture.state.records,1);
 result=await tickAutonomousOwner(input);
 assert.equal(result.enqueued.length,1);
 assert.equal(result.enqueued[0].status,'queued');
 assert.equal(fixture.state.queued,2);
 assert.equal(fixture.state.records,2);
 assert.equal(result.automaticPaidAllowed,true);
});
test('scheduler goals and paid flags require explicit authorization',()=>{
 assert.throws(()=>autonomyConfig({}),/授权用户/);
 let config=autonomyConfig({AI_AUTONOMY_OWNER_IDS:'alice,bob'});
 assert.equal(config.paidEnabled,false);
 assert.equal(config.goals.length,4);
 config=autonomyConfig({AI_AUTONOMY_OWNER_IDS:'alice',
  AI_AUTONOMY_PAID_DAILY_ENABLED:'1',AI_AUTONOMY_PAID_CALLS_PER_DAY:'12',
  AI_AUTONOMY_GOALS:'activation,retention'});
 assert.equal(config.paidEnabled,true);
 assert.throws(()=>autonomyConfig({AI_AUTONOMY_OWNER_IDS:'alice',AI_AUTONOMY_PAID_DAILY_ENABLED:'1'}),/必须配置/);
 assert.deepEqual(config.goals,['activation','retention']);
 assert.throws(()=>autonomyConfig({AI_AUTONOMY_OWNER_IDS:'alice,alice'}),/不重复/);
});

test('completed retrospective strategy can propose a review-only prompt candidate when explicitly enabled',async()=>{
 const prev=process.env.AI_PROMPT_CANDIDATE_PROPOSAL_ENABLED;
 process.env.AI_PROMPT_CANDIDATE_PROPOSAL_ENABLED='1';
 const fixture=fake(),requests=[];
 fixture.store.getStrategy=async()=>({version:1,policy:{focusMetrics:['active_users']}});
 try{
  const out=await tickAutonomousOwner({
   ownerId:'alice',now,goals:['activation'],allowPaidDispatch:false,...fixture,
   proposeCandidate:async request=>{
    requests.push(request);
    return {id:'candidate-1',status:'proposed'};
   }
  });
  assert.equal(requests.length,1);
  assert.equal(requests[0].role,'analysis');
  assert.match(requests[0].appendix,/active_users/);
  assert.equal(out.promptCandidate.status,'proposed');
  assert.equal(out.promptCandidate.requiresIndependentEvaluation,true);
  assert.equal(out.externalActions,0);
  assert.equal(out.enqueued.length,0);
 }finally{
  if(prev==null)delete process.env.AI_PROMPT_CANDIDATE_PROPOSAL_ENABLED;
  else process.env.AI_PROMPT_CANDIDATE_PROPOSAL_ENABLED=prev;
 }
});

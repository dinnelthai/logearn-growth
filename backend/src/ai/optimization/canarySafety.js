'use strict';
// Automatic fail-safe only: never promotes candidates or claims business lift.
// Uses archived owner-scoped Prompt hashes and validated output presence.
const {createPromptRegistry}=require('./promptRegistry');
function evidenceFor(db,ownerId,hash,since){
 const calls=db.prepare(`SELECT run_id,
   MAX(CASE WHEN status='unknown' THEN 1 ELSE 0 END) uncertain,
   MAX(CASE WHEN status='received' AND json_type(result,'$.validatedAnalysis')='object' THEN 1 ELSE 0 END) validated
   FROM agent_calls WHERE owner_id=? AND json_extract(prompts,'$.analysis')=?
   AND started_at>=? GROUP BY run_id LIMIT 2000`).all(ownerId,hash,since);
 return {runs:calls.length,uncertain:calls.filter(x=>x.uncertain).length,
  validated:calls.filter(x=>x.validated).length,
  unknownRate:calls.length?calls.filter(x=>x.uncertain).length/calls.length:null};
}
function checkCanary(db,ownerId,{now=Date.now(),env=process.env,minRuns=20}={}){
 if(typeof ownerId!=='string'||!ownerId||!Number.isSafeInteger(now)||
  !Number.isSafeInteger(minRuns)||minRuns<10||minRuns>1000)throw Error('灰度检查条件无效');
 if(env.AI_PROMPT_AUTO_ROLLBACK_ENABLED!=='1'||env.AI_PROMPT_RUNTIME_ENABLED!=='1')
  return {status:'disabled',action:'none'};
 const current=db.prepare(`SELECT a.role,a.candidate_hash,a.previous_hash,
  a.version,r.percent,a.updated_at FROM agent_active_prompts a
  JOIN agent_prompt_rollouts r ON r.owner_id=a.owner_id AND r.role=a.role
  WHERE a.owner_id=? AND a.role='analysis'`).get(ownerId);
 if(!current||current.percent<=0)return {status:'no-active-canary',action:'none'};
 const since=Math.max(now-7*86400000,Number(current.updated_at)||0);
 const candidate=evidenceFor(db,ownerId,current.candidate_hash,since);
 const baseline=evidenceFor(db,ownerId,current.previous_hash,since);
 if(candidate.runs<minRuns||baseline.runs<minRuns)
  return {status:'insufficient-comparable-samples',action:'none',candidate,baseline,
   note:'Cannot infer safety or business quality from small samples'};
 const risk=candidate.unknownRate>=0.20&&
  candidate.unknownRate-baseline.unknownRate>=0.10;
 if(!risk)return {status:'observed-no-stop-threshold',action:'none',candidate,baseline};
 const rolled=createPromptRegistry(db).rollback(ownerId,current.role,current.version);
 return {status:'canary-automatically-rolled-back',action:'rollback',candidate,baseline,
  version:rolled.version,reason:'uncertain-paid-call-rate-spike',
  limitations:'Safety stop only; retrospective association, not causal A/B proof'};
}
module.exports={checkCanary,evidenceFor};

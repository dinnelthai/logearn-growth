'use strict';
// Uses registered read-only business modules, never paid model rounds.
// Results are stored as references to independently owner-verified evidence.
const {makePlan,runPlan}=require('../modulePlanner');
const {scopeKey}=require('./contracts');
// Three bounded, metric-specific competing causes. Query plans are constructed
// from the server-side authorized registry, never from user/model instructions.
const HYPOTHESES={
 active_users:[
  ['acquisition-mix','growth.acquisition','渠道构成或获客规模变化'],
  ['activation-friction','growth.activation','进入筹码峰的路径摩擦'],
  ['tracking-quality','growth.quality','事件采集、覆盖及身份水位变化']],
 new_users:[
  ['acquisition-mix','growth.acquisition','新获客来源变化'],
  ['first-value-friction','growth.activation','首次筹码分析路径摩擦'],
  ['login-observation','growth.login','登录与首次分析的观测关系']],
 returning_users:[
  ['retention-friction','growth.retention','已有分析用户回访发生变化'],
  ['activation-repeat','growth.activation','回访路径的筹码峰进入摩擦'],
  ['tracking-quality','growth.quality','回访事件与身份覆盖变化']]
};
function investigationQuestions(metric){
 const hypotheses=HYPOTHESES[metric];
 return hypotheses?hypotheses.map(([kind,moduleId,question])=>({kind,moduleId,question})):[];
}
function evidenceForProblem(store,owner,problemId){
 const p=store.problem(owner,problemId);
 if(!p||p.type!=='business'||!['open','monitoring'].includes(p.status))return null;
 const events=store.problemEvents(owner,problemId);
 for(const row of events.slice().reverse()){
  const ids=row.evidenceIds||[];
  if(ids.length<2)continue;
  const evidence=ids.map(id=>store.getEvidence(owner,id));
  if(evidence.length===2&&evidence.every(x=>x?.state==='verified'&&x.scope?.source==='all'&&
    x.value!==null&&Number.isFinite(x.value)&&x.period?.timezone==='Asia/Bangkok')&&
    evidence[0].metricId===evidence[1].metricId&&
    evidence[0].unit===evidence[1].unit&&
    evidence[0].source===evidence[1].source&&
    scopeKey(evidence[0].scope)===scopeKey(evidence[1].scope)&&
    evidence[0].definitionVersion===evidence[1].definitionVersion&&
    evidence[0].period.end!==evidence[1].period.end&&
    // Exclude overlapping periods and compare only same-duration neighboring days.
    evidence[0].period.end-evidence[0].period.start===evidence[1].period.end-evidence[1].period.start&&
    Math.abs(evidence[0].period.end-evidence[1].period.end)===
     evidence[0].period.end-evidence[0].period.start){
   const current=evidence[0].period.end>evidence[1].period.end?evidence[0]:evidence[1];
   return {problem:p,sourceEvidence:current};
  }
 }
 return null;
}
async function investigateOwner({store,ownerId,now=Date.now(),registry=null,
 verifyExternalEvidence=null,maxCalls=3}={}){
 if(!store?.executiveInvestigationStart||typeof ownerId!=='string'||!ownerId||
  !Number.isSafeInteger(now)||!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>3)
  throw Error('自动调查要求可信owner、读预算与存储');
 const selected=store.problems(ownerId,{limit:100}).filter(p=>p.type==='business'&&p.priority>=3)
  .sort((a,b)=>b.priority-a.priority||a.first_seen-b.first_seen)
  .map(p=>evidenceForProblem(store,ownerId,p.id))
  .find(x=>x&&investigationQuestions(x.sourceEvidence.metricId).length>0);
 if(!selected)return {status:'no-eligible-problem',modelCalls:0,paidCalls:0,externalActions:0};
 const {problem,sourceEvidence}=selected;
 const run=store.executiveInvestigationStart(ownerId,problem.id,sourceEvidence.id);
 if(run.reused||run.status==='busy')return {status:run.state||run.status||'reused',reused:true,
  runId:run.id||null,modelCalls:0,paidCalls:0,externalActions:0};
 if(!registry||typeof verifyExternalEvidence!=='function'){
  store.executiveInvestigationFail(ownerId,run.id);
  return {status:'registry-not-authorized',modelCalls:0,paidCalls:0,externalActions:0};
 }
 try{
  const ctx={ownerId,runId:run.id,scope:{source:'all'},period:sourceEvidence.period};
  // Build capabilities at the time of execution. No dynamic SQL, model input,
  // free-text tool instructions, paid adapters or arbitrary destination.
  const hypotheses=investigationQuestions(sourceEvidence.metricId);
  const ids=hypotheses.map(x=>x.moduleId);
  const plan=makePlan(registry,ctx,{goal:sourceEvidence.metricId==='returning_users'?
   'retention':'activation',mode:'full',moduleIds:ids,maxCalls});
  const out=await runPlan(registry,ctx,plan);
  const valid=[];
  for(const id of [...new Set(out.evidenceIds||[])].slice(0,20)){
   if(verifyExternalEvidence(ownerId,id,ctx)===true)valid.push(id);
  }
  const saved=store.executiveInvestigationFinish(ownerId,run.id,{
   sourceEvidenceId:sourceEvidence.id,evidenceIds:valid,
   steps:(out.steps||[]).slice(0,3).map(x=>({moduleId:x.moduleId,
    capabilityId:x.capabilityId||null,status:x.status,
    evidenceIds:(x.evidenceIds||[]).filter(id=>valid.includes(id))})),
   hypotheses:hypotheses.map(x=>{
    const step=(out.steps||[]).find(s=>s.moduleId===x.moduleId);
    const evidenceIds=(step?.evidenceIds||[]).filter(id=>valid.includes(id));
    return {kind:x.kind,moduleId:x.moduleId,question:x.question,evidenceIds,
     status:!step?'not-inspected':step.status!=='ok'?'blocked':
      evidenceIds.length?'observed-not-causal':'coverage-unverified'};
   })},{
   verifyExternalEvidence:(owner,id)=>verifyExternalEvidence(owner,id,ctx)===true});
  return {status:saved.result?.status||'partial',runId:run.id,
   modulesInspected:(out.steps||[]).length,agentEvidenceIds:valid.length,
   modelCalls:0,paidCalls:0,externalActions:0};
 }catch{
  store.executiveInvestigationFail(ownerId,run.id);
  return {status:'source-unavailable',runId:run.id,modelCalls:0,paidCalls:0,externalActions:0};
 }
}
module.exports={investigateOwner,evidenceForProblem,investigationQuestions};

'use strict';
// Uses registered read-only business modules, never paid model rounds.
// Results are stored as references to independently owner-verified evidence.
const {makePlan,runPlan}=require('../modulePlanner');
function evidenceForProblem(store,owner,problemId){
 const p=store.problem(owner,problemId);
 if(!p||p.type!=='business'||!['open','monitoring'].includes(p.status))return null;
 const events=store.problemEvents(owner,problemId);
 for(const row of events.slice().reverse()){
  const ids=row.evidenceIds||[];
  if(ids.length<2)continue;
  const evidence=ids.map(id=>store.getEvidence(owner,id));
  if(evidence.length===2&&evidence.every(x=>x?.state==='verified'&&x.scope?.source==='all')&&
    evidence[0].metricId===evidence[1].metricId&&
    evidence[0].definitionVersion===evidence[1].definitionVersion){
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
  .map(p=>evidenceForProblem(store,ownerId,p.id)).find(Boolean);
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
  const ids=['growth.activation','growth.acquisition','growth.quality'];
  const plan=makePlan(registry,ctx,{goal:'activation',mode:'full',moduleIds:ids,maxCalls});
  const out=await runPlan(registry,ctx,plan);
  const valid=[];
  for(const id of [...new Set(out.evidenceIds||[])].slice(0,20)){
   if(verifyExternalEvidence(ownerId,id,ctx)===true)valid.push(id);
  }
  const saved=store.executiveInvestigationFinish(ownerId,run.id,{
   sourceEvidenceId:sourceEvidence.id,evidenceIds:valid,
   steps:(out.steps||[]).slice(0,3).map(x=>({moduleId:x.moduleId,status:x.status}))},{
   verifyExternalEvidence:(owner,id)=>verifyExternalEvidence(owner,id,ctx)===true});
  return {status:saved.result?.status||'partial',runId:run.id,
   modulesInspected:(out.steps||[]).length,agentEvidenceIds:valid.length,
   modelCalls:0,paidCalls:0,externalActions:0};
 }catch{
  store.executiveInvestigationFail(ownerId,run.id);
  return {status:'source-unavailable',runId:run.id,modelCalls:0,paidCalls:0,externalActions:0};
 }
}
module.exports={investigateOwner,evidenceForProblem};

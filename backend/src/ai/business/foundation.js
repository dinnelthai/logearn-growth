const {createContextStore}=require('./context'),{createEvidenceStore,reportEvidence,validateClaims}=require('./evidence'),{createTraceStore}=require('./trace');
function createFoundation(db,registry){
 const contextStore=createContextStore(db),evidenceStore=createEvidenceStore(db),traceStore=createTraceStore(db);
 function prepare(report,{ownerId,runId,goalRef}){
  const base={ownerId,runId,scope:report.business.scope,period:report.period};
  if(goalRef)contextStore.pinRun(ownerId,runId,goalRef.id,goalRef.version);
  const context={...report,goal:contextStore.getRunGoal(ownerId,runId),changes:contextStore.listChanges(ownerId),evidence:reportEvidence(report,base,evidenceStore),capabilities:registry.listCapabilities(base)};
  function validate(analysis){
   analysis.claims=validateClaims(analysis.claims,base,evidenceStore);
   for(const s of analysis.suggestions){if(!Array.isArray(s.evidence?.evidenceIds)||!s.evidence.evidenceIds.length)throw Error('建议必须引用证据ID');for(const id of s.evidence.evidenceIds)evidenceStore.get(id,base);}
  }
  async function investigate(query){const {tool,input}=query;if(typeof tool!=='string')throw Error('请从能力目录选择调查工具');return registry.executeTool(tool,input||{},base);}
  return {context,validate,investigate,traceStore};
 }
 // Uses the exact already-persisted context, without fetching a new report or
 // recomputing a new baseline snapshot after a process crash.
 function resume(context,{ownerId,runId}){
  if(!context||!ownerId||!runId||
     !context.business?.scope||!context.period||!Array.isArray(context.evidence))
    throw Error('恢复上下文与任务身份不一致');
  const base={ownerId,runId,scope:context.business.scope,period:context.period};
  function validate(analysis){
   analysis.claims=validateClaims(analysis.claims,base,evidenceStore);
   for(const s of analysis.suggestions){
    if(!Array.isArray(s.evidence?.evidenceIds)||!s.evidence.evidenceIds.length)throw Error('建议必须引用证据ID');
    for(const id of s.evidence.evidenceIds)evidenceStore.get(id,base);
   }
  }
  const investigate=query=>{
   if(typeof query?.tool!=='string')throw Error('仅允许恢复已声明的只读调查工具');
   return registry.executeTool(query.tool,query.input||{},base);
  };
  return {context,validate,investigate,traceStore};
 }
 return {prepare,resume,contextStore,traceStore};
}
function defaultFoundation(){const db=require('../../db/connection');return createFoundation(db,require('./tools/registry').defaultRegistry());}
module.exports={createFoundation,defaultFoundation};

const {compactChanges}=require('./contextBudget');
const {createContextStore}=require('./context'),{createEvidenceStore,reportEvidence,validateClaims}=require('./evidence'),{createTraceStore}=require('./trace');
const {validateEvidenceReferences}=require('./analysisContract');
// The planner selects read-only skills before the model context is persisted.
// Keep the full catalog for legacy reports without a plan.
function modelCapabilities(registry,base,plan){
 const catalog=registry.listCapabilities(base);
 if(!Array.isArray(plan?.steps)||!plan.steps.length)return catalog;
 const allowed=new Set(['query_metrics']);
 for(const step of plan.steps)for(const id of step.tools||[])allowed.add(id);
 return catalog.filter(tool=>allowed.has(tool.id))
  .map(({id,version,description,inputSchema,supportedScopes})=>
   ({id,version,description,inputSchema,supportedScopes}));
}
function createFoundation(db,registry){
 const contextStore=createContextStore(db),evidenceStore=createEvidenceStore(db),traceStore=createTraceStore(db);
 function prepare(report,{ownerId,runId,goalRef}){
  const base={ownerId,runId,scope:report.business.scope,period:report.period};
  if(goalRef)contextStore.pinRun(ownerId,runId,goalRef.id,goalRef.version);
  const changeView=compactChanges(contextStore.listChanges(ownerId));
  const context={...report,goal:contextStore.getRunGoal(ownerId,runId),
   changes:changeView.items,changesMeta:changeView.meta,
   evidence:reportEvidence(report,base,evidenceStore),
   capabilities:modelCapabilities(registry,base,report.growthPlan)};
  function validate(analysis){
   validateEvidenceReferences(analysis,base,evidenceStore,validateClaims);
  }
  // Only server-selected tools may execute, not merely appear in the model prompt.
  const authorized={...base,taskAllowedTools:context.capabilities.map(cap=>cap.id)};
  async function investigate(query){const {tool,input}=query;if(typeof tool!=='string')throw Error('请从能力目录选择调查工具');return registry.executeTool(tool,input||{},authorized);}
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
   validateEvidenceReferences(analysis,base,evidenceStore,validateClaims);
  }
  // A resumed call cannot gain tools absent from its persisted task catalog.
  // Also intersect with the LIVE catalog, so revocations survive process restarts.
  const savedIds=new Set((Array.isArray(context.capabilities)?context.capabilities:
   registry.listCapabilities(base)).map(tool=>tool.id));
  const liveIds=new Set(registry.listCapabilities(base).map(tool=>tool.id));
  const authorized={...base,taskAllowedTools:[...savedIds].filter(id=>liveIds.has(id))};
  const investigate=query=>{
   if(typeof query?.tool!=='string')throw Error('仅允许恢复已声明的只读调查工具');
   return registry.executeTool(query.tool,query.input||{},authorized);
  };
  return {context,validate,investigate,traceStore};
 }
 return {prepare,resume,contextStore,traceStore};
}
function defaultFoundation(){const db=require('../../db/connection');return createFoundation(db,require('./tools/registry').defaultRegistry());}
module.exports={createFoundation,defaultFoundation,modelCapabilities};

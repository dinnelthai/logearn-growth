'use strict';
// OPT-IN TECHNICAL PILOT ONLY. Existing business runner stays the default.
// This graph does not invoke a language model and cannot create paid calls.
// Install/pin @langchain/langgraph and @langchain/langgraph-checkpoint-postgres
// only after compatibility and PostgreSQL migration are verified on staging.
const {createHash}=require('node:crypto');
const TOOL_SET=Object.freeze(['check_data_quality','get_funnel','get_retention']);
function threadId(ownerId,problemId,runId){
 if(!ownerId||!problemId||!runId)throw Error('缺少图身份');
 return 'growth-v1-'+createHash('sha256').update(JSON.stringify([ownerId,problemId,runId])).digest('hex').slice(0,48)
}
function validateRequest({ownerId,problemId,runId,start,end,source='all'}){
 if(!ownerId||!problemId||!runId||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
  start>=end||end-start>31*86400000||start<0||source!=='all')throw Error('试点调查范围无效');
 return {ownerId,problemId,runId,start,end,source};
}
async function buildPilot({registry,store,hasPaidCalls,postgresConnectionString,enabled=false}={}){
 if(!enabled||process.env.GROWTH_LANGGRAPH_PILOT_ENABLED!=='1')throw Error('LangGraph 试点默认关闭');
 if(!registry?.executeTool||!store?.run||typeof hasPaidCalls!=='function')throw Error('权限/付费防重依赖缺失');
 if(typeof postgresConnectionString!=='string'||!/^postgres(ql)?:\/\//.test(postgresConnectionString))throw Error('仅允许 PostgreSQL 持久化检查点');
 let graphLibrary,checkpointLibrary;
 try{[graphLibrary,checkpointLibrary]=await Promise.all([import('@langchain/langgraph'),import('@langchain/langgraph-checkpoint-postgres')])}
 catch(e){throw Error('LangGraph 依赖尚未完成兼容安装与版本锁定：'+e.code)}
 const {Annotation,StateGraph,START,END,interrupt,Command}=graphLibrary;
 const {PostgresSaver}=checkpointLibrary;
 const saver=PostgresSaver.fromConnString(postgresConnectionString,{schema:'public'});
 // The operator must approve schema changes before first invoking setup().
 // Never call setup() implicitly during a production request.
 const State=Annotation.Root({ownerId:Annotation(),problemId:Annotation(),runId:Annotation(),
  start:Annotation(),end:Annotation(),source:Annotation(),quality:Annotation(),
  evidenceIds:Annotation({reducer:(a,b)=>[...new Set([...(a||[]),...(b||[])])],default:()=>[]}),
  toolErrors:Annotation({reducer:(a,b)=>[...(a||[]),...(b||[])],default:()=>[]}),
  answer:Annotation(),waitingQuestion:Annotation()});
 const pipeline=new StateGraph(State)
  .addNode('load',s=>({quality:'unverified'}))
  .addNode('quality',async s=>{
   const result=await registry.executeTool('check_data_quality',{scope:{source:'all'},start:s.start,end:s.end},
    {ownerId:s.ownerId,runId:s.runId,scope:{source:'all'},period:{start:s.start,end:s.end}});
   return {quality:result.status==='ok'?'checked':'unavailable',evidenceIds:(result.evidence||[]).map(x=>x.id),
    toolErrors:result.status==='ok'?[]:['quality-unavailable']}
  })
  .addNode('funnel',async s=>readOne('get_funnel',s))
  .addNode('retention',async s=>readOne('get_retention',s))
  .addNode('conclude',s=>({quality:s.toolErrors?.length?'partial':'sources-checked'}))
  .addEdge(START,'load').addEdge('load','quality').addEdge('quality','funnel')
  .addEdge('funnel','retention').addEdge('retention','conclude').addEdge('conclude',END);
 async function readOne(id,s){if(!TOOL_SET.includes(id))throw Error('未授权工具');
  const result=await registry.executeTool(id,{scope:{source:'all'},start:s.start,end:s.end},
   {ownerId:s.ownerId,runId:s.runId,scope:{source:'all'},period:{start:s.start,end:s.end}});
  if(result.status!=='ok')return {toolErrors:[id+':unknown']};
  return {evidenceIds:(result.evidence||[]).map(x=>x.id)};
 }
 const compiled=pipeline.compile({checkpointer:saver});
 async function invoke(input){const req=validateRequest(input);
  const found=store.run(req.ownerId,req.runId);
  if(!found||found.problem_id!==req.problemId||!['queued','running'].includes(found.state))throw Error('调查运行身份或状态无效');
  // Refuse graph execution even for an already-reserved unknown paid call.
  if(await hasPaidCalls(req.runId,req.ownerId))throw Error('存在付费调用历史：禁止图自动重放');
  return compiled.invoke(req,{configurable:{thread_id:threadId(req.ownerId,req.problemId,req.runId)}});
 }
 return {invoke,threadId,saver,graph:compiled,toolIds:TOOL_SET};
}
module.exports={buildPilot,threadId,validateRequest,TOOL_SET};

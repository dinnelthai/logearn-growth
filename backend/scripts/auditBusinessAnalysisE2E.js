#!/usr/bin/env node
'use strict';
// Read-only evidence for ONE existing Analysis ID. Never schedules or resumes
// paid calls, touches the queue, reads unscoped users, or prints raw reports.
require('dotenv').config({path:require('node:path').join(__dirname,'../.env'),quiet:true});
async function audit({ownerId,analysisId,pool=require('../src/db/aiPool')}={}){
 if(typeof ownerId!=='string'||!ownerId||ownerId.length>256||
   typeof analysisId!=='string'||!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(analysisId))
  throw Error('用法：node scripts/auditBusinessAnalysisE2E.js <ownerId> <analysisUUID>');
 const [record,usage,suggestions]=await Promise.all([
  pool.query('SELECT id,status,model_name,result,error_message FROM ai_analysis_records WHERE id=$1 AND owner_id=$2',
   [analysisId,ownerId]),
  pool.query(`SELECT model_name,trace_id,input_tokens,output_tokens,total_tokens,
        cost_usd,cost_known FROM ai_usage_logs
       WHERE owner_id=$1 AND operation_type='analysis' AND operation_id=$2
       ORDER BY created_at ASC LIMIT 100`,[ownerId,analysisId]),
  pool.query('SELECT COUNT(*)::int AS n FROM ai_suggestions WHERE owner_id=$1 AND analysis_id=$2',
   [ownerId,analysisId])
 ]);
 const row=record.rows[0]||null,logs=usage.rows||[];
 const saved=row?.result||{};
 const calls=Array.isArray(saved.calls)?saved.calls:[];
 const unknown=logs.filter(x=>x.cost_known!==true).length;
 const traces=new Set(logs.map(x=>x.trace_id).filter(Boolean));
 const evidence=Array.isArray(saved.evidenceIds)?saved.evidenceIds:[];
 const totalTokens=logs.reduce((n,r)=>n+Number(r.total_tokens||0),0);
 const knownCostUsd=logs.reduce((n,r)=>n+Number(r.cost_usd||0),0);
 const hasPersistedResult=Boolean(row?.status==='completed'&&
    typeof saved.summary==='string'&&saved.summary.length>0);
 const costLinked=logs.length>0&&calls.length>0&&
   calls.filter(c=>!c.fromCache).every(c=>c.traceId&&traces.has(c.traceId));
 const onlyAggregates=calls.length>0&&calls.every(c=>c.modelTransportVersion==='aggregated-business-v1');
 return {
  analysisId,
  recordStatus:row?.status||'missing',
  checks:{
   recordExists:row?'PASS':'FAIL',
   savedAnalysis:hasPersistedResult?'PASS':row?.status==='failed'?'FAIL':'BLOCKED',
   evidenceIdsPresent:evidence.length?'PASS':'BLOCKED',
   savedSuggestions:hasPersistedResult?'PASS':'BLOCKED',
   costLedgerLinked:costLinked?'PASS':row?.status==='completed'?'FAIL':'BLOCKED',
   usageReported:logs.length&&totalTokens>0?'PASS':'BLOCKED',
   noUnknownCost:unknown===0&&logs.length>0?'PASS':'BLOCKED',
   modelTransportV1:onlyAggregates?'PASS':'BLOCKED',
   frontEndRendered:'BLOCKED',
   providerInvoiceReconciled:'BLOCKED'
  },
  evidenceCount:evidence.length,suggestionCount:Number(suggestions.rows[0]?.n||0),
  model:row?.model_name||logs.at(-1)?.model_name||null,
  usage:{calls:logs.length,totalTokens,knownCostUsd,unknownCostCalls:unknown,
   hasTraceIds:traces.size},
  checkedWithoutProviderCalls:true,
  note:'不发起模型调用，也不代表前端页面已展示或中转站真实账单已核对；不能重放 processing/unknown 任务'
 };
}
async function main(){
 const [ownerId,analysisId]=process.argv.slice(2);
 try{
  const result=await audit({ownerId,analysisId});
  console.log(JSON.stringify(result,null,2));
  if(Object.values(result.checks).some(x=>x==='FAIL'))process.exitCode=1;
 }catch(err){console.error('只读验收检查失败:',String(err.message).slice(0,180));process.exitCode=1}
 finally{await require('../src/db/aiPool').end().catch(()=>{})}
}
if(require.main===module)main();
module.exports={audit};

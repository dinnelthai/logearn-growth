'use strict';
const {decideRecovery}=require('./recoveryDecision');
const {randomUUID}=require('node:crypto');

// One preflight for every Bull delivery. No model calls unless journal is empty
// AND PostgreSQL confirms an atomic pending -> processing transition.
async function claimSafeAnalysis({analysisId,ownerId,records,traceStore}) {
  const record=await records.getAnalysisRecord(analysisId,ownerId);
  if(!record)throw Object.assign(Error('分析记录不存在或无权限'),{status:404});
  if(record.status==='completed')return {action:'completed',result:record.result};
  // Never read another owner's journal before verifying record ownership.
  const rows=traceStore.list(ownerId,analysisId);
  const verdict=decideRecovery({record,rows});
  if(rows.length)throw Object.assign(Error('已有模型调用记录，禁止 Worker 盲目重新执行'),{status:409,reason:verdict.reason});
  if(record.status!=='pending')throw Object.assign(Error('任务正在执行或已经结束，禁止重复执行'),{status:409});
  const token=randomUUID();
  const claimed=await records.claimAnalysisExecution(analysisId,ownerId,token);
  if(!claimed)throw Object.assign(Error('任务已被其他 Worker 领取，禁止重复执行'),{status:409});
  return {action:'claimed',record:claimed,token};
}
module.exports={claimSafeAnalysis};

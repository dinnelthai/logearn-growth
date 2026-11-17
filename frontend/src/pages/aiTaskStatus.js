// UI guidance follows backend checkpointState + retrySafety.
// These flags are not authorization: the server must re-check the paid-call
// ledger and checkpoint journal before any model work can start.
export const TASK_LABELS=Object.freeze({
  pending:'等待执行',processing:'分析中',completed:'已完成',failed:'失败',
  adopted:'已采纳',executed:'已执行',executing:'执行中',
  rejected:'已拒绝',invalid:'已失效'
});

export function displayTaskStatus(record,checkpoint=null){
  const status=record?.status||'unknown';
  if(record?.cancel_requested)return {text:'已申请取消',tone:'warning',kind:'attention'};
  if(checkpoint?.recordStatus==='processing' && checkpoint.requiresHumanReview){
    return {text:'需要人工处理',tone:'warning',kind:'attention'};
  }
  const kind=status==='completed'?'completed':status==='failed'?'failed':
    status==='processing'?'processing':status==='pending'?'pending':'unknown';
  return {text:TASK_LABELS[status]||status,tone:status==='completed'?'success':status==='failed'?'danger':'neutral',kind};
}

// This is an explicitly manual action. A lease expiry always requires
// human review per backend, so do NOT require requiresHumanReview=false.
// Only offer it for a complete journal with no pending tool work.
export function canOfferTaskResume(record,checkpoint){
  return record?.status==='processing' && !record?.cancel_requested &&
    checkpoint?.recordStatus==='processing' &&
    checkpoint?.leaseExpired===true &&
    checkpoint?.requiresHumanReview===true &&
    checkpoint?.state==='recorded' &&
    checkpoint?.reason==='requires-validation-before-resume' &&
    Number.isSafeInteger(checkpoint?.modelCalls) && checkpoint.modelCalls>0 &&
    Number.isSafeInteger(checkpoint?.completedRounds) && checkpoint.completedRounds>0 &&
    checkpoint?.pendingTools===0;
}

// The backend retry policy only permits failed tasks with NO journal calls
// and NO shared paid calls. Shared calls are server-only; final denial remains
// authoritative and must be displayed to the operator.
export function canOfferTaskRetry(record,checkpoint){
  return record?.status==='failed' && !record?.cancel_requested &&
    checkpoint?.recordStatus==='failed' &&
    checkpoint?.requiresHumanReview===false &&
    checkpoint?.state==='not-started' &&
    checkpoint?.reason==null &&
    checkpoint?.modelCalls===0 &&
    checkpoint?.completedRounds===0 &&
    checkpoint?.pendingTools===0;
}

export function shouldPollTask(record,checkpoint){
  return ['pending','processing'].includes(record?.status) &&
    !record?.cancel_requested &&
    !checkpoint?.requiresHumanReview &&
    !['blocked','partial-tools'].includes(checkpoint?.state);
}

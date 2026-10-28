// Display-only AI task status and conservative recovery policy.
// Never infer permission to dispatch a paid call from a lease timeout alone.
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

export function canOfferTaskResume(record,checkpoint){
  return record?.status==='processing' &&
    checkpoint?.recordStatus==='processing' &&
    checkpoint?.leaseExpired===true &&
    checkpoint?.requiresHumanReview!==true &&
    checkpoint?.pendingTools===0 &&
    !['blocked','partial-tools'].includes(checkpoint?.state) &&
    !['unresolved-paid-call','tool-execution-incomplete','noncontiguous-rounds'].includes(checkpoint?.reason);
}

export function canOfferTaskRetry(record,checkpoint){
  if(record?.status!=='failed'||record?.cancel_requested||!checkpoint)return false;
  return checkpoint?.requiresHumanReview!==true &&
    checkpoint?.pendingTools===0 &&
    !['blocked','partial-tools'].includes(checkpoint?.state) &&
    !['unresolved-paid-call','tool-execution-incomplete','noncontiguous-rounds'].includes(checkpoint?.reason);
}

export function shouldPollTask(record,checkpoint){
  return ['pending','processing'].includes(record?.status) &&
    !record?.cancel_requested &&
    !checkpoint?.requiresHumanReview &&
    !['blocked','partial-tools'].includes(checkpoint?.state);
}

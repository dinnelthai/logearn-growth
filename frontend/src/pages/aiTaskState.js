// Presentation-only projection of the persisted AI analysis record and read-only
// checkpoint. Never grants permission to retry or replay paid model calls.
const LABELS = {
  queued: '排队中', running: '运行中', blocked: '需要人工处理',
  completed: '已完成', failed: '失败', cancelled: '已取消',
  unknown: '状态未知 / 同步异常'
};
const REASONS = {
  'unresolved-paid-call': '模型调用结果尚未确认，禁止直接重试',
  'tool-execution-incomplete': '调查工具执行不完整，必须人工核查',
  'requires-validation-before-resume': '恢复前尚需核验调用与调查记录',
  'noncontiguous-rounds': '模型执行记录不连续，需人工核查',
  'incomplete-received-response': '模型响应记录不完整，需人工核查',
  'prompt-version-mismatch': '提示词版本与调查记录不一致',
  'invalid-tool-checkpoints': '工具检查点记录异常',
  'tool-checkpoint-mismatch': '工具检查点不一致',
  'invalid-investigations': '调查步骤格式异常',
  'invalid-response-shape': '模型结果格式异常'
};
const parseTime = v => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
export const checkpointReason = reason => REASONS[reason] || reason || null;

export function deriveAnalysisState(record, checkpoint, now = Date.now()) {
  const status = record?.status;
  const id = record?.id || null;
  const lastUpdated = parseTime(record?.updated_at) ||
    parseTime(record?.completed_at) || parseTime(record?.created_at);
  const active = status === 'processing' || status === 'pending';
  const checkpointMismatch = checkpoint &&
    ((checkpoint.analysisId && id && checkpoint.analysisId !== id) ||
      (checkpoint.recordStatus && checkpoint.recordStatus !== status));
  let key = 'unknown';
  if (!record || checkpointMismatch) key = 'unknown';
  else if (record.cancel_requested && status === 'failed') key = 'cancelled';
  else if (status === 'completed') key = record.result != null ? 'completed' : 'unknown';
  else if (status === 'failed') key = 'failed';
  else if (active && checkpoint &&
    (checkpoint.requiresHumanReview || checkpoint.leaseExpired ||
      checkpoint.state === 'blocked' || checkpoint.state === 'partial-tools' ||
      Number(checkpoint.pendingTools) > 0)) key = 'blocked';
  else if (status === 'pending') key = 'queued';
  else if (status === 'processing' && checkpoint) key = 'running';
  // A processing record without a checkpoint cannot establish that work continues.
  const reason = checkpointMismatch
    ? '持久化状态与检查点不一致，请刷新或检查诊断'
    : key === 'blocked'
      ? checkpointReason(checkpoint?.reason) || '执行已阻塞或需要人工核查，不允许自动续跑'
      : key === 'unknown'
        ? '无法从当前后端数据确认任务状态'
        : key === 'failed'
          ? record.error_message || '任务已终止，具体原因请查看诊断'
          : key === 'cancelled' ? '后端已确认取消' : null;
  const stale = active && lastUpdated != null && now - lastUpdated > 5 * 60 * 1000;
  return {
    key, label: LABELS[key], taskId: id, backendStatus: status ?? null,
    lastUpdated, stale, reason,
    canCancel: (['queued','running'].includes(key) ||
      (key === 'blocked' && status === 'processing')) && !record?.cancel_requested,
    // Only show retry for a failure with a verified, empty model-call journal.
    // The server still makes the final paid-call safety decision.
    canRetry: key === 'failed' && checkpoint?.state === 'not-started' &&
      checkpoint?.modelCalls === 0 && !checkpoint?.requiresHumanReview,
    // Current checkpoint API explicitly returns canAutoResume:false.
    // Do not convert lease expiration into permission to replay model calls.
    canResume: key === 'blocked' && checkpoint?.canAutoResume === true &&
      !checkpoint?.requiresHumanReview && checkpoint?.leaseExpired === true &&
      Number(checkpoint?.pendingTools) === 0
  };
}

export function formatAnalysisTime(value) {
  const n = parseTime(value);
  return n == null ? '未知' : new Date(n).toLocaleString('zh-CN', {timeZone:'Asia/Bangkok'});
}

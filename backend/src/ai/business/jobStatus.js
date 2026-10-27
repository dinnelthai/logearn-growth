'use strict';

// Bull retains only a bounded number of jobs. The database record is the
// durable source of truth once a queue job has been pruned. Do not pretend
// an absent queue job is actively running or resumable.
function statusFromRecord(record, requestedJobId) {
  if (!record) return null;
  const status = record.status;
  const terminal = status === 'completed' || status === 'failed';
  return {
    jobId: requestedJobId,
    state: terminal ? status : 'unknown',
    recordStatus: status,
    source: 'analysis-record',
    progress: status === 'completed' ? 100 : null,
    result: status === 'completed' ? record.result ?? null : null,
    error: status === 'failed' ? record.error_message ?? null : null,
    resumable: false
  };
}
module.exports = {statusFromRecord};

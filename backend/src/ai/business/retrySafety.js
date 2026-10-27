'use strict';

// Retry policy deliberately fails closed. A received response also represents
// paid work and cannot safely be replayed from the beginning of the analysis.
function assessRetry(record, calls) {
  if (!record || record.status !== 'failed') return {allowed:false, reason:'not-failed'};
  if (!Array.isArray(calls)) return {allowed:false, reason:'trace-unavailable'};
  if (calls.length) return {allowed:false, reason:'prior-model-call', calls:calls.length};
  return {allowed:true, reason:'no-model-call'};
}
module.exports={assessRetry};

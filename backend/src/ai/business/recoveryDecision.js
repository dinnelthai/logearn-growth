'use strict';
const {reconstructTranscript}=require('./transcriptRecovery');

// Pure policy: assessment is never permission to replay paid requests or tools.
// Keeps operational decisions separate from persistence and business logic.
function decideRecovery({record,rows,systemPrompt,context,operationType='analysis'}) {
  const blocked=(reason,details={})=>({
    decision:'blocked',reason,canAutoResume:false,requiresHumanReview:true,
    completedRounds:details.completedRounds||0,completedTools:details.completedTools||0,
    pendingTools:details.pendingTools||0
  });
  if(!record || !['pending','processing','failed','completed'].includes(record.status))
    return blocked('record-unavailable');
  if(record.status==='completed')
    return {decision:'use-stored-result',reason:'already-completed',canAutoResume:false,
      requiresHumanReview:false,completedRounds:0,completedTools:0,pendingTools:0};
  if(!Array.isArray(rows))return blocked('journal-unavailable');
  // No paid call has started: the owner can use the existing protected retry flow.
  // A fresh job must still be enqueued through the normal authenticated API.
  if(rows.length===0){
    return record.status==='failed'
      ? {decision:'eligible-for-existing-retry',reason:'no-model-calls',
          canAutoResume:false,requiresHumanReview:false,completedRounds:0,completedTools:0,pendingTools:0}
      : blocked('active-or-pending-record');
  }
  let reconstructed;
  try {reconstructed=reconstructTranscript({rows,systemPrompt,context,operationType})}
  catch {return blocked('reconstruction-unavailable')}
  const details=reconstructed.inspection||{};
  if(reconstructed.state!=='reconstructed')return blocked(reconstructed.reason||'invalid-checkpoint',details);
  return {
    decision:'manual-recovery-review',
    reason:'verified-transcript-requires-execution-review',
    canAutoResume:false,requiresHumanReview:true,
    completedRounds:details.completedRounds||0,
    completedTools:details.completedTools||0,
    pendingTools:details.pendingTools||0
  };
}
module.exports={decideRecovery};

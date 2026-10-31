'use strict';

// Only direct semantic matches are eligible. The fixed-cohort service measures
// analysis_users; it must not be silently substituted for registration,
// activation-rate, retention, or trade-conversion metrics.
const COHORT_METRICS=Object.freeze({active_users:'analysis_users'});
function classifyRetrospectiveOutcome(row){
 if(row?.review_context_version!=='2')return null;
 const metric=row.validation_metrics?.primary;
 const cohortMetric=COHORT_METRICS[metric];
 const base=row.baseline_data?.operationTaskCohort;
 const effect=row.effect_data?.operationTaskCohort;
 const insufficient=(reason,details={})=>({assessment:'insufficient',reason,metric,
  cohortMetric:cohortMetric||null,...details,
  caveat:'固定人群前后观察只说明同期变化，不证明运营行动造成结果'});
 if(!cohortMetric)return insufficient('primary-metric-has-no-direct-cohort-equivalent');
 if(!base||base.status!=='available'||!base.metrics||!effect)
  return insufficient('fixed-cohort-evidence-unavailable');
 const baseline=base.metrics[cohortMetric],after=effect[cohortMetric];
 const baselineCount=base.metrics.requested_users,effectCount=effect.requested_users;
 const baselineUnmatched=base.metrics.unmatched_users,effectUnmatched=effect.unmatched_users;
 if(!Number.isFinite(baseline)||!Number.isFinite(after)||
  !Number.isSafeInteger(baselineCount)||baselineCount<1||effectCount!==baselineCount||
  baselineUnmatched!==0||effectUnmatched!==0)
  return insufficient('fixed-cohort-coverage-incomplete',{
   baselineCount:Number.isSafeInteger(baselineCount)?baselineCount:null,
   effectCount:Number.isSafeInteger(effectCount)?effectCount:null,
   baselineUnmatched,effectUnmatched
  });
 if(!['high','medium'].includes(row.confidence||row.review_confidence))
  return insufficient('retrospective-confidence-insufficient');
 // Distinguish an unavailable judgement from an explicit conflict with the
 // verified fixed-cohort direction. Neither case proves intervention causality.
 const observedDirection=after>baseline?'up':after<baseline?'down':'flat';
 const judgementAvailable=typeof row.has_improvement==='boolean';
 const judgementConflict=judgementAvailable&&row.has_improvement!==(after>baseline);
 let assessment='insufficient',reason=judgementConflict?
  'retrospective-judgement-conflicts-with-fixed-cohort-trend':
  'retrospective-judgement-unavailable';
 if(!judgementConflict&&row.has_improvement===true){
  assessment='observed-supported';reason='fixed-cohort-primary-metric-increased';
 }else if(!judgementConflict&&row.has_improvement===false){
  assessment='observed-contradicted';reason='fixed-cohort-primary-metric-did-not-increase';
 }
 return {assessment,reason,metric,cohortMetric,baseline,effect:after,
  absolute:after-baseline,observedDirection,judgementConflict,
  requestedUsers:baselineCount,
  periods:base.periods||null,snapshot:base.snapshot||null,
  hasCausality:false,
  caveat:'固定人群前后观察只说明同期变化，不证明运营行动造成结果'};
}
module.exports={COHORT_METRICS,classifyRetrospectiveOutcome};

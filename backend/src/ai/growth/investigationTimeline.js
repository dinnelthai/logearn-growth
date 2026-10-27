'use strict';

// A read-only, owner-scoped view of one anomaly-to-action lifecycle.
// No calls to model providers, task queues or external operational services.
const records=require('../../db/aiRecords');
const {createInvestigationStore}=require('./investigationStore');
const {createAlertStore}=require('./alertStore');

function stageFor(proposal,analysis,suggestions,retrospectives){
 if(proposal.status==='dismissed')return 'dismissed';
 if(proposal.status==='proposed')return 'awaiting-approval';
 if(!analysis)return 'approved-awaiting-dispatch';
 if(analysis.status==='pending')return 'queued';
 if(analysis.status==='processing')return 'investigating';
 if(analysis.status==='failed')return 'investigation-failed';
 if(analysis.status!=='completed')return 'unknown';
 if(!suggestions.length)return 'analysis-completed-no-action';
 if(suggestions.some(s=>s.user_status==='pending'))return 'awaiting-action-approval';
 if(suggestions.some(s=>['adopted','executing'].includes(s.user_status)))return 'action-in-progress';
 if(suggestions.some(s=>s.user_status==='executed' &&
    !retrospectives.some(r=>r.suggestionId===s.id)))return 'awaiting-retrospective';
 if(retrospectives.length)return 'retrospective-recorded';
 return 'action-closed';
}
function createInvestigationTimeline({
 proposalStore=createInvestigationStore(),
 alertStore=createAlertStore(),
 recordsApi=records
}={}){
 async function get(ownerId,proposalId){
  if(typeof ownerId!=='string'||!ownerId||
    typeof proposalId!=='string'||!proposalId||proposalId.length>256)
   throw Object.assign(Error('调查链路参数无效'),{status:400});
  const proposal=await proposalStore.get(ownerId,proposalId);
  if(!proposal)return null;
  const alert=await alertStore.get(ownerId,proposal.alert_id);
  if(!alert)throw Object.assign(Error('关联告警记录缺失，无法安全展示调查链路'),{status:409});
  let analysis=null,suggestions=[],retrospectives=[];
  if(proposal.analysis_id){
   analysis=await recordsApi.getAnalysisRecord(proposal.analysis_id,ownerId);
   if(!analysis||analysis.owner_id!==ownerId||
      analysis.filter_conditions?.proposalId!==proposal.id ||
      analysis.filter_conditions?.sourceAlertId!==proposal.alert_id){
    throw Object.assign(Error('分析关联不一致或记录不可访问，请核查'),{status:409});
   }
   suggestions=await recordsApi.listSuggestionsByAnalysis(analysis.id,ownerId);
   if(!Array.isArray(suggestions)||suggestions.length>100)
    throw Object.assign(Error('调查建议数量超过工作台的完整展示上限'),{status:409});
   // One owner-scoped SQL fetch, even if the analysis produced many actions.
   const reviews=await recordsApi.listRetrospectivesByAnalysis(analysis.id,ownerId);
   const suggestionIds=new Set(suggestions.map(s=>s.id));
   if(!Array.isArray(reviews)||reviews.some(r=>r.owner_id!==ownerId||
     !suggestionIds.has(r.suggestion_id)))
    throw Object.assign(Error('复盘关联不一致或记录不可访问'),{status:409});
   retrospectives=reviews.map(r=>({
     id:r.id,suggestionId:r.suggestion_id,createdAt:r.created_at,
     conclusion:r.conclusion,confidence:r.confidence,
     hasImprovement:r.has_improvement,hasCausality:r.has_causality,
     lessonsLearned:r.lessons_learned||null
   }));
  }
  const original=proposal.evidence||{};
  const analysisResult=analysis?.result||{};
  const actions=suggestions.map(s=>({
   id:s.id,analysisId:s.analysis_id,priority:s.priority,
   problem:s.business_problem,action:s.action,status:s.user_status,
   evidence:s.data_evidence,validationMetrics:s.validation_metrics,
   actualAction:s.actual_action||null,rejectionReason:s.rejection_reason||null,
   executedAt:s.executed_at||null,
   retrospectiveIds:retrospectives.filter(r=>r.suggestionId===s.id).map(r=>r.id)
  }));
  return {
   version:'growth-investigation-timeline-v1',
   proposal:{id:proposal.id,alertId:proposal.alert_id,status:proposal.status,
    version:proposal.version,periodEnd:Number(proposal.period_end),
    createdAt:proposal.created_at,updatedAt:proposal.updated_at},
   alert:{id:alert.id,metric:alert.metric,source:alert.source,
    goal:alert.goal,priority:alert.priority,direction:alert.direction,
    status:alert.status,latestPeriodEnd:Number(alert.last_period_end)},
   // Proposal evidence is frozen at detection time. Never substitute the
   // alert's newest evidence, which may belong to a later business day.
   originalObservation:{
    baseline:original.baseline??null,observed:original.observed??null,
    absolute:original.absolute??null,fraction:original.fraction??null,
    periodStart:original.periodStart??null,
    periodEnd:original.periodEnd??Number(proposal.period_end),
    evidence:original.evidence||{},
    causality:'unproven'
   },
   stage:stageFor(proposal,analysis,suggestions,retrospectives),
   analysis:analysis?{
    id:analysis.id,status:analysis.status,title:analysis.title,
    createdAt:analysis.created_at,completedAt:analysis.completed_at,
    error:analysis.status==='failed'?analysis.error_message:null,
    summary:analysis.status==='completed'?analysisResult.summary||null:null,
    keyFindings:analysis.status==='completed'?analysisResult.keyFindings||[]:[],
    claims:analysis.status==='completed'?analysisResult.claims||[]:[],
    evidenceIds:analysis.status==='completed'?analysisResult.evidenceIds||[]:[],
    savedGrowthSignals:analysis.status==='completed'?analysisResult.growthSignals||[]:[]
   }:null,
   actions,retrospectives,
   counts:{suggestions:actions.length,executed:actions.filter(a=>a.status==='executed').length,
    retrospectives:retrospectives.length},
   readOnly:true,paidCalls:0,externalActions:0,
   note:'对照观测和模型建议不是因果证明；审批、执行与付费调查由独立接口管理'
  };
 }
 return {get};
}
module.exports={createInvestigationTimeline,stageFor};

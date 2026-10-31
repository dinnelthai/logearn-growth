'use strict';
// Cross-database goal alignment is a comparison, NOT an implicit migration.
// The workspace owns month-specific targets; PostgreSQL daily Agent targets
// are a different horizon and may not be silently overwritten or equated.
function goalAlignment(workspaceGoals,agentTargets){
 if(!Array.isArray(workspaceGoals))throw Error('工作台目标不可用');
 const north=workspaceGoals.filter(g=>g.metric_id==='active_users'&&g.kind==='north'&&
  g.definition_version==='1'&&g.scope?.source==='all');
 if(north.length!==1)return {status:north.length?'ambiguous-monthly-goal':'no-monthly-goal',
  monthlyGoalId:null,agentTargetCount:null,authoritativeSource:'workspace-monthly'};
 const value={monthlyGoalId:north[0].id,monthlyTarget:north[0].target_value,
  authoritativeSource:'workspace-monthly',independentDailyAgentTargets:true,
  interpretation:'月度去重目标与 Agent 每日单日目标不可直接比较，不能自动同步或覆写'};
 if(agentTargets===null)return {...value,status:'agent-target-source-unavailable',agentTargetCount:null};
 if(!Array.isArray(agentTargets))return {...value,status:'agent-target-source-invalid',agentTargetCount:null};
 const daily=agentTargets.filter(t=>t?.active===true&&t.metric==='active_users'&&t.source==='all');
 if(daily.length>1)return {...value,status:'ambiguous-daily-targets',agentTargetCount:daily.length};
 return {...value,status:daily.length?'distinct-period-goals':'monthly-only',
  agentTargetCount:daily.length,dailyTarget:daily[0]?.target??null};
}
function rankOpportunity(problem,observedEvidence,learning){
 const primary=problem.type==='business'&&problem.subject.startsWith('active_users:');
 const dataGap=problem.type==='data-quality';
 const executed=learning?.lessons||[];
 const negative=executed.filter(x=>x.metricId==='active_users'&&x.outcome==='observed-decline').length;
 const evidence=observedEvidence.filter(e=>e?.state==='verified'&&e.scope?.source==='all'&&e.value!==null);
 // Population actually affected and incremental ROI are unknown unless measured
 // by a compatible, attributable cohort. Count deltas are NOT affected users.
 return {problemId:problem.id,subject:problem.subject,kind:problem.type,
  priority:problem.priority,firstSeenAt:problem.first_seen,
  decision:dataGap?'verify-coverage':primary?'investigate-north-star':'investigate',
  evidenceStrength:evidence.length>=2?'two-period-observation':'insufficient',
  affectedUsers:null,incrementalUsers:null,expectedROI:null,estimatedEffortHours:null,
  knownCountDifference:evidence.length===2&&evidence[0].metricId===evidence[1].metricId?
   Math.abs(evidence[0].value-evidence[1].value):null,
  priorAdverseReviews:primary?negative:0,
  nextStep:problem.next_step||'先核对证据与来源质量',
  caveat:'前后差值不是被影响人数；不同来源、期间、身份口径或货币值不可加总，不能凭相关性推断ROI'};
}
function opportunityPortfolio(owner,store){
 const learning=store.executiveLearning(owner);
 const cases=store.problems(owner,{limit:100}).filter(p=>['open','monitoring'].includes(p.status));
 const entries=cases.map(p=>{
  const last=store.problemEvents(owner,p.id).slice().reverse().find(x=>x.evidenceIds?.length>=2);
  const evidence=(last?.evidenceIds||[]).slice(0,2).map(id=>store.getEvidence(owner,id));
  return rankOpportunity(p,evidence,learning);
 });
 entries.sort((a,b)=>Number(b.kind==='business'&&b.subject.startsWith('active_users:'))-
   Number(a.kind==='business'&&a.subject.startsWith('active_users:'))||
  b.priority-a.priority||a.firstSeenAt-b.firstSeenAt);
 return {version:'executive-opportunity-portfolio-v1',items:entries.slice(0,10),
  knownROI:0,investmentDecision:'manual-review-required',
  noAttributionClaims:true};
}
function shouldRepeatCandidate(metricId,learning,actionText){
 // A failed *metric* does not mean that all investigations of that metric
 // are wrong. Only the same previously-executed intervention is suppressed.
 const target=typeof actionText==='string'?actionText.trim().slice(0,250):'';
 if(!target)return {propose:true,reason:'no-specific-action-to-compare'};
 const lessons=(learning?.lessons||[]).filter(x=>x.metricId===metricId&&
  typeof x.action==='string'&&x.action.trim()===target);
 const adverse=lessons.filter(x=>x.outcome==='observed-decline').length;
 const positive=lessons.filter(x=>x.outcome==='observed-improvement').length;
 return adverse>=2&&positive===0?
  {propose:false,reason:'same-action-repeated-observed-decline-requires-new-hypothesis'}:
  {propose:true,reason:'not-proven-causal'};
}
module.exports={goalAlignment,opportunityPortfolio,shouldRepeatCandidate,rankOpportunity};

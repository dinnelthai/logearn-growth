'use strict';
// Triage is deterministic and uses ONLY existing business report candidates.
// It deliberately does not call a model or infer causal effects.
const {createHash}=require('node:crypto');
const ALLOWED_METRICS=new Set(['active_users','new_users','returning_users','activation_rate','d7','weekly_core']);
function detectGrowthSignals(report,{maxSignals=10,minAbsoluteUsers=5,minRelativeChange=0.2}={}){
 if(!report?.business?.scope||!report.period||!Array.isArray(report.candidates))throw Error('必须提供现有业务报告');
 if(!Number.isSafeInteger(maxSignals)||maxSignals<1||maxSignals>30||
 !Number.isFinite(minAbsoluteUsers)||minAbsoluteUsers<0||
 !Number.isFinite(minRelativeChange)||minRelativeChange<0||minRelativeChange>1)throw Error('异常检测参数无效');
 const issues=[];
 const warnings=Array.isArray(report.warnings)?report.warnings:[];
 const candidates=report.candidates.slice(0,100);
 for(const c of candidates){
  if(!c||!ALLOWED_METRICS.has(c.metric)||!['P0','P1','P2'].includes(c.priority))continue;
  // Existing priority rules remain the authority. We do not recalculate KPIs.
  const goalGap=c.metric==='weekly_core'&&Number.isFinite(c.gap)&&c.gap>0;
  const movement=Number.isFinite(c.absolute)&&Math.abs(c.absolute)>=minAbsoluteUsers&&
    Number.isFinite(c.change)&&Math.abs(c.change)>=minRelativeChange;
  const rateConcern=['activation_rate','d7'].includes(c.metric)&&
    c.priority!=='P2'&&Number.isFinite(c.score)&&c.score>0;
  if(!goalGap&&!movement&&!rateConcern)continue;
  const risk=warnings.length>0?'needs-data-quality-review':'requires-corroboration';
  const id=createHash('sha256').update(JSON.stringify([report.snapshot?.id||null,c.id,c.metric,report.period.start,report.period.end])).digest('hex').slice(0,16);
  issues.push({
    id,metric:c.metric,candidateId:c.id||null,priority:c.priority,
    direction:goalGap?'goal-gap':movement?(c.absolute<0?'decline':'increase'):'review',
    score:Number.isFinite(c.score)?c.score:null,
    evidence:{candidateId:c.id||null,snapshotId:report.snapshot?.id||null,
      current:Number.isFinite(c.current)?c.current:null,
      previous:Number.isFinite(c.previous)?c.previous:null,
      absolute:Number.isFinite(c.absolute)?c.absolute:null,
      relativeChange:Number.isFinite(c.change)?c.change:null},
    quality:risk,requiresInvestigation:true,causalClaim:false
  });
 }
 issues.sort((a,b)=>({P0:0,P1:1,P2:2}[a.priority]-{P0:0,P1:1,P2:2}[b.priority])||
   (b.score??-Infinity)-(a.score??-Infinity)||a.id.localeCompare(b.id));
 return {version:'growth-triage-v1',snapshotId:report.snapshot?.id||null,
   period:report.period,scope:report.business.scope,signals:issues.slice(0,maxSignals),
   warnings:[...warnings].slice(0,20),
   interpretation:'异常信号是待调查线索，不等于原因、损失、收益或统计显著性'};
}
module.exports={detectGrowthSignals};

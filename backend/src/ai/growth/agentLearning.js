'use strict';
const {createHash}=require('node:crypto');
const {definitions}=require('../../analytics/businessPriorities');
const known=new Set(Object.keys(definitions));
const {classifyRetrospectiveOutcome}=require('./retrospectiveOutcome');
function judgeHistory(rows,{now=Date.now()}={}){
 if(!Array.isArray(rows)||!Number.isSafeInteger(now))throw Error('自评证据输入无效');
 const evaluated=[];
 for(const row of rows){
  if(row.user_status!=='executed'||!['1','2'].includes(row.review_context_version)||!row.retrospective_id||
   !Number.isFinite(Number(row.executed_at))||
   Number(row.executed_at)>Number(row.reviewed_at)||
   Number(row.reviewed_at)>now)continue;
  const metric=row.validation_metrics?.primary;
  const metricChange=row.metric_changes?.[metric];
  let assessment='insufficient',reason='no-verifiable-observed-effect',observedEvidence=null;
  if(row.review_context_version==='2'){
   observedEvidence=classifyRetrospectiveOutcome(row);
   assessment=observedEvidence.assessment;reason=observedEvidence.reason;
  }else if(known.has(metric)&&metricChange?.available===true&&
   Number.isFinite(metricChange.baseline)&&Number.isFinite(metricChange.effect)&&
   ['high','medium'].includes(row.confidence)){
    if(row.has_improvement===true&&metricChange.effect>metricChange.baseline){
     assessment='observed-supported';reason='primary-metric-improved-in-mature-observation';
    }else if(row.has_improvement===false&&metricChange.effect<=metricChange.baseline){
     assessment='observed-contradicted';reason='primary-metric-not-improved-in-mature-observation';
    }else reason='retrospective-conflicts-with-primary-metric';
  }
  const forecastCalibration=require('./agentForecast').calibrateForecast(row.forecast,row);
  evaluated.push({
   suggestionId:row.suggestion_id,retrospectiveId:row.retrospective_id,
   analysisId:row.analysis_id,businessProblem:String(row.business_problem||'').slice(0,240),
   actualAction:String(row.actual_action||'').slice(0,240),metric:known.has(metric)?metric:null,
   goal:row.filter_conditions?.focusGoal||'activation',
   source:row.action_scope?.source||row.applicable_scope?.source||row.business_scope?.source||'all',
   assessment,forecastCalibration,evidence:{
    reason,primaryMetric:metric,change:observedEvidence||metricChange||null,
    outcomeBasis:row.review_context_version==='2'?'fixed-cohort-observation':'legacy-business-observation',
    hasImprovement:row.has_improvement,hasCausality:false,
    confidence:row.confidence,reviewedAt:Number(row.reviewed_at),forecastCalibration,
    caveat:'回顾性观察不足以验证建议因果有效性；不证明模型预测准确；v2仅使用固定人群证据，缺少直接可比指标时归为证据不足'
   }
  });
 }
 return evaluated;
}
function summarizeJudgements(judgements){
 const supported=judgements.filter(x=>x.assessment==='observed-supported').length;
 const contradicted=judgements.filter(x=>x.assessment==='observed-contradicted').length;
 const insufficient=judgements.length-supported-contradicted;
 const comparable=supported+contradicted;
 const forecastHits=judgements.filter(j=>j.forecastCalibration?.status==='observed-hit').length;
 const forecastMisses=judgements.filter(j=>j.forecastCalibration?.status==='observed-miss').length;
 const forecastComparable=forecastHits+forecastMisses;
 return {version:'growth-judgement-v1',reviewed:judgements.length,
  forecastComparable,forecastHits,forecastMisses,
  observedForecastHitRate:forecastComparable?forecastHits/forecastComparable:null,
  observedSupported:supported,observedContradicted:contradicted,
  insufficient,observableAgreementRate:comparable?supported/comparable:null,
  actualPredictionAccuracy:null,causalEffectiveness:null,
  interpretation:'仅评价已执行建议在成熟复盘窗口内是否伴随主要指标变化；非预测准确率、非因果证明'};
}
function proposeStrategy(judgements,{goal,source='all',now=Date.now(),ttlDays=30}={}){
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(ttlDays)||ttlDays<1||ttlDays>90)
  throw Error('学习策略有效期配置无效');
 const selected=judgements.filter(x=>x.goal===goal&&x.source===source);
 const ordered=[...selected].sort((a,b)=>a.retrospectiveId.localeCompare(b.retrospectiveId));
 const digest=createHash('sha256').update('review-context-v1-action-scope:').update(JSON.stringify(ordered.map(x=>[
  x.suggestionId,x.retrospectiveId,x.metric,x.assessment,x.forecastCalibration?.status
 ]))).digest('hex');
 const stats=new Map();
 for(const j of selected){
  if(!known.has(j.metric))continue;
  let counts=stats.get(j.metric)||{metric:j.metric,observedSupported:0,
   observedContradicted:0,insufficient:0};
  if(j.forecastCalibration?.status==='observed-miss')counts.forecastMisses=(counts.forecastMisses||0)+1;
  if(j.assessment==='observed-supported')counts.observedSupported++;
  else if(j.assessment==='observed-contradicted')counts.observedContradicted++;
  else counts.insufficient++;
  stats.set(j.metric,counts);
 }
 const metrics=[...stats.values()].sort((a,b)=>a.metric.localeCompare(b.metric));
 const focusMetrics=metrics.filter(x=>(x.observedContradicted>=2&&
  x.observedContradicted>x.observedSupported)||(x.forecastMisses||0)>=2)
  .sort((a,b)=>b.observedContradicted-a.observedContradicted)
  .slice(0,3).map(x=>x.metric);
 return {digest,policy:{
  version:'evidence-first-strategy-v4',goal,source,
  validFrom:now,validUntil:now+ttlDays*86400000,
  scope:{goal,source},focusMetrics,requireFreshEvidence:true,requireHumanApproval:true,
  autoExternalActions:false,
  rollback:{condition:'策略到期、范围不匹配或新复盘不再支持其关注指标时停止应用',
   action:'恢复默认经营目标排序；保留历史策略记录，不删除或改写原复盘'},
  instructions:focusMetrics.length?
   '优先核查历史多次未观测到改善的指标，重新检验不同假设；禁止仅凭旧建议重复执行':
   '保持既有业务优先级规则，等待足够的执行后复盘证据'},
  evidence:{judgementCount:selected.length,byMetric:metrics,counterEvidence:metrics.filter(x=>x.observedContradicted>0||x.insufficient>0),
   supported:summarizeJudgements(selected),
   limitations:['历史复盘存在选择偏差和同期干扰因素',
    '只调整下一轮调查关注指标，不自动提高模型权重、改变原有 KPI 或执行运营动作']}
 };
}
async function refreshLearning({ownerId,source='all',goals=['activation','retention','conversion','revenue'],
 store,now=Date.now()}){
 if(!store?.feedback||!store?.saveStrategy||!store?.upsertJudgements)throw Error('学习台账缺失');
 const rows=await store.feedback(ownerId,{source,limit:300});
 const judgements=judgeHistory(rows,{now});
 await store.upsertJudgements(ownerId,judgements,{now});
 const strategies={};
 for(const goal of goals){
  const value=proposeStrategy(judgements,{goal,source,now});
  if(value.evidence.judgementCount){
   const saved=await store.saveStrategy(ownerId,goal,source,value,{now});
   strategies[goal]={version:saved.version,unchanged:saved.unchanged===true,
    policy:saved.policy||value.policy};
  }
 }
 return {judgements:summarizeJudgements(judgements),strategies,
  caution:'学习基于成熟观察复盘，不允许推断因果，也不会自动修改 LogEarn 业务统计代码'};
}
module.exports={judgeHistory,summarizeJudgements,proposeStrategy,refreshLearning};

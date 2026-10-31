const {runTask,validateReview} = require('../../ai/business/runner');
const {definitions,reviewPeriods,metricChanges,effectiveness,validateScope}=require('../../ai/business/policy');
const {fetchNorthStar,fetchGrowthInsights}=require('./dataFetcher');
const records=require('../../db/aiRecords'),remote=require('../../data/hologres');
const {loadLinkedTaskEvidence}=require('../../ai/growth/operationTaskEvidence');
function reviewEvidence(kind,data,{start,end,source,snapshot}){
  const {statView}=require('../../ai/business/modelTransport');
  return {status:'ok',evidence:[{id:`review:${kind}:${start}:${end}`,metricId:kind,
    value:statView(data),period:{start,end,timezone:'Asia/Bangkok'},filters:{source},
    sourceVersions:{events:snapshot.snapshot_id},watermarks:{events:snapshot.as_of},
    coverage:data.quality||{status:'unknown'},warnings:['统计观察不证明行动的因果效果']} ]};
}
const prompt=`你负责LogEarn增长建议复盘。比较等长完整UTC+7业务日的数据，区分相关性和因果性。若 operationTaskCohort.status=available，单独评估该固定人群的前后变化；它与全站/渠道指标是不同证据层，不可混为一谈。固定人群观察可说明该任务受众在执行前后的变化，但不是随机对照实验，不得单凭它声称行动造成改善。指标的 up/down 不等于业务好坏，必须结合指标定义和行动目标解释。若状态不是 available，明确说明固定人群证据缺失原因，不得推测或用全站数据代替。
缺少对照实验时不能声称因果。confidence表示对指标前后观测和数据质量的判断，不代表因果可信度；样本或指标证据不足时为insufficient。建议未产生改善不等于已证实无效。
分析所有主要及次要验证指标；不存在的指标明确说明，不得改用别的指标冒充。遇到复杂归因或证据冲突由当前单模型补查并说明不确定性。
输出JSON：{"hasImprovement":false,"hasCausality":false,"confidence":"high/medium/low/insufficient中的一个","conclusion":"结论及证据","confoundingFactors":["混淆因素"],"lessonsLearned":"经验","nextSteps":["下一步"]}。`;
async function retrospectiveAnalysis(job){
  const {retrospectiveId,suggestionId,ownerId,triggeredBy,modelMode='auto'}=job.data;
  const existing=await records.getRetrospective(retrospectiveId,ownerId);
  if(existing)return existing;
  const suggestion=await records.getSuggestion(suggestionId,ownerId);
  if(!suggestion||suggestion.user_status!=='executed')throw Error('仅能复盘自己已执行的建议');
  const snapshot=await remote.status();
  const now=Math.min(Date.now(),Date.parse(snapshot.as_of)+1);
  const periods=reviewPeriods(Number(suggestion.executed_at),now);
  const {baselineStart,baselineEnd,effectStart,effectEnd,days}=periods;
  const scope=validateScope(suggestion.action_scope || {source:suggestion.applicable_scope?.source||'all'}),source=scope.source;
  await job.progress(15);
  const [baseline,effect,baselineGrowth,effectGrowth,operationTaskCohort]=await Promise.all([
    fetchNorthStar(baselineStart,baselineEnd,source,snapshot),fetchNorthStar(effectStart,effectEnd,source,snapshot),
    fetchGrowthInsights({start:baselineStart,end:baselineEnd,source,snapshot}),fetchGrowthInsights({start:effectStart,end:effectEnd,source,snapshot}),
    loadLinkedTaskEvidence({db:require('../../db/connection'),ownerId,suggestionId,
      executedAt:Number(suggestion.executed_at),expectedSource:source,snapshot,now}).catch(()=>({status:'unavailable',reason:'cohort-evidence-load-failed'}))
  ]);
  const metrics=suggestion.validation_metrics;
  const requested=[metrics.primary,...(metrics.secondary||[])];
  function values(north,growth){
    const channels=growth.channels||[],eligible=channels.reduce((n,c)=>n+c.eligible,0),activated=channels.reduce((n,c)=>n+c.activated,0);
    const d7Eligible=channels.reduce((n,c)=>n+(c.d7?.eligible||0),0),d7Returned=channels.reduce((n,c)=>n+(c.d7?.returned||0),0);
    return {...north.totals,activation_rate:eligible?activated/eligible:null,d7:d7Eligible?d7Returned/d7Eligible:null};
  }
  const changes=metricChanges(values(baseline,baselineGrowth),values(effect,effectGrowth),requested);
  const context={reviewContextVersion:2,definitions,suggestion:{problem:suggestion.business_problem,hypothesis:suggestion.hypothesis,
    action:suggestion.actual_action,scope,expectedImpact:suggestion.expected_impact},periods,metricChanges:changes,
    operationTaskCohort,
    baseline:{...baseline,channels:baselineGrowth.channels,quality:baselineGrowth.quality,
      operationTaskCohort:operationTaskCohort.status==='available'?operationTaskCohort.baseline:null},
    effect:{...effect,channels:effectGrowth.channels,quality:effectGrowth.quality,
      operationTaskCohort:operationTaskCohort.status==='available'?operationTaskCohort.effect:null}};
  await job.progress(45);
  const investigate=async q=>{
    const a=q.start??effectStart,b=q.end??effectEnd,src=q.source||source;
    if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<baselineStart||b>effectEnd||b<=a||(source!=='all'&&src!==source))throw Error('复盘补查范围无效');
    if(q.kind==='north'||q.kind==='growth'){
      const data=q.kind==='north'?await fetchNorthStar(a,b,src,snapshot):
        await fetchGrowthInsights({start:a,end:b,source:src,snapshot});
      return reviewEvidence(q.kind,data,{start:a,end:b,source:src,snapshot});
    }
    throw Error('复盘调查工具未支持：'+q.kind);
  };
  const result=await runTask({context,prompt,ownerId,operationId:retrospectiveId,operationType:'retrospective',mode:modelMode,investigate,traceStore:require('../../ai/business/trace').createTraceStore(require('../../db/connection')),validate:validateReview});
  const analysis=result.analysis;
  // Observational before/after data supplies no causal identification.
  analysis.hasCausality=false;
  if(requested.some(k=>!changes[k].available))analysis.confidence='insufficient';
  const review=await records.createRetrospective({id:retrospectiveId,suggestionId,ownerId,
    baselinePeriod:{start:baselineStart,end:baselineEnd,days},effectPeriod:{start:effectStart,end:effectEnd,days},
    baselineData:{...context.baseline,reviewContextVersion:context.reviewContextVersion,
      operationTaskCohort:operationTaskCohort.status==='available'?{task:operationTaskCohort.task,
        periods:operationTaskCohort.periods,snapshot:operationTaskCohort.snapshot,
        metrics:operationTaskCohort.baseline}:{status:operationTaskCohort.status,reason:operationTaskCohort.reason}},
    effectData:{...context.effect,operationTaskCohort:operationTaskCohort.status==='available'?operationTaskCohort.effect:null},
    metricChanges:{...changes,operationTaskCohort:operationTaskCohort.metricChanges||null},
    hasImprovement:analysis.hasImprovement,hasCausality:analysis.hasCausality,conclusion:analysis.conclusion,confidence:analysis.confidence,
    confoundingFactors:analysis.confoundingFactors,lessonsLearned:analysis.lessonsLearned,
    modelProvider:result.provider,modelName:result.model,costUsd:result.cost,triggeredBy});
  await records.upsertExperienceIndex({suggestionId,ownerId,businessProblem:suggestion.business_problem,
    actionTaken:suggestion.actual_action,resultSummary:analysis.conclusion,effectiveness:effectiveness(analysis),
    applicableScope:scope,dateRange:{start:baselineStart,end:effectEnd}});
  await job.progress(100);return review;
}
module.exports={retrospectiveAnalysis,reviewEvidence};

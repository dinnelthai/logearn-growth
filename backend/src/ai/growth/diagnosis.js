'use strict';
// Read-only expert investigation preflight, derived solely from persisted
// alert/proposal evidence. It suggests checks, never invents causes or plans.
const {definitions}=require('../../analytics/businessPriorities');
const QUESTIONS=Object.freeze({
 active_users:[
  '先区分首次分析用户与回访分析用户，确定下降的主要贡献人群',
  '分来源检查访问、Token 查看和有效筹码分析漏斗，排除采集/产品故障'
 ],
 new_users:[
  '按获客来源拆分首次观测到的分析用户，定位哪个入口贡献了变化',
  '核对新访客到首次有效分析的转化，并对照同期内容/活动与采集变化'
 ],
 returning_users:[
  '按入组日期和渠道检查成熟 Cohort 与 D7 回访，避免未成熟样本被判流失',
  '区分未回访与已回访但未再次筹码分析，并检查产品可用性与信号质量'
 ]
});
function diagnoseProposal(proposal){
 if(!proposal||typeof proposal!=='object')throw Error('调查对象无效');
 const metric=proposal.metric,questions=QUESTIONS[metric]||[];
 const e=proposal.evidence&&typeof proposal.evidence==='object'?proposal.evidence:{};
 const b=e.evidence&&typeof e.evidence==='object'?e.evidence:{};
 const periodEnd=Number(proposal.period_end);
 const validCounts=Number.isSafeInteger(e.baseline)&&e.baseline>0&&
  Number.isSafeInteger(e.observed)&&e.observed>=0&&
  Number.isSafeInteger(e.periodStart)&&e.periodStart>0&&
  Number.isSafeInteger(e.periodEnd)&&e.periodEnd===periodEnd&&
  e.periodEnd-e.periodStart===86400000;
 const traced=validCounts&&['baselineAnalysisId','currentAnalysisId',
  'baselineSnapshotId','currentSnapshotId'].every(k=>
   typeof b[k]==='string'&&b[k].length>0);
 const observed=validCounts?{
  baseline:e.baseline,current:e.observed,absolute:e.observed-e.baseline,
  relativeChange:(e.observed-e.baseline)/e.baseline,
  periodStart:e.periodStart,periodEnd:e.periodEnd
 }:null;
 return {
  version:'growth-diagnosis-v1',
  metric:typeof metric==='string'?metric:null,
  definition:Object.hasOwn(definitions,metric)?definitions[metric]:null,
  scope:{source:proposal.source||'all',goal:proposal.goal||null},
  observation:observed,
  dataQuality:{
   status:traced?'traceable-observation':'needs-evidence-review',
   provenance:traced?{baselineAnalysisId:b.baselineAnalysisId,
    currentAnalysisId:b.currentAnalysisId,
    baselineSnapshotId:b.baselineSnapshotId,currentSnapshotId:b.currentSnapshotId}:null,
   limitations:traced?['原始日报在检测时已通过数据覆盖检查；当前数据仍需独立复核']:
    ['原始时间窗口、计数或快照溯源缺失，暂不能当作可信的变化结论']
  },
  investigationQuestions:traced?[...questions,
   '哪些同时期产品、渠道或采集变化可能解释该现象？需要何种独立证据？']:[],
  humanDecision:'由运营负责人决定是否批准进一步调查以及如何制定运营方案',
  causalConclusion:null,planGenerated:false,paidModelCalls:0,externalActions:0
 };
}
module.exports={diagnoseProposal};

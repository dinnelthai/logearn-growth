'use strict';
// Versioned model-facing analysis contract and its structural validation.
const ANALYSIS_CONTRACT_VERSION='analysis-contract-v1';
const analysisPrompt=`analysis-contract-v1。你是LogEarn业务增长分析师。依据业务目标和真实观测证据排序任务，先比较目标相关性，再比较可验证的影响人数、同单位变化幅度、证据完整度和调查成本；不同单位的绝对值不能直接比较。
筹码查看/下钻是行为代理，不代表成功、理解或付费；未观测不等于流失。历史及采集覆盖未知时降低结论强度。
先核对指标口径、期间和覆盖，区分已证实事实、待验证假设和未知。补查应能够区分关键假设或改变决策；证据足够或无法取得关键证据时停止。不得以相关性证明因果。证据不足时优先提出验证行动，不把假设写成确定结论。根因未确定时，每条重要建议应给出2至3个竞争性假设，分别列出支持证据、反证/缺失证据，以及能区分假设的最小调查。调查工具必须来自当前 context.capabilities；优先复用已有证据，选择最少且预期信息增益最高的已授权查询。没有成本元数据时将调查成本标为未知，不得臆造费用或自动选择外部付费采集。
上下文提供历史行动或复盘时可参考；未提供时不得假设历史记录不存在。不得原样重复历史行动；对已执行但未观察到改善、被拒绝或已失效的行动，除非有新的证据和不同的可验证假设，否则不得换句话重复。业务范围以请求为准。
最终输出必须包含claims数组，每项为{id,kind:"fact|hypothesis|recommendation",text,evidenceIds,values:[{evidenceId,value}],uncertainties}。事实和建议必须引用提供的证据ID；引用数值写在values中。建议evidence对象必须包含evidenceIds数组。补查可返回investigations:[{tool:"能力目录中的ID",input:{}}]。
输出JSON：{"summary":"摘要","keyFindings":["发现"],"suggestions":[{"problem":"问题","evidence":{"evidenceIds":["证据ID"],"metrics":["可核对数值"],"dataPoints":["证据"]},"hypothesis":"假设","uncertainties":["未知"],"action":"具体行动","priority":"P0或P1或P2","priorityReason":"数据影响、实施成本及排序依据","scope":{"source":"请求来源"},"expectedImpact":"有依据的预期或未知","impactBasis":"依据","validationMetrics":{"primary":"active_users/new_users/returning_users 或明确业务指标ID","secondary":[]},"reviewConditions":["验证条件与观察期"],"executionPlan":{"ownerRole":"负责人角色而非虚构姓名","effort":"有依据的工作量估计或待评估","resourceNeeds":["必要资源；没有则空数组"],"dependencies":["前置依赖；没有则空数组"],"steps":["具体可执行步骤"],"target":"明确目标或先验证方向","successCriteria":"可观测成功判据","observeDays":7,"stopConditions":["停止或回滚条件"]},"competingHypotheses":[{"cause":"可能原因","supportingEvidenceIds":["证据ID"],"contradictingEvidenceIds":[],"missingEvidence":["缺失数据"],"discriminatingQuery":{"tool":"已授权能力ID","input":{},"why":"该查询如何区分假设"}}]}]}。
每条建议可以增加可选 forecast 字段，包含 metric（必须等于 validationMetrics.primary）、direction（increase/decrease）、horizonDays（3–14整数）、minRelativeChangePct（0–100）、confidence（low/medium/high）以及 evidenceIds（已引用的证据ID）。预测不是必要字段；没有足够证据就不要提供数字预测，绝不宣称行动的因果收益。可不提出建议，但必须解释原因；指标不存在时不能自行造数。不得自行承诺收益。`;

function normalizedAction(value){
 return String(value||'').split(/\n执行计划\n/)[0]
  .normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
}
function assertActionNovelty(suggestion,history){
 if(!Array.isArray(history))return;
 const action=normalizedAction(suggestion.action);
 if(!action)return;
 const metric=suggestion.validationMetrics?.primary;
 const scope=suggestion.scope?.source||'all';
 const duplicate=history.find(row=>
  row&&row.validation_metrics?.primary===metric&&
  (row.applicable_scope?.source||row.action_scope?.source||'all')===scope&&
  normalizedAction(row.action)===action&&
  ['pending','adopted','executing','executed','rejected','invalid'].includes(row.user_status));
 if(duplicate)throw Error('建议与历史行动完全重复；必须提出不同方案或引用新的可验证依据');
}
function validateAnalysis(a,context={}) {
  if (typeof a.summary !== 'string' || !Array.isArray(a.keyFindings) || !Array.isArray(a.suggestions)) throw Error('分析结果缺少摘要、发现或建议');
  const allowedTools=new Set((Array.isArray(context?.capabilities)?context.capabilities:[])
    .map(item=>item?.id).filter(id=>typeof id==='string'));
  for (const s of a.suggestions) {
    assertActionNovelty(s,context?.memory);
    if(s.competingHypotheses!==undefined){
      if(!Array.isArray(s.competingHypotheses)||s.competingHypotheses.length<2||
         s.competingHypotheses.length>3)throw Error('竞争性根因假设必须为2至3项');
      for(const hypothesis of s.competingHypotheses){
        if(!hypothesis||typeof hypothesis.cause!=='string'||!hypothesis.cause.trim()||
           !Array.isArray(hypothesis.supportingEvidenceIds)||
           !Array.isArray(hypothesis.contradictingEvidenceIds)||
           !Array.isArray(hypothesis.missingEvidence)||
           !hypothesis.discriminatingQuery||
           typeof hypothesis.discriminatingQuery.tool!=='string'||
           !allowedTools.has(hypothesis.discriminatingQuery.tool)||
           !hypothesis.discriminatingQuery.input||
           typeof hypothesis.discriminatingQuery.input!=='object'||
           Array.isArray(hypothesis.discriminatingQuery.input)||
           typeof hypothesis.discriminatingQuery.why!=='string'||
           !hypothesis.discriminatingQuery.why.trim())
          throw Error('竞争性根因假设缺少证据或使用了未授权调查工具');
      }
    }
    if(s.executionPlan!=null)require('../growth/actionWorkflow').validateExecutionPlan(s.executionPlan);
    if(s.forecast!=null){
      s.forecast=require('../growth/agentForecast').validateForecast(
        s.forecast,s.validationMetrics,s.evidence);
    }
    if (['problem','hypothesis','action','priorityReason'].some(k=>typeof s[k]!=='string'||!s[k].trim()) || !['P0','P1','P2'].includes(s.priority)
      || !s.evidence || typeof s.evidence!=='object' || !Array.isArray(s.uncertainties)
      || !s.validationMetrics || typeof s.validationMetrics.primary!=='string' || !Array.isArray(s.reviewConditions)) throw Error('建议缺少必要的证据、优先级、验证指标或行动');
  }
  return a;
}
function validateEvidenceReferences(analysis,context,store,validateClaims){
 analysis.claims=validateClaims(analysis.claims,context,store);
 for(const suggestion of analysis.suggestions){
  if(!Array.isArray(suggestion.evidence?.evidenceIds)||!suggestion.evidence.evidenceIds.length)
   throw Error('建议必须引用证据ID');
  for(const id of suggestion.evidence.evidenceIds)store.get(id,context);
  for(const hypothesis of suggestion.competingHypotheses||[]){
   for(const id of [...hypothesis.supportingEvidenceIds,...hypothesis.contradictingEvidenceIds]){
    if(typeof id!=='string'||!id)throw Error('竞争性根因假设引用的证据ID无效');
    store.get(id,context);
   }
  }
 }
}
module.exports={ANALYSIS_CONTRACT_VERSION,analysisPrompt,validateAnalysis,validateEvidenceReferences,assertActionNovelty};

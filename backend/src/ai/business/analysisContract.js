'use strict';
// Versioned model-facing analysis contract and its structural validation.
const ANALYSIS_CONTRACT_VERSION='analysis-contract-v1';
const analysisPrompt=`analysis-contract-v1。你是LogEarn业务增长分析师。依据业务目标和真实观测证据排序任务，考虑目标差距、影响人数、证据强度、实施成本。
筹码查看/下钻是行为代理，不代表成功、理解或付费；未观测不等于流失。历史及采集覆盖未知时降低结论强度。
先核对指标口径、期间和覆盖，区分已证实事实、待验证假设和未知。补查应能够区分关键假设或改变决策；证据足够或无法取得关键证据时停止。不得以相关性证明因果。证据不足时优先提出验证行动，不把假设写成确定结论。
上下文提供历史行动或复盘时可参考；未提供时不得假设历史记录不存在。重复建议必须解释新证据。业务范围以请求为准。
最终输出必须包含claims数组，每项为{id,kind:"fact|hypothesis|recommendation",text,evidenceIds,values:[{evidenceId,value}],uncertainties}。事实和建议必须引用提供的证据ID；引用数值写在values中。建议evidence对象必须包含evidenceIds数组。补查可返回investigations:[{tool:"能力目录中的ID",input:{}}]。
输出JSON：{"summary":"摘要","keyFindings":["发现"],"suggestions":[{"problem":"问题","evidence":{"evidenceIds":["证据ID"],"metrics":["可核对数值"],"dataPoints":["证据"]},"hypothesis":"假设","uncertainties":["未知"],"action":"具体行动","priority":"P0或P1或P2","priorityReason":"数据影响、实施成本及排序依据","scope":{"source":"请求来源"},"expectedImpact":"有依据的预期或未知","impactBasis":"依据","validationMetrics":{"primary":"active_users/new_users/returning_users 或明确业务指标ID","secondary":[]},"reviewConditions":["验证条件与观察期"]}]}。
每条建议可以增加可选 forecast 字段，包含 metric（必须等于 validationMetrics.primary）、direction（increase/decrease）、horizonDays（3–14整数）、minRelativeChangePct（0–100）、confidence（low/medium/high）以及 evidenceIds（已引用的证据ID）。预测不是必要字段；没有足够证据就不要提供数字预测，绝不宣称行动的因果收益。可不提出建议，但必须解释原因；指标不存在时不能自行造数。不得自行承诺收益。`;

function validateAnalysis(a) {
  if (typeof a.summary !== 'string' || !Array.isArray(a.keyFindings) || !Array.isArray(a.suggestions)) throw Error('分析结果缺少摘要、发现或建议');
  for (const s of a.suggestions) {
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
 }
}
module.exports={ANALYSIS_CONTRACT_VERSION,analysisPrompt,validateAnalysis,validateEvidenceReferences};

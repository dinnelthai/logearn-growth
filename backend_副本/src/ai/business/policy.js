// AI routing is separate from deterministic business measurements.
const {definitions,validateRange,validateScope,rankEvidence,reviewPeriods,metricChanges}=require('../../analytics/businessPriorities');
function routeTask(context, mode = 'auto') {
  if (mode === 'complex') return {tier:'complex',reason:'用户指定复杂分析'};
  if (context.focusGoal === 'revenue') return {tier:'complex',reason:'收入策略需要综合判断'};
  const changes = context.candidates?.filter(c => c.change != null && Math.abs(c.change)>=0.2) || [];
  if (changes.some(c=>c.change>0) && changes.some(c=>c.change<0)) return {tier:'complex',reason:'主要指标走势冲突'};
  return {tier:'routine',reason:'常规业务诊断，必要时继续补查'};
}
function effectiveness(analysis) {
  if (analysis.confidence === 'insufficient' || analysis.confidence === 'low') return 'unknown';
  if (!analysis.hasCausality) return 'unknown';
  return analysis.hasImprovement ? 'effective' : 'ineffective';
}
module.exports={definitions,validateRange,validateScope,rankEvidence,routeTask,reviewPeriods,metricChanges,effectiveness};

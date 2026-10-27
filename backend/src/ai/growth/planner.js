'use strict';
const {listSkills,getSkill}=require('./skills');
const {listToolIds}=require('../business/tools/registry');
const {summarizeExperience}=require('./experienceFeedback');
const supportedTools=new Set(listToolIds());
const goalMap={activation:['growth-overview','activation-funnel'],retention:['growth-overview','retention'],conversion:['growth-overview','channel-growth','trade-conversion'],revenue:['growth-overview','revenue']};
function planGrowthInvestigation({goal='activation',report,maxSkills=3,history=[],focusSkillId=null,strategy=null}={}){
 if(!Object.hasOwn(goalMap,goal))throw Object.assign(Error('未知增长目标'),{status:400});
 if(!Number.isInteger(maxSkills)||maxSkills<1||maxSkills>6)throw Error('技能数量限制无效');
 if(!report||typeof report!=='object'||!report.business?.scope||!report.period)
  throw Error('必须提供现有业务报告作为任务规划依据');
 const specialized={
  'seo-organic':['activation','conversion'],
  'kol-impact':['conversion','revenue']
 };
 if(focusSkillId!=null&&(!Object.hasOwn(specialized,focusSkillId)||
    !specialized[focusSkillId].includes(goal)))
   throw Object.assign(Error('指定的专项技能与分析目标不兼容'),{status:400});
 if(focusSkillId&&report.business.scope.source!=='all')
   throw Object.assign(Error('专项技能需要全来源分析；不能把站外数据假称为所选渠道的筛选结果'),{status:400});
 const hints=strategy?.policy?.focusMetrics||[];
 if(!Array.isArray(hints)||hints.length>3||hints.some(x=>!['active_users','new_users','returning_users','activation_rate','d7','weekly_core'].includes(x)))
  throw Object.assign(Error('学习策略包含未授权的调查指标'),{status:409});
 const focus=new Set(hints);
 const triage=require('./triage').detectGrowthSignals(report);
 const experience=summarizeExperience(history,{source:report.business.scope.source});
 const alertIds=new Set(triage.signals.map(signal=>signal.candidateId));
 const priority=(report.candidates||[]).filter(c=>c&&typeof c.metric==='string').slice(0,20);
 const ranked=[...priority].sort((a,b)=>Number(alertIds.has(b.id))-Number(alertIds.has(a.id)));
 const available=[...(focusSkillId?[getSkill(focusSkillId)]:[]),...goalMap[goal].filter(id=>id!==focusSkillId).map(getSkill)];
 const ordered=available.map((skill,i)=>({
  skill,match:ranked.findIndex(c=>skill.signals.includes(c.metric)),order:i,
  attention:experience.filter(e=>skill.signals.includes(e.metric)).reduce((n,e)=>n+e.ineffectiveReviews,0),
  strategyFocus:skill.signals.some(m=>focus.has(m))?1:0
 })).sort((a,b)=>(a.skill.id===focusSkillId?0:1)-(b.skill.id===focusSkillId?0:1)||
   b.strategyFocus-a.strategyFocus||
   (a.match<0?999:a.match)-(b.match<0?999:b.match)||b.attention-a.attention||a.order-b.order);
 const selected=ordered.slice(0,maxSkills);
 return {
  version:'growth-plan-v1',goal,focusSkillId,scope:report.business.scope,period:report.period,
  triage,experienceFeedback:experience,
  learningStrategy:strategy?{version:strategy.version,focusMetrics:[...hints],
    instructions:strategy.policy.instructions||'须验证新证据',
    evidence:strategy.evidence?.judgementCount??null,
    boundedToReadOnlyInvestigations:true}:null,
  sourceSnapshot:report.snapshot?.id||null,requiresApprovalForActions:true,
  steps:selected.map(({skill})=>({
   skillId:skill.id,skillVersion:skill.version,label:skill.label,
   tools:skill.tools.filter(id=>supportedTools.has(id)&&(
    report.business.scope.source==='all'||!['check_data_quality','get_channel_economics','get_seo_performance','get_kol_performance'].includes(id))),
   investigation:skill.instructions,mode:'read-only',
   experienceChecks:experience.filter(e=>skill.signals.includes(e.metric)).map(e=>({
    metric:e.metric,observedEffective:e.effectiveReviews,observedIneffective:e.ineffectiveReviews,
    instruction:e.ineffectiveReviews?'历史观察未显示改善，应提出可验证的新假设并避免直接重复旧动作':'历史改善仅为观察相关，不可宣称因果'
   })),
   relatedCandidates:priority.filter(c=>skill.signals.includes(c.metric)).map(c=>c.id).filter(Boolean).slice(0,5)
  })),
  warnings:[...(report.warnings||[])].slice(0,15),
  limits:{maxSkills,externalActions:false}
 };
}
function formatPlanForPrompt(plan){
 if(plan?.version!=='growth-plan-v1'||!Array.isArray(plan.steps))throw Error('计划版本不支持');
 return '优先核查这些已配置的只读增长技能（不是必须全部调用）：\n'+
  plan.steps.map(s=>s.label+' ['+s.skillId+'@'+s.skillVersion+'] 工具：'+s.tools.join(',')+'；'+s.investigation+
  (s.experienceChecks?.length?'；历史验证注意：'+s.experienceChecks.map(x=>x.metric+':'+x.instruction).join('；'):'')).join('\n')+
  (plan.learningStrategy?'\n历史策略版本 '+plan.learningStrategy.version+'，优先核查指标：'+
    plan.learningStrategy.focusMetrics.join(',')+'。'+plan.learningStrategy.instructions:
    '')+
  '\n每条结论必须引用已有证据；不执行外部修改。';
}
module.exports={planGrowthInvestigation,formatPlanForPrompt,listSkills};

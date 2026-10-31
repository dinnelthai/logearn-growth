'use strict';
const {listSkills,getSkill}=require('./skills');
const {listToolIds}=require('../business/tools/registry');
const {summarizeExperience}=require('./experienceFeedback');
// Tool availability is computed per trusted task; no module-load snapshot.
const goalMap={activation:['growth-overview','activation-funnel'],retention:['growth-overview','retention'],conversion:['growth-overview','channel-growth','trade-conversion','referral-and-invite','login-conversion'],revenue:['growth-overview','revenue']};
function planGrowthInvestigation({goal='activation',report,maxSkills=3,history=[],focusSkillId=null,strategy=null,availableSpecialties=[],availableCapabilityIds=null,includeWeeklySpecialties=false}={}){
 if(!Object.hasOwn(goalMap,goal))throw Object.assign(Error('未知增长目标'),{status:400});
 if(!Number.isInteger(maxSkills)||maxSkills<1||maxSkills>(includeWeeklySpecialties?12:6))throw Error('技能数量限制无效');
 if(!report||typeof report!=='object'||!report.business?.scope||!report.period)
  throw Error('必须提供现有业务报告作为任务规划依据');
 const specialized={
  'seo-organic':['activation','conversion'],
  'kol-impact':['conversion','revenue'],
  'content-growth':['conversion'],
  'follower-quality':['conversion'],
  'referral-and-invite':['conversion'],
  'login-conversion':['activation','conversion']
 };
 if(focusSkillId!=null&&(!Object.hasOwn(specialized,focusSkillId)||
    !specialized[focusSkillId].includes(goal)))
   throw Object.assign(Error('指定的专项技能与分析目标不兼容'),{status:400});
 if(focusSkillId&&report.business.scope.source!=='all')
   throw Object.assign(Error('专项技能需要全来源分析；不能把站外数据假称为所选渠道的筛选结果'),{status:400});
 if(availableCapabilityIds!==null&&(!Array.isArray(availableCapabilityIds)||
    availableCapabilityIds.length>40||availableCapabilityIds.some(x=>typeof x!=='string')))
  throw Error('能力集合必须由可信任务入口提供');
 const supportedTools=new Set(availableCapabilityIds||listToolIds());
 let selectedStrategy=strategy,strategyExpired=false;
 if(strategy?.policy?.version==='evidence-first-strategy-v4'){
  const policy=strategy.policy,scope=policy.scope||{};
  if(!Number.isSafeInteger(policy.validFrom)||!Number.isSafeInteger(policy.validUntil)||
   policy.validFrom>Date.now()||policy.validUntil<=Date.now()||
   scope.goal!==goal||scope.source!==report.business.scope.source){
   selectedStrategy=null;strategyExpired=true;
  }
 }
 const hints=selectedStrategy?.policy?.focusMetrics||[];
 if(!Array.isArray(hints)||hints.length>3||hints.some(x=>!['active_users','new_users','returning_users','activation_rate','d7','weekly_core','registered_users','registration_activation_rate','registered_trade_conversion_rate'].includes(x)))
  throw Object.assign(Error('学习策略包含未授权的调查指标'),{status:409});
 const focus=new Set(hints);
 const triage=require('./triage').detectGrowthSignals(report);
 const experience=summarizeExperience(history,{source:report.business.scope.source});
 const alertIds=new Set(triage.signals.map(signal=>signal.candidateId));
 const priority=(report.candidates||[]).filter(c=>c&&typeof c.metric==='string').slice(0,20);
 const ranked=[...priority].sort((a,b)=>Number(alertIds.has(b.id))-Number(alertIds.has(a.id)));
 if(!Array.isArray(availableSpecialties)||availableSpecialties.some(id=>!['content-growth','follower-quality'].includes(id)))throw Error('每日专项证据输入无效');
 // A weekly operating report spans acquisition, activation and conversion.
 // Only the trusted Worker may opt in, after finding owner-owned specialty data.
 // This does not enable the tools for ordinary activation analyses.
 if(typeof includeWeeklySpecialties!=='boolean')throw Error('周报专项授权标识无效');
 const additional=(goal==='conversion'||includeWeeklySpecialties)&&
   report.business.scope.source==='all'?availableSpecialties:[];
 const weeklyEssential=['growth-overview','seo-organic','channel-growth',
  'activation-funnel','retention','trade-conversion','revenue',
  'referral-and-invite','login-conversion','kol-impact',
  'content-growth','follower-quality'];
 const defaultIds=includeWeeklySpecialties&&report.business.scope.source==='all'
  ?weeklyEssential
  :[...new Set([...additional,...goalMap[goal]])];
 const available=[...(focusSkillId?[getSkill(focusSkillId)]:[]),...defaultIds.filter(id=>id!==focusSkillId).map(getSkill)];
 const ordered=available.map((skill,i)=>({
  skill,match:ranked.findIndex(c=>skill.signals.includes(c.metric)),order:i,
  attention:experience.filter(e=>skill.signals.includes(e.metric)).reduce((n,e)=>n+e.ineffectiveReviews*2+(e.insufficientReviews||0),0),
  strategyFocus:skill.signals.some(m=>focus.has(m))?1:0
 })).sort((a,b)=>(a.skill.id===focusSkillId?0:1)-(b.skill.id===focusSkillId?0:1)||
   Number(additional.includes(b.skill.id))-Number(additional.includes(a.skill.id))||
   b.strategyFocus-a.strategyFocus||
   (a.match<0?999:a.match)-(b.match<0?999:b.match)||b.attention-a.attention||a.order-b.order);
 // A weekly operating report is cross-functional, not merely an
 // activation investigation. Guarantee core SEO/channel/retention coverage
 // before optional X specialties; ordinary task priorities remain unchanged.
 const selected=includeWeeklySpecialties&&report.business.scope.source==='all'
  ?defaultIds.slice(0,maxSkills).map(id=>({skill:getSkill(id)}))
  :ordered.slice(0,maxSkills);
 return {
  version:'growth-plan-v1',goal,focusSkillId,scope:report.business.scope,period:report.period,
  triage,experienceFeedback:experience,
  learningStrategy:selectedStrategy?{version:selectedStrategy.version,focusMetrics:[...hints],
    validUntil:selectedStrategy.policy?.validUntil??null,
    rollback:selectedStrategy.policy?.rollback??null,
    instructions:selectedStrategy.policy.instructions||'须验证新证据',
    evidence:selectedStrategy.evidence?.judgementCount??null,
    counterEvidence:selectedStrategy.evidence?.counterEvidence??[],
    boundedToReadOnlyInvestigations:true}:null,
  learningStrategyStatus:strategyExpired?'expired-or-scope-mismatch-ignored':selectedStrategy?'active':'no-reviewed-strategy',
  sourceSnapshot:report.snapshot?.id||null,requiresApprovalForActions:true,
  steps:selected.map(({skill})=>({
   skillId:skill.id,skillVersion:skill.version,label:skill.label,
   tools:skill.tools.filter(id=>supportedTools.has(id)&&(
    report.business.scope.source==='all'||!['check_data_quality','get_channel_economics','get_seo_performance','get_kol_performance','get_operations_timeline'].includes(id))),
   investigation:skill.instructions,mode:'read-only',
   experienceChecks:experience.filter(e=>skill.signals.includes(e.metric)).map(e=>({
    metric:e.metric,observedEffective:e.effectiveReviews,observedIneffective:e.ineffectiveReviews,
    insufficientReviews:e.insufficientReviews||0,
    priorActions:(e.recentLessons||[]).slice(0,3).map(lesson=>({
     businessProblem:lesson.businessProblem,actualAction:lesson.actualAction,
     assessment:lesson.assessment,reason:lesson.reason,reviewedAt:lesson.reviewedAt
    })),
    instruction:e.ineffectiveReviews
     ?'历史观察未显示改善；禁止原样重复同一行动，除非提出不同假设、明确变化机制并补充新证据'
     :e.insufficientReviews
      ?'历史复盘证据不足；不得把旧行动当作已验证方案，先补齐缺失证据或改变干预设计'
      :'历史改善仅为观察相关，不可宣称因果；再次执行需独立验证'
   })),
   relatedCandidates:priority.filter(c=>skill.signals.includes(c.metric)).map(c=>c.id).filter(Boolean).slice(0,5)
  })),
  warnings:[...(report.warnings||[]),...(strategyExpired?['历史学习策略已过期或经营范围不匹配，本轮已恢复默认调查排序']:[])].slice(0,15),
  limits:{maxSkills,externalActions:false}
 };
}
function formatPlanForPrompt(plan){
 if(plan?.version!=='growth-plan-v1'||!Array.isArray(plan.steps))throw Error('计划版本不支持');
 return '优先核查这些已配置的只读增长技能（不是必须全部调用）：\n'+
  plan.steps.map(s=>s.label+' ['+s.skillId+'@'+s.skillVersion+'] 工具：'+s.tools.join(',')+'；'+s.investigation+
  (s.experienceChecks?.length?'；历史验证注意：'+s.experienceChecks.map(x=>{
   const actions=(x.priorActions||[]).map(a=>
    (a.actualAction||a.businessProblem||'未记录行动')+'（'+a.assessment+'；'+a.reason+'）'
   ).join('；');
   return x.metric+':'+x.instruction+(actions?'；近期相关行动：'+actions:'');
  }).join('；'):'')).join('\n')+
  (plan.learningStrategy?'\n历史策略版本 '+plan.learningStrategy.version+'，优先核查指标：'+
    plan.learningStrategy.focusMetrics.join(',')+'。'+plan.learningStrategy.instructions:
    '')+
  '\n每条结论必须引用已有证据；不执行外部修改。';
}
module.exports={planGrowthInvestigation,formatPlanForPrompt,listSkills};

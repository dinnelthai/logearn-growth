'use strict';
const {listSkills,getSkill}=require('./skills');
const {listToolIds}=require('../business/tools/registry');
const supportedTools=new Set(listToolIds());
const goalMap={activation:['growth-overview','activation-funnel'],retention:['growth-overview','retention'],conversion:['growth-overview','channel-growth','trade-conversion'],revenue:['growth-overview','revenue']};
function planGrowthInvestigation({goal='activation',report,maxSkills=3}={}){
 if(!Object.hasOwn(goalMap,goal))throw Object.assign(Error('未知增长目标'),{status:400});
 if(!Number.isInteger(maxSkills)||maxSkills<1||maxSkills>6)throw Error('技能数量限制无效');
 if(!report||typeof report!=='object'||!report.business?.scope||!report.period)
  throw Error('必须提供现有业务报告作为任务规划依据');
 const priority=(report.candidates||[]).filter(c=>c&&typeof c.metric==='string').slice(0,20);
 const available=goalMap[goal].map(getSkill);
 const ordered=available.map((skill,i)=>({
  skill,match:priority.findIndex(c=>skill.signals.includes(c.metric)),order:i
 })).sort((a,b)=>(a.match<0?999:a.match)-(b.match<0?999:b.match)||a.order-b.order);
 const selected=ordered.slice(0,maxSkills);
 return {
  version:'growth-plan-v1',goal,scope:report.business.scope,period:report.period,
  sourceSnapshot:report.snapshot?.id||null,requiresApprovalForActions:true,
  steps:selected.map(({skill})=>({
   skillId:skill.id,skillVersion:skill.version,label:skill.label,
   tools:skill.tools.filter(id=>supportedTools.has(id)&&(
    report.business.scope.source==='all'||!['check_data_quality','get_channel_economics'].includes(id))),
   investigation:skill.instructions,mode:'read-only',
   relatedCandidates:priority.filter(c=>skill.signals.includes(c.metric)).map(c=>c.id).filter(Boolean).slice(0,5)
  })),
  warnings:[...(report.warnings||[])].slice(0,15),
  limits:{maxSkills,externalActions:false}
 };
}
function formatPlanForPrompt(plan){
 if(plan?.version!=='growth-plan-v1'||!Array.isArray(plan.steps))throw Error('计划版本不支持');
 return '优先核查这些已配置的只读增长技能（不是必须全部调用）：\n'+
  plan.steps.map(s=>s.label+' ['+s.skillId+'@'+s.skillVersion+'] 工具：'+s.tools.join(',')+'；'+s.investigation).join('\n')+
  '\n每条结论必须引用已有证据；不执行外部修改。';
}
module.exports={planGrowthInvestigation,formatPlanForPrompt,listSkills};

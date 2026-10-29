'use strict';
// A deterministic, no-model, no-payment investigation planner. All reads still
// pass through the owner-scoped registry, which owns budget/evidence controls.
const INTERNAL=new Set(['get_seo_performance','get_channels','get_funnel','get_paths',
 'get_product_chain','get_retention','get_segments','query_metrics','check_data_quality',
 'get_channel_economics','get_referral','get_invite_conversion','get_login_conversion']);
const goalModules={
 activation:['growth.acquisition','growth.activation','growth.login','growth.quality','growth.retention'],
 retention:['growth.retention','growth.activation','growth.acquisition','growth.quality'],
 conversion:['growth.acquisition','growth.activation','growth.retention','growth.seo','growth.referral','growth.login','growth.quality'],
 revenue:['growth.economics','growth.activation','growth.acquisition','growth.quality']
};
const prefers={
 'growth.seo':['get_seo_performance'],
 'growth.acquisition':['get_channels'],
 'growth.activation':['get_funnel','get_paths','get_product_chain'],
 'growth.retention':['get_retention','query_metrics','get_segments'],
 'growth.quality':['check_data_quality'],
 'growth.economics':['get_channel_economics'],
 'growth.referral':['get_referral','get_invite_conversion'],
 'growth.login':['get_login_conversion']
};
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function makePlan(registry,context,{mode='full',goal='activation',question='',moduleIds=null,maxCalls=6}={}){
 if(!context?.ownerId||!context.period||!context.scope)fail('需要可信 owner、期间及范围',403);
 if(!Object.hasOwn(goalModules,goal)||!['full','focused'].includes(mode)||
  typeof question!=='string'||question.length>2000||!Number.isInteger(maxCalls)||
  maxCalls<1||maxCalls>10)fail('调查参数无效');
 if(moduleIds!==null&&(!Array.isArray(moduleIds)||moduleIds.length>7||
  moduleIds.some(id=>typeof id!=='string'||id.length>80)))fail('模块列表无效');
 const registered=registry.listBusinessModules(context);
 const live=new Map(registered.map(m=>[m.moduleId,m]));
 const selected=moduleIds||(mode==='full'?[...new Set([...goalModules[goal],...Object.keys(prefers)])]:goalModules[goal]);
 if(mode==='focused'&&(!selected.length||!question.trim()))fail('定向调查需要明确问题与模块');
 const steps=[],missing=[];
 for(const id of [...new Set(selected)]){
  if(steps.length>=maxCalls){missing.push({moduleId:id,reason:'budget_exceeded'});continue;}
  const module=live.get(id);
  if(!module){missing.push({moduleId:id,reason:'unknown_module'});continue;}
  if(module.status!=='available'){missing.push({moduleId:id,reason:'unavailable_or_not_authorized'});continue;}
  const allowed=(prefers[id]||[]).filter(tool=>INTERNAL.has(tool));
  const cap=allowed.map(tool=>module.capabilities.find(c=>c.id===tool&&c.cost!=='paid'&&c.cost!=='unknown'))
   .find(Boolean);
  if(!cap){missing.push({moduleId:id,reason:'no_safe_capability'});continue;}
  // Query constraints are inherited from context, never from model-provided
  // scopes, project IDs, connection URLs, arbitrary SQL or credentials.
  const input=id==='growth.activation'&&cap.id==='get_funnel'?{steps:['token','chip']}:{};
  steps.push({moduleId:id,moduleVersion:module.version,
   capabilityId:cap.id,capabilityVersion:cap.version,input,
   purpose:module.description});
 }
 return {version:'growth-module-plan-v1',mode,goal,question,
  period:context.period,scope:context.scope,steps,missing,
  limits:{maxCalls,maxFollowUps:1,paidCalls:0,externalWrites:0}};
}
async function runPlan(registry,context,plan){
 if(plan?.version!=='growth-module-plan-v1'||!Array.isArray(plan.steps)||
  !plan.limits||plan.steps.length>plan.limits.maxCalls||
  plan.steps.length>10)fail('调查计划版本或调用预算无效');
 const outcomes=[],warnings=[];
 // Never use model-provided plans as a source of authorization. Reconstruct a
 // live, server-side plan and match each requested step against the live catalog.
 const live=new Map(registry.listBusinessModules(context).map(m=>[m.moduleId,m]));
 for(const step of plan.steps){
  const module=live.get(step.moduleId);
  if(!INTERNAL.has(step.capabilityId)||!module?.capabilities.some(c=>
   c.id===step.capabilityId&&c.cost!=='paid'&&c.cost!=='unknown')){
   outcomes.push({moduleId:step.moduleId,status:'not_authorized',evidenceIds:[]});
   continue;
  }
  try{
   const result=await registry.executeBusinessModule({
    moduleId:step.moduleId,capabilityId:step.capabilityId,input:step.input||{}},context);
   outcomes.push({moduleId:step.moduleId,capabilityId:step.capabilityId,
    status:result.status,evidenceIds:result.evidenceIds||[],
    coverage:result.coverage,sourceTypes:result.sources||[],
    definitionVersions:result.definitionVersions||[],
    watermarks:result.watermarks||{},warnings:result.warnings||[],
    data:result.data});
  }catch(error){
   outcomes.push({moduleId:step.moduleId,capabilityId:step.capabilityId,
    status:[400,403,404,429].includes(error.status)?'blocked':'unavailable',
    reason:error.status===403?'not_authorized':error.status===429?'budget_exceeded':'call_failed',
    evidenceIds:[]});
  }
 }
 // A single bounded quality follow-up is allowed when failures leave a gap.
 // It is a NEW registry call; it never retries an uncertain paid call.
 const quality=live.get('growth.quality');
 const hasGap=outcomes.some(x=>x.status!=='ok');
 const already=outcomes.some(x=>x.moduleId==='growth.quality');
 if(hasGap&&!already&&quality?.capabilities.some(c=>c.id==='check_data_quality')&&
    context.scope.source==='all'&&outcomes.length<plan.limits.maxCalls){
  try{
   const result=await registry.executeBusinessModule({
    moduleId:'growth.quality',capabilityId:'check_data_quality',input:{}},context);
   outcomes.push({moduleId:'growth.quality',capabilityId:'check_data_quality',followUp:true,
    status:result.status,evidenceIds:result.evidenceIds||[],coverage:result.coverage,
    warnings:result.warnings||[],data:result.data});
  }catch{warnings.push('数据质量补查失败；未把缺失当成零');}
 }
 const verified=outcomes.filter(x=>x.status==='ok');
 return {version:plan.version,goal:plan.goal,mode:plan.mode,question:plan.question,
  period:context.period,scope:context.scope,steps:outcomes,missing:plan.missing,
  status:verified.length===outcomes.length&&!plan.missing.length?'complete':
    verified.length?'partial':'unavailable',
  evidenceIds:[...new Set(outcomes.flatMap(x=>x.evidenceIds||[]))].slice(0,30),
  warnings,paidCalls:0,externalWrites:0,
  limitation:'跨模块不同来源/日期/指标定义不能直接相加或归因；仅当完整证据支持时形成事实结论'};
}
module.exports={makePlan,runPlan,INTERNAL};

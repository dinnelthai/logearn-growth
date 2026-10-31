'use strict';
// Human approval remains mandatory. No external action is performed here.
const allowed=Object.freeze({
 pending:['adopted','rejected','invalid'],
 adopted:['executing','rejected','invalid'],
 executing:['executed','rejected','invalid'],
 executed:[],rejected:[],invalid:[]
});

const clean=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
function validateExecutionPlan(plan){
 if(!plan||typeof plan!=='object'||Array.isArray(plan)||
  !clean(plan.ownerRole,80)||!clean(plan.effort,100)||
  !Array.isArray(plan.resourceNeeds)||plan.resourceNeeds.length>5||
  plan.resourceNeeds.some(x=>!clean(x,120))||
  !Array.isArray(plan.dependencies)||plan.dependencies.length>5||
  plan.dependencies.some(x=>!clean(x,160))||
  !Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>5||
  plan.steps.some(x=>!clean(x,240))||
  !clean(plan.target,180)||!clean(plan.successCriteria,300)||
  !Array.isArray(plan.stopConditions)||plan.stopConditions.length<1||
  plan.stopConditions.length>3||plan.stopConditions.some(x=>!clean(x,180))||
  !Number.isSafeInteger(plan.suggestedObservationDays)||plan.suggestedObservationDays<3||plan.suggestedObservationDays>30)
  throw Object.assign(Error('建议执行计划缺少负责人角色、工作量、资源、步骤或复盘条件'),{status:400});
 return plan;
}
function formatActionExecutionPlan(action,plan){
 if(typeof action!=='string'||!action.trim())throw Error('建议行动内容无效');
 if(plan==null)return action;
 validateExecutionPlan(plan);
 const lines=[
  action.trim(),
  '',
  '执行计划',
  '负责人角色：'+plan.ownerRole,
  '预计工作量：'+plan.effort,
  '资源需求：'+(plan.resourceNeeds.length?plan.resourceNeeds.join('；'):'无额外资源'),
  '前置依赖：'+(plan.dependencies.length?plan.dependencies.join('；'):'无'),
  '执行步骤：',
  ...plan.steps.map((step,i)=>(i+1)+'. '+step),
  '目标：'+plan.target,
  '成功判据：'+plan.successCriteria,
  '建议观察窗口：'+plan.suggestedObservationDays+'天（复盘仍须等待指标成熟和数据水位确认）',
  '停止/回滚条件：'+plan.stopConditions.join('；')
 ];
 return lines.join('\n');
}
function validateActionTransition(current,target,{actualAction,rejectionReason}={}){
 if(typeof current!=='string'||!Object.hasOwn(allowed,current))throw Object.assign(Error('未知的当前建议状态'),{status:409});
 if(typeof target!=='string'||!Object.hasOwn(allowed,target))throw Object.assign(Error('未知的目标建议状态'),{status:400});
 if(!allowed[current].includes(target))throw Object.assign(Error('建议状态转换不允许：'+current+' → '+target),{status:409});
 if(target==='rejected'&&(!rejectionReason||!rejectionReason.trim()))throw Object.assign(Error('拒绝时必须记录原因'),{status:400});
 if(target==='executed'&&(!actualAction||!actualAction.trim()))throw Object.assign(Error('执行完成需要实际行动记录'),{status:400});
 return {from:current,to:target,humanApprovalRequired:true,externalAction:false};
}
module.exports={allowed,validateActionTransition,validateExecutionPlan,formatActionExecutionPlan};

'use strict';

const {workspaceStore}=require('./workspace/store');
const DAY=86400000,OFFSET=7*3600000;
const METRICS=['analysis_users','analysis_events','analysis_days','trade_users','transactions','volume_usd'];

function json(value,fallback=null){try{return JSON.parse(value)}catch{return fallback}}
function taskReviewPeriods(task,cutoff){
 const completedAt=task.completed_at,createdAt=task.created_at;
 if(!Number.isSafeInteger(completedAt)||!Number.isSafeInteger(createdAt)||createdAt<0||completedAt<createdAt)
  throw Error('运营任务时间戳无效');
 const effectStart=Math.floor((completedAt+OFFSET)/DAY)*DAY-OFFSET+DAY;
 const fullDayEnd=Math.floor((cutoff+OFFSET)/DAY)*DAY-OFFSET;
 const availableDays=Math.floor((fullDayEnd-effectStart)/DAY);
 if(availableDays<3)throw Error('任务完成后至少需要3个完整业务日才能复盘');
 const days=Math.min(14,availableDays);
 const baselineEnd=Math.floor((createdAt+OFFSET)/DAY)*DAY-OFFSET;
 const baselineStart=baselineEnd-days*DAY;
 const effectEnd=effectStart+days*DAY;
 if(baselineStart<0||baselineEnd>createdAt||effectEnd>fullDayEnd)
  throw Error('固定人群前后观察窗口无效');
 return {baselineStart,baselineEnd,effectStart,effectEnd,days,
  timezone:'Asia/Bangkok',baselineAnchor:'before-task-created',effectAnchor:'after-task-completed'};
}
function metricChanges(baseline,effect){
 return Object.fromEntries(METRICS.map(key=>{
  const a=baseline?.[key],b=effect?.[key];
  if(!Number.isFinite(a)||!Number.isFinite(b))return [key,{available:false,reason:'metric-unavailable'}];
  return [key,{available:true,baseline:a,effect:b,absolute:b-a,
   percent:a===0?null:(b-a)/Math.abs(a)*100,direction:b>a?'up':b<a?'down':'flat'}];
 }));
}
function findLinkedTask(db,ownerId,suggestionId){
 const hasWorkspace=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gw_operation_links'").get();
 const hasProblems=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gw_problems'").get();
 if(!hasWorkspace||!hasProblems)return {status:'not-linked',reason:'workspace-link-store-not-initialized'};
 const links=workspaceStore(db).suggestionOperationTasks(String(ownerId),String(suggestionId))
  .flatMap(row=>row.linkedOperationTasks||[]);
 if(!links.length)return {status:'not-linked',reason:'no-operation-task-linked'};
 if(links.length!==1)return {status:'ambiguous',reason:'multiple-operation-tasks-linked',linkedCount:links.length};
 const task=db.prepare('SELECT * FROM operation_tasks WHERE id=? AND owner_id=?').get(links[0].id,String(ownerId));
 return task?{status:'linked',task}:{status:'unavailable',reason:'linked-task-not-found'};
}
async function loadLinkedTaskEvidence({db,ownerId,suggestionId,executedAt,expectedSource,snapshot,now,dependencies={}}){
 const linked=findLinkedTask(db,ownerId,suggestionId);
 if(linked.status!=='linked')return linked;
 const task=linked.task;
 if(task.status!=='done'||!Number.isSafeInteger(task.completed_at))
  return {status:'waiting',reason:'operation-task-not-completed',taskId:task.id};
 if(task.completed_at!==executedAt)
  return {status:'unavailable',reason:'task-and-suggestion-execution-time-mismatch',taskId:task.id};
 const source=json(task.source_json),members=json(task.members_json);
 if(!source||typeof source.source!=='string'||(expectedSource&&source.source!==expectedSource))
  return {status:'unavailable',reason:'task-and-suggestion-source-mismatch',taskId:task.id};
 if(!Array.isArray(members)||
  !members.length||members.length>5000||members.some(id=>typeof id!=='string'||!/^\\d{1,20}$/.test(id))||
  new Set(members).size!==members.length)
  return {status:'unavailable',reason:'invalid-fixed-cohort-snapshot',taskId:task.id};
 const cutoff=Math.min(now,Date.parse(snapshot?.as_of)+1);
 if(!Number.isSafeInteger(cutoff)||!Number.isFinite(cutoff))
  return {status:'unavailable',reason:'invalid-source-watermark',taskId:task.id};
 let periods;
 try{periods=(dependencies.taskReviewPeriods||taskReviewPeriods)(task,cutoff)}
 catch(error){return {status:'waiting',reason:'cohort-observation-window-not-mature',taskId:task.id,
  message:String(error.message||error).slice(0,200)}}
 const factsLoader=dependencies.memberFacts||require('../../data/memberMetrics').memberFacts;
 const metricBuilder=dependencies.memberMetrics||require('../../data/memberMetrics').memberMetrics;
 const ids=members.map(String);
 const [beforeFacts,afterFacts]=await Promise.all([
  factsLoader(snapshot,ids,{start:periods.baselineStart,end:periods.baselineEnd}),
  factsLoader(snapshot,ids,{start:periods.effectStart,end:periods.effectEnd})
 ]);
 const errors={baseline:beforeFacts.errors||{},effect:afterFacts.errors||{}};
 const hasErrors=Object.values(errors).some(group=>Object.values(group).some(Boolean));
 if(hasErrors)return {status:'unavailable',reason:'cohort-metric-source-incomplete',taskId:task.id,
  periods,errors};
 const before=metricBuilder(beforeFacts,ids.map(id=>({id})),
  {start:periods.baselineStart,end:periods.baselineEnd},snapshot);
 const after=metricBuilder(afterFacts,ids.map(id=>({id})),
  {start:periods.effectStart,end:periods.effectEnd},snapshot);
 if(!before||!after)return {status:'unavailable',reason:'cohort-metric-projection-incomplete',taskId:task.id,periods};
 const baseline=before.total,effect=after.total;
 return {
  status:'available',task:{id:task.id,title:task.title,source:source.source,
   fixedAudienceCount:ids.length,completedAt:task.completed_at},
  periods:{baselineStart:periods.baselineStart,baselineEnd:periods.baselineEnd,
   effectStart:periods.effectStart,effectEnd:periods.effectEnd,days:periods.days,
   timezone:'Asia/Bangkok'},
  snapshot:{id:snapshot.snapshot_id,asOf:snapshot.as_of},
  baseline:{...baseline,requested_users:before.requested_users,unmatched_users:before.unmatched_users},
  effect:{...effect,requested_users:after.requested_users,unmatched_users:after.unmatched_users},
  metricChanges:metricChanges(baseline,effect),
  quality:{baselineErrors:beforeFacts.errors,effectErrors:afterFacts.errors,
   baselineUnmatched:before.unmatched_users,effectUnmatched:after.unmatched_users},
  interpretation:'同一固定人群、等长业务窗口、同一数据快照的前后观察；基线窗口严格早于任务创建，观察窗口从任务完成后的下一个完整业务日开始，任务执行期间不计入任一窗口；不是随机对照实验，不单独证明行动因果效果。'
 };
}
module.exports={METRICS,taskReviewPeriods,metricChanges,findLinkedTask,loadLinkedTaskEvidence};

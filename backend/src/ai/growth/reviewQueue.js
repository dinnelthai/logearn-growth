'use strict';
const {reviewPeriods}=require('../../analytics/businessPriorities');
const DAY=86400000,OFFSET=7*3600000;
function earliestReviewAt(executedAt){
 if(!Number.isSafeInteger(executedAt)||executedAt<0)throw Error('执行时间无效');
 const effectStart=Math.floor((executedAt+OFFSET)/DAY)*DAY-OFFSET+DAY;
 return effectStart+3*DAY;
}
function classifyReview(row,{now=Date.now(),watermark=now}={}){
 const executedAt=Number(row?.executed_at);
 if(row?.user_status!=='executed'||!Number.isSafeInteger(executedAt)||executedAt<0)
  return {status:'not-eligible',reason:'not-executed'};
 if(!Number.isSafeInteger(watermark)||!Number.isSafeInteger(now))
  throw Error('业务数据水位无效');
 const cutoff=Math.min(now,watermark);
 const earliest=earliestReviewAt(executedAt);
 if(cutoff<earliest)return {status:'waiting',reason:'requires-three-complete-days',earliestReviewAt:earliest};
 try{
  const periods=reviewPeriods(executedAt,cutoff);
  return {status:'ready',reason:'complete-business-days-available',earliestReviewAt:earliest,periods};
 }catch(error){
  return {status:'waiting',reason:'review-window-not-mature',earliestReviewAt:earliest};
 }
}
function buildReviewQueue(suggestions,{now=Date.now(),watermark=now}={}){
 if(!Array.isArray(suggestions))throw Error('建议列表无效');
 return suggestions.filter(s=>s.user_status==='executed').map(s=>({
  suggestionId:s.id,analysisId:s.analysis_id,priority:s.priority,
  title:s.business_problem,scope:s.action_scope||s.applicable_scope,
  ...classifyReview(s,{now,watermark})
 })).sort((a,b)=>(a.status==='ready'?0:1)-(b.status==='ready'?0:1)||
   (a.earliestReviewAt??Infinity)-(b.earliestReviewAt??Infinity));
}
module.exports={earliestReviewAt,classifyReview,buildReviewQueue};

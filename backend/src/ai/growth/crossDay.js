'use strict';
// Stable cross-day observations, not independent metric computations.
// Fail closed on mismatched windows, source, owner, or incomplete event coverage.
const {createHash}=require('node:crypto');
const DAY=86400000,OFFSET=7*3600000;
// A count observed for multiple daily goal reports must not become two alerts.\n// Acquisition/activation own first-time and active analysis counts; retention\n// owns returning analysis users. Rate-based D7 signals require mature cohorts\n// and are deliberately not inferred from these counts.\nconst METRICS_BY_GOAL=Object.freeze({\n activation:['active_users','new_users'],retention:['returning_users']\n});
function unpack(record){
 const context=record?.data_snapshot;
 const period=context?.period;
 const end=Number(period?.end),start=Number(period?.start);
 const scope=context?.business?.scope?.source,goal=context?.focusGoal;
 if(record?.status!=='completed'||record?.filter_conditions?.dailySchedule!=='v1'||
    !Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end-start!==DAY||
    (start+OFFSET)%DAY!==0||typeof scope!=='string'||!scope||
    typeof goal!=='string'||!goal||record?.business_scope?.source!==scope||
    record?.filter_conditions?.focusGoal!==goal)
   return {ok:false,reason:'non-comparable-report'};
 const snapshot=context.snapshot||{},asOf=Date.parse(snapshot.asOf),
   eventsThrough=Date.parse(snapshot.eventsCompleteThrough);
 if(snapshot.historyComplete!==true||!Number.isFinite(asOf)||asOf<end||
    !Number.isFinite(eventsThrough)||eventsThrough<end||
    context.growth?.quality?.truncated===true)
   return {ok:false,reason:'incomplete-data-coverage'};
 const totals=context.current?.totals;
 if(!totals||typeof totals!=='object')return {ok:false,reason:'missing-observed-totals'};
 return {ok:true,start,end,scope,goal,totals,
   snapshotId:snapshot.id||null,analysisId:record.id,ownerId:record.owner_id};
}
function compareDailySnapshots(previous,current,{minBaseline=20,minAbsolute=5,minFraction=0.2}={}){
 if(![minBaseline,minAbsolute].every(x=>Number.isSafeInteger(x)&&x>=1)||
    !Number.isFinite(minFraction)||minFraction<=0||minFraction>1)
   throw Error('异常阈值无效');
 const left=unpack(previous),right=unpack(current);
 if(!left.ok||!right.ok)return {comparable:false,reason:!left.ok?left.reason:right.reason,signals:[]};
 if(left.ownerId!==right.ownerId||left.scope!==right.scope||left.goal!==right.goal||
    left.end!==right.start)return {comparable:false,reason:'incompatible-period-or-scope',signals:[]};
 const signals=[];
 for(const metric of METRICS_BY_GOAL[left.goal]||[]){
  const a=left.totals[metric],b=right.totals[metric];
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<minBaseline||b<0)continue;
  const diff=b-a,ratio=diff/a;
  if(Math.abs(diff)<minAbsolute||Math.abs(ratio)<minFraction)continue;
  const direction=diff<0?'decline':'increase';
  const priority=diff<0&&Math.abs(ratio)>=0.4&&a>=50?'P0':'P1';
  const fingerprint=createHash('sha256').update(JSON.stringify([
    'growth-crossday-v1',left.ownerId,left.scope,left.goal,metric,direction
  ])).digest('hex');
  signals.push({fingerprint,metric,direction,priority,
   source:left.scope,goal:left.goal,baseline:a,observed:b,absolute:diff,
   fraction:ratio,periodStart:right.start,periodEnd:right.end,
   evidence:{baselineAnalysisId:left.analysisId,currentAnalysisId:right.analysisId,
    baselineSnapshotId:left.snapshotId,currentSnapshotId:right.snapshotId},
   causality:'unproven',requiresHumanReview:true});
 }
 return {comparable:true,reason:'adjacent-fully-observed-business-days',
  periodEnd:right.end,signals};
}
module.exports={compareDailySnapshots,unpack};

'use strict';
const {detectGrowthSignals}=require('./triage');
const VALID=new Set(['activation','retention','conversion','revenue']);
function planDailyPaidAnalysis({reports,goals,period,source='all'}={}){
 if(!reports||!Array.isArray(goals)||!goals.length||goals.length>4||
  goals.some(g=>!VALID.has(g))||!Number.isSafeInteger(period?.start)||
  !Number.isSafeInteger(period?.end)||period.end<=period.start)
  throw Error('主动分析预检参数无效');
 const decisions={};
 for(const goal of goals){
  const report=reports[goal],snapshot=report?.snapshot;
  if(report?.focusGoal!==goal||report?.business?.scope?.source!==source||
     report?.period?.start!==period.start||report?.period?.end!==period.end||
     !snapshot?.id||!Array.isArray(report?.candidates)){
   decisions[goal]={status:'deferred',reason:'context-unverified'};
   continue;
  }
  const complete=snapshot.historyComplete===true&&
   Number.isFinite(Date.parse(snapshot.eventsCompleteThrough))&&
   Date.parse(snapshot.eventsCompleteThrough)>=period.end;
  const warnings=Array.isArray(report.warnings)?report.warnings:[];
  if(!complete||warnings.length||report.growth?.quality?.truncated){
   decisions[goal]={status:'deferred',reason:'coverage-unverified',snapshotId:snapshot.id};
   continue;
  }
  const triage=detectGrowthSignals(report);
  // Economic and conversion investigations have specialist data beyond the
  // core report, therefore cannot be suppressed by an empty core signal list.
  const specialist=goal==='conversion'||goal==='revenue';
  if(specialist||triage.signals.length){
   decisions[goal]={status:'dispatch',reason:triage.signals.length?'observed-signal':'specialist-not-in-core',
    snapshotId:snapshot.id,signalCount:triage.signals.length};
  }else{
   decisions[goal]={status:'skip',reason:'no-observed-core-signal',
    snapshotId:snapshot.id,signalCount:0};
  }
 }
 return {version:'daily-signal-gate-v1',decisions,
  dispatched:goals.filter(g=>decisions[g].status==='dispatch'),
  skipped:goals.filter(g=>decisions[g].status==='skip'),
  deferred:goals.filter(g=>decisions[g].status==='deferred')};
}
module.exports={planDailyPaidAnalysis};

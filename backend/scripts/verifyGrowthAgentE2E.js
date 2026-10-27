#!/usr/bin/env node
'use strict';
// Read-only production acceptance evidence. No provider calls or state writes.
const {createAgentStore}=require('../src/ai/growth/agentStore');
const {createSchedulerHealth}=require('../src/ai/growth/agentSchedulerHealth');
const GOALS=['activation','retention','conversion','revenue'];
async function verify({ownerId,day,source='all',store=createAgentStore(),health=createSchedulerHealth()}={}){
 if(typeof ownerId!=='string'||!ownerId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)||
  typeof source!=='string'||!source)throw Error('Expected OWNER YYYY-MM-DD [source]');
 const [brief,analyses,heartbeat,feedback]=await Promise.all([
  store.getBrief(ownerId,day,source),store.dailyAnalyses(ownerId,day,source),
  health.status(),store.feedback(ownerId,{source,limit:300})]);
 const byGoal=new Map(analyses.map(a=>[a.filter_conditions?.focusGoal,a]));
 const checks={
  briefPresent:Boolean(brief?.id),
  briefReady:brief?.status==='ready'&&brief?.quality?.complete===true,
  fourAnalyses:GOALS.every(g=>byGoal.has(g)&&byGoal.get(g).status==='completed'),
  sourceSnapshots:GOALS.every(g=>{
   const a=byGoal.get(g),p=a?.data_snapshot?.period,s=a?.data_snapshot?.business?.scope;
   return a?.status==='completed'&&a?.result&&p?.start===Number(a.date_range_start)&&
    p?.end===Number(a.date_range_end)&&s?.source===source;
  }),
  evidenceScore:Number.isFinite(brief?.score?.value),
  schedulerObserved:heartbeat.observed===true&&!heartbeat.stale,
  feedbackReviewed:feedback.some(f=>f.user_status==='executed'&&f.retrospective_id&&analyses.some(a=>a.id===f.analysis_id)),
  strategyVersion:Number.isSafeInteger(Number(brief?.strategy_version))&&Number(brief.strategy_version)>0,
  channelSidecarRecorded:brief?.report?.channelObservations?.version==='source-sidecar-v1'
 };
 const missing=Object.entries(checks).filter(([,ok])=>!ok).map(([k])=>k);
 return {status:missing.length?'incomplete':'verified',day,source,briefId:brief?.id||null,
  checks,missing,analyses:GOALS.map(goal=>({goal,id:byGoal.get(goal)?.id||null,status:byGoal.get(goal)?.status||'missing'})),
  schedulerStatus:heartbeat.status,reviewCount:feedback.length,providerCalls:0,
  note:'Only verifies stored source-linked traces and reviewed feedback; no additional model, GSC, or external API call'};
}
if(require.main===module){
 const [ownerId,day,source='all']=process.argv.slice(2);
 verify({ownerId,day,source}).then(result=>{
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.status!=='verified')process.exitCode=1;
 }).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>{
  require('../src/db/aiPool').end().catch(()=>{});
 });
}
module.exports={verify};

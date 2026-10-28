'use strict';
const {dailyRequest,dispatchDaily}=require('./daily');
const {createAgentStore}=require('./agentStore');
const {refreshLearning}=require('./agentLearning');
const {createDailyBrief}=require('./agentBrief');
const {createHash}=require('node:crypto');
const DEFAULT_GOALS=['activation','retention','conversion','revenue'];
const {planDailyPaidAnalysis}=require('./dailySignalGate');
function allowedGoals(goals){
 if(!Array.isArray(goals)||!goals.length||goals.length>4||
  goals.some(x=>!DEFAULT_GOALS.includes(x))||new Set(goals).size!==goals.length)
  throw Error('每日 Agent 目标列表只能选择不重复的激活、留存、转化、收入');
 return [...goals];
}
async function tickAutonomousOwner({
 ownerId,now=Date.now(),source='all',goals=DEFAULT_GOALS,allowPaidDispatch=false,
 store=createAgentStore(),records=require('../../db/aiRecords'),
 enqueue=null,
 notify=null,proposeCandidate=null,
 preflight=null,signalGateEnabled=process.env.AI_AUTONOMY_SIGNAL_GATE_ENABLED==='1'
}={}){
 if(typeof ownerId!=='string'||!ownerId||!Number.isSafeInteger(now))
  throw Error('自动运营任务身份和日期无效');
 const required=allowedGoals(goals);
 const period=dailyRequest({ownerId,now,goal:required[0],source}).period;
 // Refresh strategy ONLY from completed retrospectives; it never calls an LLM.
 const learning=await refreshLearning({ownerId,source,goals:required,store,now});
 let analyses=await store.dailyAnalyses(ownerId,period.day,source);
 const enqueued=[],signalDecisions=[];
 if(allowPaidDispatch){
  enqueue ||= require('../../queues/queues').addAIAnalysisJob;
  let paidGate=null;
  if(signalGateEnabled){
   try{
    const load=preflight||((args)=>require('../../services/businessReport').createService().buildMany(args));
    const reports=await load({start:period.start,end:period.end,businessScope:{source},
     goals:required,ownerId});
    paidGate=planDailyPaidAnalysis({reports,goals:required,period,source});
   }catch(error){
    // Opt-in paid gate fails CLOSED on missing or corrupt preflight metrics.
    paidGate={decisions:Object.fromEntries(required.map(goal=>[goal,
     {status:'deferred',reason:'preflight-unavailable'}]))};
   }
  }
  for(const goal of required){
   // Completed and active runs are owned by the existing analysis worker.
   // Pending records may have been persisted before Bull accepted the job.
   // Failed runs are NOT blindly replayed: remote paid-call state may be unknown.
   const existing=analyses.find(a=>a.filter_conditions?.focusGoal===goal);
   if(existing&&existing.status!=='pending'){
    if(existing.status==='failed'){
     const retry=typeof records.claimDailySafeRetry==='function'
       ?await records.claimDailySafeRetry(existing.id,ownerId):null;
     if(!retry){
      enqueued.push({goal,status:'failed-needs-safe-retry-review',analysisId:existing.id});
      continue;
     }
    }else continue;
   }
   const decision=paidGate?.decisions?.[goal];
   if(decision){
    const state=decision.status==='skip'?'skipped-no-verified-signal':
     decision.status==='deferred'?'deferred-evidence-quality':'dispatch';
    signalDecisions.push({goal,status:state,reason:decision.reason,
     sourceSnapshotId:decision.snapshotId||null});
    if(decision.status!=='dispatch'){
     enqueued.push({goal,status:state,reason:decision.reason,paidCalls:0});
     continue;
    }
   }
   const item=await dispatchDaily({ownerId,now,goal,source,records,enqueue});
   enqueued.push({goal,status:item.status,analysisId:item.analysisId});
  }
  if(enqueued.length)analyses=await store.dailyAnalyses(ownerId,period.day,source);
 }
 const targets=await store.targets(ownerId,{source});
 const strategies={};
 for(const goal of required)strategies[goal]=await store.getStrategy(ownerId,goal,source);
 let promptCandidate=null;
 if(process.env.AI_PROMPT_CANDIDATE_PROPOSAL_ENABLED==='1'){
  const focus=[...new Set(required.flatMap(goal=>
    Array.isArray(strategies[goal]?.policy?.focusMetrics)?
     strategies[goal].policy.focusMetrics:[]))]
   .filter(x=>['active_users','new_users','returning_users','activation_rate','d7','weekly_core'].includes(x))
   .slice(0,3);
  if(focus.length){
   const {analysisPrompt}=require('../../queues/jobs/businessAnalysis');
   const appendix='历史执行与成熟复盘中，以下指标多次出现未达预期的观测：'+focus.join('、')+
     '。优先检验新的反证、数据覆盖与假设，并明确旧建议为何不能直接重复。不得改变已有指标定义、权限、预算或业务口径。';
   const create=proposeCandidate||((input)=>require('../optimization/promptRegistry')
    .createPromptRegistry(require('../../db/connection')).propose(ownerId,input));
   promptCandidate=await create({role:'analysis',baseline:analysisPrompt,appendix,
    reason:'基于成熟执行复盘的指标反证自动生成待评估候选，不自行发布'});
  }
 }
 const channelObservations=source==='all'?require('./channelObservations').collectChannelObservations(ownerId,period.day):null;
 const brief=createDailyBrief({ownerId,day:period.day,source,channelObservations,
  goals:required,analyses,targets,learning,strategies});
 if(signalGateEnabled&&allowPaidDispatch){
  brief.report.signalGate={version:'daily-signal-gate-v1',
   decisions:signalDecisions,modelCalls:0,
   note:'控制付费调查派发；无信号不等于经营目标达成'};
 }
 const saved=await store.upsertBrief(ownerId,brief,{now});
 // Only a ready/partial, persisted brief is eligible for optional proactive
 // external delivery. Blocked or unknown business context never leaves DB.
 let notification=null;
 if(notify&&['ready','partial'].includes(saved.status))
  notification=await notify({ownerId,briefId:saved.id,day:period.day,
   status:saved.status,score:saved.score?.value??null,
   summary:String(saved.report?.overview||'').slice(0,1200)});
 return {
  ownerId,day:period.day,source,status:saved.status,briefId:saved.id,
  score:saved.score?.value??null,goals:required,
  completed:saved.quality?.completedGoals??0,
  expected:saved.quality?.requiredGoals??required.length,
  enqueued,signalDecisions,learning:learning.judgements,
  strategyVersions:Object.fromEntries(Object.entries(strategies).map(([k,v])=>[k,v?.version||null])),
  notification,promptCandidate:promptCandidate?{id:promptCandidate.id,
   status:promptCandidate.status,requiresIndependentEvaluation:true}:null,
  automaticPaidAllowed:allowPaidDispatch,externalActions:0
 };
}
function autonomyConfig(env=process.env){
 const owners=(env.AI_AUTONOMY_OWNER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 const goals=allowedGoals((env.AI_AUTONOMY_GOALS||
  'activation,retention,conversion,revenue').split(',').map(x=>x.trim()));
 if(!owners.length||owners.length>100||owners.some(x=>x.length>256)||
  new Set(owners).size!==owners.length)
  throw Error('AI_AUTONOMY_OWNER_IDS 需要显式且不重复的授权用户列表');
 const source=env.AI_AUTONOMY_SOURCE||'all';
 if(typeof source!=='string'||!source||source.length>200)throw Error('Agent 来源范围无效');
 const paidEnabled=env.AI_AUTONOMY_PAID_DAILY_ENABLED==='1';
 if(paidEnabled&&require('./autonomyBudget').dailyAutonomyLimit(env)===0)
  throw Error('开启自动付费分析时必须配置 AI_AUTONOMY_PAID_CALLS_PER_DAY 为正整数');
 return {owners,goals,source,paidEnabled};
}
module.exports={tickAutonomousOwner,autonomyConfig,allowedGoals};

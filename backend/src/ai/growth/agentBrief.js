'use strict';
const {scoreDaily}=require('./agentScore');
const GOALS=['activation','retention','conversion','revenue'];
const asText=(x,max=1200)=>typeof x==='string'?x.slice(0,max):'';
function createDailyBrief({ownerId,day,source='all',goals=['activation'],
 analyses=[],targets=[],learning=null,strategies={}}){
 if(!ownerId||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Array.isArray(goals)||
  !goals.length||goals.some(x=>!GOALS.includes(x))||new Set(goals).size!==goals.length||
  !Array.isArray(analyses)||!Array.isArray(targets))throw Error('AI 日报构建参数无效');
 const selected=new Map();
 for(const row of analyses){
  const goal=row?.filter_conditions?.focusGoal;
  if(!goals.includes(goal)||selected.has(goal))continue;
  selected.set(goal,row);
 }
 const sections=[],scores=[],analysisIds=[],warnings=[],qualityReasons=[];
 for(const goal of goals){
  const row=selected.get(goal);
  if(!row){
   sections.push({goal,status:'not-scheduled',summary:null,findings:[],actions:[],
    analysisId:null,score:null});
   warnings.push(goal+': 未发现该目标对应的日分析');
   continue;
  }
  analysisIds.push(row.id);
  const snapshot=row.data_snapshot;
  const comparable=snapshot?.period?.start===Number(row.date_range_start)&&
   snapshot?.period?.end===Number(row.date_range_end)&&
   snapshot?.business?.scope?.source===source&&
   snapshot?.focusGoal===goal;
  if(row.status!=='completed'||!comparable||!row.result){
   sections.push({goal,status:comparable?row.status:'source-context-invalid',
    summary:null,findings:[],actions:[],analysisId:row.id,score:null});
   warnings.push(goal+': 模型分析尚未完成或原始上下文不匹配');
   continue;
  }
  const metricTargets=targets.filter(t=>t.active===true&&t.goal===goal&&t.source===source);
  const score=scoreDaily(snapshot,metricTargets);
  scores.push(score);
  if(score.score===null)qualityReasons.push(goal+': 目标或数据覆盖不足，不能打分');
  const result=row.result;
  sections.push({
   goal,status:'completed',analysisId:row.id,sourceSnapshotId:snapshot.snapshot?.id||null,
   score,summary:asText(result.summary),
   findings:Array.isArray(result.keyFindings)?result.keyFindings.slice(0,8).map(s=>asText(s,500)):[],
   actions:Array.isArray(result.claims)?result.claims.filter(c=>c.kind==='recommendation')
     .slice(0,8).map(c=>({text:asText(c.text,400),evidenceIds:Array.isArray(c.evidenceIds)?
      c.evidenceIds.slice(0,12):[]})):[],
   signalCount:Array.isArray(result.growthSignals)?result.growthSignals.length:0,
   skills:result.growthSkills||[],modelCostKnown:result.cost!=null,
   scoreInterpretation:score.basis
  });
 }
 const completed=sections.filter(x=>x.status==='completed');
 const allCompleted=completed.length===goals.length;
 const scored=scores.length===goals.length&&scores.every(x=>x.score!==null);
 const overallScore=allCompleted&&scored?
  Math.round(scores.reduce((n,x)=>n+x.score,0)/goals.length):null;
 const status=!completed.length?'blocked':allCompleted&&scored?'ready':'partial';
 const mostImportant=completed.flatMap(x=>x.actions.map(a=>({...a,goal:x.goal,analysisId:x.analysisId})))
   .slice(0,12);
 const autoLearning=learning?.judgements||null;
 return {
  day,source,status,analysisIds,score:{
   value:overallScore,
   status:overallScore===null?'insufficient-evidence':'scored',
   method:'equally-weighted mean of selected goal completion scores; each uses only configured KPI targets',
   perGoal:sections.map(s=>({goal:s.goal,status:s.status,value:s.score?.score??null,
    metrics:s.score?.metrics||[]})),
   qualityWarnings:qualityReasons
  },
  report:{
   version:'ai-growth-daily-brief-v1',title:'LogEarn AI Growth 日报 · '+day,
   overview:completed.length?completed.map(s=>s.goal+': '+s.summary).join('\n').slice(0,3500):
    '暂无已完成的模型分析，无法形成可信的经营日报',
   sections,priorityActions:mostImportant,
   selfEvaluation:autoLearning,
   nextDayLearning:goals.map(goal=>({goal,version:strategies[goal]?.version??null,
    policy:strategies[goal]?.policy||null})),
   humanApprovalsRequired:true,automatedExternalActions:0,
   warnings:[...warnings,...qualityReasons,
    '日报仅整合已完成的 AI 调查及原始指标快照；模型建议并不证明原因或预计收益',
    '复盘属于历史观测反馈，不能当作随机实验或预测准确率']
  },
  quality:{
   completedGoals:completed.length,requiredGoals:goals.length,
   complete:allCompleted&&scored,sourceContextVerified:allCompleted,
   missingGoals:sections.filter(x=>x.status!=='completed').map(x=>x.goal),
   sourceObservationOnly:true,
   causalProof:false,
   blockingReasons:[...warnings,...qualityReasons]
  },
  strategyVersion:Math.max(0,...goals.map(g=>Number(strategies[g]?.version)||0))||null
 };
}
module.exports={createDailyBrief};

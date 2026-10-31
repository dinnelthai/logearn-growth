'use strict';
// Growth Executive cycle: reuse trusted business observations and the existing
// owner-scoped workspace ledger. No LLM, payment or external write capability.
const {createHash}=require('node:crypto');
const {loadObservation}=require('../liveObservation');
const {discover}=require('./discovery');
const {previousBangkokDay}=require('../daily');
const {currentMonth}=require('./period');
const {describeMetric}=require('../../business/metricRegistry');
const METRICS=Object.freeze(['active_users','new_users','returning_users']);
const safeNumber=value=>Number.isSafeInteger(value)&&value>=0;
const timestamp=value=>typeof value==='string'?Date.parse(value):NaN;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validObservation(o,now){
 const expected=previousBangkokDay(now);
 const b=o?.baseline,c=o?.current,h=o?.health;
 if(!b||!c||!h||b.start!==expected.start-86400000||
    b.end!==expected.start||c.start!==expected.start||c.end!==expected.end||
    METRICS.some(m=>!safeNumber(b.totals?.[m])||!safeNumber(c.totals?.[m])))
  throw Error('北极星观察期间、指标或口径不匹配');
 const complete=h.complete===true&&h.historyComplete===true&&
  typeof h.snapshotId==='string'&&h.snapshotId.length>0&&
  Number.isFinite(timestamp(h.cutoff))&&timestamp(h.cutoff)>=c.end&&
  Number.isFinite(timestamp(h.eventsCompleteThrough))&&
  timestamp(h.eventsCompleteThrough)>=c.end&&timestamp(h.cutoff)<=now;
 return {baseline:b,current:c,health:h,complete};
}
function saveMetric(store,owner,metric,period,value,h){
 const version=describeMetric(metric).version;
 const observedAt=timestamp(h.cutoff);
 const payload={id:'executive:'+digest([owner,metric,version,period.start,period.end,h.snapshotId,value,h.eventsCompleteThrough]).slice(0,32),
  source:'hologres-north-star',metricId:metric,definitionVersion:version,
  unit:'users',scope:{source:'all'},state:'verified',value,
  period:{start:period.start,end:period.end,timezone:'Asia/Bangkok'},
  observedAt,coverage:{status:'verified',historyComplete:true},
  watermarks:{snapshotId:h.snapshotId,eventsCompleteThrough:h.eventsCompleteThrough,sourceCutoff:h.cutoff},
  originalLocator:{snapshotId:h.snapshotId,metric,periodStart:period.start,periodEnd:period.end}};
 return store.saveEvidence(owner,payload);
}
function caseFor(metric){
 const labels={active_users:'筹码峰去重分析用户',new_users:'首次分析用户',returning_users:'回访分析用户'};
 return {subject:labels[metric]+'单日下降',action:'核对'+labels[metric]+'的同口径数据水位、获客来源和筹码峰进入路径；记录可验证的断点后，再提出干预或实验方案。'};
}
async function runExecutiveCycle({ownerId,store,now=Date.now(),load=loadObservation}={}){
 if(typeof ownerId!=='string'||!ownerId.trim()||!store?.saveEvidence||
    !store?.proposeActionOnce||!Number.isSafeInteger(now))throw Error('经营循环缺少可信 owner、证据存储或时钟');
 let observation;
 try{observation=validObservation(await load({now,source:'all'}),now)}
 catch(error){
  const found=discover(ownerId,store,{sources:[{id:'north-star-events',state:'stale',coverage:'source-query-failed'}],at:now,maxNew:8});
  return {status:'source-unavailable',reason:'trusted-observation-unavailable',
   newProblems:found.created.length,proposedActions:0,modelCalls:0,paidCalls:0,externalActions:0};
 }
 if(!observation.complete){
  const found=discover(ownerId,store,{sources:[{id:'north-star-events',state:'partial',coverage:'history-or-event-watermark-unverified'}],at:now,maxNew:8});
  return {status:'coverage-unverified',newProblems:found.created.length,
   proposedActions:0,modelCalls:0,paidCalls:0,externalActions:0,
   warning:'有观测数值但历史完整性或截止水位未验证；没有创建虚假的下降结论'};
 }
 const {baseline,current,health}=observation;
 const month=currentMonth(now);
 const goal=store.listGoals(ownerId,{asOf:now,start:month.start,end:month.end})
  .find(g=>g.metric_id==='active_users'&&g.definition_version==='1'&&g.kind==='north'&&g.scope?.source==='all')||null;
 const signals=[];
 for(const metric of METRICS){
  const base=baseline.totals[metric],value=current.totals[metric];
  // Only meaningful declines: no false positives from small denominators.
  if(base<20||base-value<5||(base-value)/base<0.2)continue;
  const old=saveMetric(store,ownerId,metric,baseline,base,health);
  const latest=saveMetric(store,ownerId,metric,current,value,health);
  const info=caseFor(metric);
  signals.push({subject:info.subject,metricId:metric,
   baselineEvidenceId:old.id,currentEvidenceId:latest.id,
   scope:{source:'all'},...(metric==='active_users'&&goal?{goalId:goal.id,goalVersion:goal.version}:{}),
   threshold:0.2,minBaseline:20});
 }
 const found=discover(ownerId,store,{signals,at:now,maxNew:8});
 // One investigation draft per cycle: supporting metric declines remain
 // evidence-backed problems, not three competing versions of the same work.
 const focus=signals.find(s=>s.metricId==='active_users')||
  signals.find(s=>s.metricId==='new_users')||signals[0]||null;
 let proposedActions=0;
 for(const item of [...found.created,...found.updated].slice(0,8)){
  const p=store.problem(ownerId,item.id);
  if(p?.type!=='business'||!['open','monitoring'].includes(p.status))continue;
  const metric=signals.find(s=>s.metricId+':'+s.subject===p.subject)?.metricId;
  if(!metric||metric!==focus?.metricId)continue;
  const proposed=store.proposeActionOnce(ownerId,p.id,{
   description:caseFor(metric).action,assignee:'AI Growth Agent',
   metricId:metric,definitionVersion:describeMetric(metric).version,
   direction:'increase'});
  if(!proposed.reused)proposedActions++;
 }
 store.reconcileSource(ownerId,'north-star-events',{
  state:'connected',coverage:'verified',asOf:timestamp(health.cutoff)});
 return {status:'verified',observedMetrics:METRICS.length,declineSignals:signals.length,
  newProblems:found.created.length,updatedProblems:found.updated.length,proposedActions,
  northStarTargetConfigured:!!goal,
  modelCalls:0,paidCalls:0,externalActions:0,
  note:'按同口径相邻完整业务日的去重人数判断；同期变化不等于干预因果'};
}
module.exports={runExecutiveCycle,validObservation};

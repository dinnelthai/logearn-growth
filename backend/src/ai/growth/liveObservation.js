'use strict';
// A bounded, zero-model query over the existing source facts.
// No synthetic "completed AI analysis" records are created.
const {createHash}=require('node:crypto');
const {previousBangkokDay}=require('./daily');
const DAY=86400000,OFFSET=7*3600000;
const METRICS={activation:['active_users','new_users'],retention:['returning_users']};
const day=t=>new Date(t+OFFSET).toISOString().slice(0,10);
function counts(result,dates){
 const found=new Map((result?.days||[]).map(r=>[r.date,r]));
 return dates.map(date=>{
  const row=found.get(date)||{};
  const totals={};
  for(const key of ['active_users','new_users','returning_users']){
   const value=row[key]??0;
   if(!Number.isSafeInteger(value)||value<0)throw Error('业务日人数无效');
   totals[key]=value;
  }
  return {date,totals};
 });
}
function sourceHealth(snapshot,end){
 const cutoff=Date.parse(snapshot?.snapshot_cutoff),
  through=Date.parse(snapshot?.events_complete_through);
 const complete=snapshot?.history_complete===true&&
   Number.isFinite(through)&&through>=end&&
   Number.isFinite(cutoff)&&cutoff>=end&&
   typeof snapshot.snapshot_id==='string'&&snapshot.snapshot_id.length>0;
 return {complete,status:complete?'verified':'coverage-unverified',
  snapshotId:snapshot?.snapshot_id||null,
  cutoff:Number.isFinite(cutoff)?new Date(cutoff).toISOString():null,
  eventsCompleteThrough:Number.isFinite(through)?new Date(through).toISOString():null,
  historyComplete:snapshot?.history_complete===true,
  warning:complete?null:'源端尚未证明历史完整与事件连续覆盖；可以观察人数但不能确认下降'};
}
function signals({ownerId,goal,source='all',baseline,current,health,channels=[]}){
 if(!health.complete)return [];
 const out=[];
 for(const metric of METRICS[goal]||[]){
  const a=baseline.totals[metric],b=current.totals[metric];
  if(a<20||Math.abs(b-a)<5||Math.abs(b-a)/a<0.2)continue;
  const decline=b<a;
  const direction=decline?'decline':'increase';
  const priority=decline&&(a-b)/a>=0.4&&a>=50?'P0':'P1';
  const fingerprint=createHash('sha256').update(JSON.stringify(
   ['growth-source-day-v1',ownerId,source,goal,metric,direction])).digest('hex');
  const topChannels=channels.filter(x=>x.metric===metric).slice(0,8);
  out.push({fingerprint,metric,goal,source,direction,priority,baseline:a,observed:b,
   absolute:b-a,fraction:(b-a)/a,periodStart:current.start,periodEnd:current.end,
   evidence:{origin:'hologres-source-observation',sourceSnapshotId:health.snapshotId,
    sourceCutoff:health.cutoff,eventsCompleteThrough:health.eventsCompleteThrough,
    historyComplete:health.historyComplete,baselinePeriodStart:baseline.start,
    baselinePeriodEnd:baseline.end,currentPeriodStart:current.start,
    currentPeriodEnd:current.end,channelBreakdown:topChannels},
   causality:'unproven',requiresHumanReview:true});
 }
 return out;
}
// Separate channel query uses the same source CTE/identity semantics as
// fetchNorthStar. Missing/unknown channel attribution is kept explicit.
async function channelCounts({remote,snapshot,start,end,source}){
 const sql=require('../../data/analysisUsers').ANALYSIS_SQL;
 const rows=await remote.query(`${remote.eventsCte()} SELECT e.date AS day,
  COALESCE(NULLIF(f.source,''),'未知') AS source,
  COUNT(DISTINCT e.user_key) FILTER (WHERE e.event_name IN (${sql})) AS active_users,
  COUNT(DISTINCT e.user_key) FILTER (WHERE e.event_name IN (${sql}) AND
     TO_CHAR(TO_TIMESTAMP(f.first_chip/1000.0) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD')=e.date) AS new_users,
  COUNT(DISTINCT e.user_key) FILTER (WHERE e.event_name IN (${sql}) AND
     TO_CHAR(TO_TIMESTAMP(f.first_chip/1000.0) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD')<e.date) AS returning_users
 FROM e JOIN facts f ON f.user_key=e.user_key
 WHERE e.client_ts >= $2 AND e.client_ts < $3
   AND ($4::text IS NULL OR f.source=$4)
 GROUP BY e.date,COALESCE(NULLIF(f.source,''),'未知')
 ORDER BY e.date,source LIMIT 101`,
 [snapshot.snapshot_cutoff,start,end,source==='all'?null:source]);
 if(rows.length>100) return {rows:[],quality:'truncated'};
 return {rows:rows.map(r=>({
  day:r.day,source:r.source,
  active_users:Number(r.active_users),
  new_users:Number(r.new_users),
  returning_users:Number(r.returning_users)
 })),quality:'observed'};
}
function channelContributions(channels,previousDay,currentDay,metric){
 if(channels.quality!=='observed')return [];
 const byDay=date=>new Map(channels.rows.filter(x=>x.day===date).map(x=>[x.source,x[metric]]));
 const old=byDay(previousDay),next=byDay(currentDay);
 return [...new Set([...old.keys(),...next.keys()])].map(source=>({
  metric,source,baseline:old.get(source)||0,current:next.get(source)||0,
  delta:(next.get(source)||0)-(old.get(source)||0)
 })).sort((a,b)=>a.delta-b.delta||a.source.localeCompare(b.source)).slice(0,8);
}
async function loadObservation({now=Date.now(),source='all',remote=require('../../data/hologres'),
 getNorthStar=require('../../data/businessEvidence').fetchNorthStar,getChannels=channelCounts}={}){
 const currentPeriod=previousBangkokDay(now),
  start=currentPeriod.start-DAY,end=currentPeriod.end;
 const snapshot=await remote.status();
 const north=await getNorthStar(start,end,source,snapshot);
 if(!north||!Array.isArray(north.days))throw Error('业务观测结果不完整');
 const [old,latest]=counts(north,[day(start),currentPeriod.day]);
 const health=sourceHealth(snapshot,end);
 let channels={rows:[],quality:'not-needed'};
 const significant=['active_users','new_users','returning_users'].some(metric=>{
  const a=old.totals[metric],b=latest.totals[metric];
  return a>=20&&Math.abs(b-a)>=5&&Math.abs(b-a)/a>=0.2;
 });
 if(significant){
  try{channels=await getChannels({remote,snapshot,start,end,source})}
  catch(error){channels={rows:[],quality:'unavailable',reason:String(error.message).slice(0,150)}}
 }
 return {baseline:{start,end:currentPeriod.start,...old},current:{
  start:currentPeriod.start,end,...latest
 },health,channels};
}
async function scanFreeGrowth({ownerId,goal,source='all',store,proposalStore=null,
 now=Date.now(),cache=null,load=loadObservation}={}){
 if(!ownerId||!METRICS[goal]||!store?.observe)throw Error('自动增长监控参数不合法');
 const key=ownerId+':'+source+':'+previousBangkokDay(now).day;
 let promise=cache?.get(key);
 if(!promise){promise=Promise.resolve().then(()=>load({now,source}));cache?.set(key,promise)}
 const o=await promise;
 const changes=METRICS[goal].map(metric=>{
  const a=o.baseline.totals[metric],b=o.current.totals[metric];
  return {metric,baseline:a,current:b,delta:b-a,
   relativeChange:a>0?(b-a)/a:null,
   bySource:channelContributions(o.channels,o.baseline.date,o.current.date,metric)};
 });
 const summary={currentDay:o.current.date,baselineDay:o.baseline.date,
  current:o.current.totals,baseline:o.baseline.totals,quality:o.health,
  channelQuality:o.channels.quality,changes,
  interpretation:o.health.complete?'可用于自动告警':'仅供观察，数据覆盖未验证；不能据此判定真实增长下降'};
 if(!o.health.complete)return {...summary,status:'coverage-unverified',observed:0,
  newObservations:0,reason:o.health.warning,paidCalls:0};
 const alerts=[];let proposedInvestigations=0;
 const metrics=signals({ownerId,goal,source,...o,
  channels:METRICS[goal].flatMap(metric=>channelContributions(
   o.channels,o.baseline.date,o.current.date,metric))});
 for(const signal of metrics){
  const alert=await store.observe(ownerId,signal,now);
  if(!alert)continue;
  alerts.push(alert);
  if(proposalStore&&signal.priority==='P0'&&signal.direction==='decline'){
   const proposed=await proposalStore.propose(ownerId,alert,{now});
   if(proposed)proposedInvestigations++;
  }
 }
 return {...summary,status:'scanned',observed:metrics.length,
  newObservations:alerts.length,proposedInvestigations,paidCalls:0,externalActions:0};
}
module.exports={counts,sourceHealth,signals,channelCounts,channelContributions,
 loadObservation,scanFreeGrowth};

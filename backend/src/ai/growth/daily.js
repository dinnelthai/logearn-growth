'use strict';
const {createHash}=require('node:crypto');
const {validateRange}=require('../../analytics/businessPriorities');
const DAY=86400000, BANGKOK_OFFSET=7*3600000;
function previousBangkokDay(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<2*DAY)throw Error('时间无效');
 const end=Math.floor((now+BANGKOK_OFFSET)/DAY)*DAY-BANGKOK_OFFSET;
 const start=end-DAY;
 validateRange(start,end,now);
 return {start,end,day:new Date(start+BANGKOK_OFFSET).toISOString().slice(0,10),timezone:'Asia/Bangkok'};
}
function dailyRequest({ownerId,now=Date.now(),goal='activation',source='all'}){
 if(typeof ownerId!=='string'||!ownerId.trim()||ownerId.length>256)throw Error('日报用户无效');
 if(!['activation','retention','conversion','revenue'].includes(goal))throw Error('日报目标无效');
 if(typeof source!=='string'||!source.trim()||source.length>200)throw Error('日报来源无效');
 const period=previousBangkokDay(now);
 const requestKey='growth-daily:v1:'+createHash('sha256').update(JSON.stringify([goal,source,period.day])).digest('hex').slice(0,32);
 return {ownerId,requestKey,title:'LogEarn 每日增长分析 · '+period.day,
  analysisType:'optimization',dateRangeStart:period.start,dateRangeEnd:period.end,
  businessScope:{source},userQuestion:'依据业务快照和已注册 Growth Skills 核对变化、采集覆盖与增长机会；不得捏造数值或自动执行运营动作。',
  focusGoal:goal,modelMode:'auto',period};
}
async function dispatchDaily({ownerId,now=Date.now(),goal='activation',source='all',records,enqueue,sharedReport=null}){
 if(!records?.createAnalysisRecord||typeof enqueue!=='function')throw Error('缺少调度存储或队列');
 const request=dailyRequest({ownerId,now,goal,source});
 if(sharedReport)require('./sharedDailyReport').validateDailyReport(sharedReport,{
  start:request.dateRangeStart,end:request.dateRangeEnd,source,goal});
 const record=await records.createAnalysisRecord({
   ownerId,requestKey:request.requestKey,title:request.title,analysisType:'optimization',
   dateRangeStart:request.dateRangeStart,dateRangeEnd:request.dateRangeEnd,
   businessScope:request.businessScope,userQuestion:request.userQuestion,
   dataSnapshot:sharedReport||{},filterConditions:{businessScope:request.businessScope,focusGoal:goal,
     modelMode:'auto',dailySchedule:'v1',date:request.period.day,
     ...(sharedReport?{sharedFactsVersion:'daily-preflight-v1',
       sharedFactsSnapshotId:sharedReport.snapshot.id}:{})}
 });
 if(record.status!=='pending')return {status:'already-'+record.status,analysisId:record.id,period:request.period};
 if(sharedReport){
  const persisted=require('./sharedDailyReport').fromClaimedRecord(record,{
   start:request.dateRangeStart,end:request.dateRangeEnd,source,goal});
  if(persisted?.snapshot.id!==sharedReport.snapshot.id)
   throw Error('固定的日报快照版本不同，禁止重新派发付费任务');
 }
 // The existing DB (owner_id, request_key) unique constraint is the durable
 // schedule dedupe; deterministic Bull job IDs cover concurrent schedulers.
 const job=await enqueue('business-analysis',{
   analysisId:record.id,ownerId,dateRangeStart:Number(record.date_range_start),
   dateRangeEnd:Number(record.date_range_end),businessScope:record.business_scope,
   userQuestion:record.user_question,focusGoal:record.filter_conditions.focusGoal,
   modelMode:'auto'
 },{jobId:'daily-'+record.id+'-'+Math.floor(Date.now()/600000),attempts:1});
 return {status:'queued',analysisId:record.id,jobId:job.id,period:request.period};
}
module.exports={previousBangkokDay,dailyRequest,dispatchDaily};

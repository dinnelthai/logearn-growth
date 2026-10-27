'use strict';
const {createHash}=require('node:crypto');
const pool=require('../../db/aiPool');
const {dateMs}=require('./seoStore');
const DAY=86400000;
const idFor=(owner,site,date)=>'gsc-job-'+createHash('sha256')
 .update(JSON.stringify([owner,site,date])).digest('hex').slice(0,32);
const fail=(msg,status=400)=>{throw Object.assign(Error(msg),{status})};
function targetDate(now=Date.now(),lagDays=3){
 if(!Number.isSafeInteger(now)||!Number.isSafeInteger(lagDays)||lagDays<3||lagDays>14)
  fail('GSC 数据成熟日配置无效');
 return new Date(Math.floor(now/DAY)*DAY-lagDays*DAY).toISOString().slice(0,10);
}
function createGscJobs(db=pool){
 async function plan(ownerId,siteUrl,{now=Date.now(),backfillDays=14,lagDays=3}={}){
  if(!ownerId||!siteUrl||!Number.isSafeInteger(backfillDays)||backfillDays<1||backfillDays>31)
   fail('GSC 同步计划参数无效');
  const last=targetDate(now,lagDays),planned=[];
  for(let i=backfillDays-1;i>=0;i--){
   const date=new Date(dateMs(last)-i*DAY).toISOString().slice(0,10);
   const id=idFor(ownerId,siteUrl,date);
   const r=await db.query(`INSERT INTO ai_growth_gsc_sync_jobs
    (id,owner_id,site_url,target_date,state,next_attempt_at,created_at,updated_at)
    VALUES($1,$2,$3,$4::date,'pending',$5,$5,$5)
    ON CONFLICT(owner_id,site_url,target_date) DO NOTHING RETURNING id`,
    [id,ownerId,siteUrl,date,now]);
   if(r.rows.length)planned.push(date);
  }
  return {planned,alreadyPlanned:backfillDays-planned.length,lastDate:last};
 }
 async function claim({now=Date.now(),owners=[],limit=10}={}){
  if(!Array.isArray(owners)||!owners.length||owners.length>100||
     owners.some(o=>typeof o!=='string'||!o)||!Number.isSafeInteger(limit)||limit<1||limit>20)
   fail('GSC 调度需显式授权用户列表');
  const r=await db.query(`WITH eligible AS (
    SELECT id FROM ai_growth_gsc_sync_jobs WHERE owner_id=ANY($1::text[])
      AND ((state='pending' AND next_attempt_at<=$2) OR
       (state='running' AND lease_until<$2))
      AND attempts<5
    ORDER BY target_date ASC,id ASC FOR UPDATE SKIP LOCKED LIMIT $3
   )
   UPDATE ai_growth_gsc_sync_jobs j
      SET state='running',attempts=j.attempts+1,
       lease_until=$2+120000,next_attempt_at=$2+120000,
       updated_at=$2
     FROM eligible WHERE j.id=eligible.id
   RETURNING j.id,j.owner_id,j.site_url,j.target_date::text,j.attempts`,
   [owners,now,limit]);return r.rows;
 }
 async function finish(job,{snapshotId=null,error=null,now=Date.now()}={}){
  if(!job?.id||!Number.isInteger(job.attempts))fail('GSC 同步任务参数无效');
  const attempts=job.attempts;
  const backoff=Math.min(24*3600000,Math.pow(2,attempts)*60000);
  const failState=attempts>=5?'failed':'pending';
  const r=await db.query(`UPDATE ai_growth_gsc_sync_jobs SET
    state=$3,lease_until=NULL,last_error=$4,snapshot_id=$5,
    next_attempt_at=$6,updated_at=$7
    WHERE id=$1 AND owner_id=$2 AND state='running' AND attempts=$8
      AND lease_until>=$7 RETURNING id,state`,
   [job.id,job.owner_id,error?failState:'done',
    error?String(error.message||error).slice(0,400):null,
    error?null:snapshotId,error?now+backoff:now,now,attempts]);
  return r.rows[0]||null;
 }
 async function list(ownerId,{limit=50}={}){
  if(!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('同步任务查询参数无效');
  const r=await db.query(`SELECT id,site_url,target_date::text,state,attempts,
    next_attempt_at,last_error,snapshot_id,updated_at
    FROM ai_growth_gsc_sync_jobs WHERE owner_id=$1
    ORDER BY target_date DESC LIMIT $2`,[ownerId,limit]);
  return r.rows;
 }
 async function retry(ownerId,id,{now=Date.now()}={}){
  const r=await db.query(`UPDATE ai_growth_gsc_sync_jobs SET
    state='pending',attempts=0,next_attempt_at=$3,lease_until=NULL,
    last_error=NULL,updated_at=$3
   WHERE id=$1 AND owner_id=$2 AND state='failed' RETURNING id`,[id,ownerId,now]);
  return r.rows[0]||null;
 }
 return {plan,claim,finish,list,retry};
}
async function tickGsc({owners,now=Date.now(),service=require('./gscService').createGscService(),
 jobs=createGscJobs(),scan=require('./seoOperations').scanSeo,backfillDays=14}){
 if(!Array.isArray(owners)||!owners.length)fail('没有明确的同步用户');
 const results=[];
 for(const ownerId of owners){
  try{
   const connected=await service.connection(ownerId);
   if(!connected.selectedSite){results.push({ownerId,status:'unconfigured'});continue}
   const plan=await jobs.plan(ownerId,connected.selectedSite,{now,backfillDays});
   results.push({ownerId,status:'planned',...plan});
  }catch(error){results.push({ownerId,status:'planning-failed',reason:error.message})}
 }
 const claimed=await jobs.claim({now,owners,limit:10});
 for(const job of claimed){
  try{
   const sync=await service.sync(job.owner_id,{
    startDate:job.target_date,endDate:job.target_date});
   const finished=await jobs.finish(job,{snapshotId:sync.report.snapshotId,now:Date.now()});
   if(finished){
    const findings=await scan(job.owner_id,{now:Date.now(),siteUrl:job.site_url});
    results.push({ownerId:job.owner_id,date:job.target_date,status:'done',
     seoTasks:findings.newTasks||0});
   }else results.push({ownerId:job.owner_id,date:job.target_date,status:'lease-lost'});
  }catch(error){
   await jobs.finish(job,{error,now:Date.now()}).catch(()=>{});
   results.push({ownerId:job.owner_id,date:job.target_date,status:'retry-scheduled',
    reason:error.message});
  }
 }
 return results;
}
module.exports={targetDate,idFor,createGscJobs,tickGsc};

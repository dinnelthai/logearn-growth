'use strict';
// Mount only behind the application's existing `requireAuth` middleware.
// Existing workspace routes are read-only for external services. Weekly AI runs require an explicit POST and use the existing paid-call guards.
const express=require('express');
const {workspaceStore}=require('../ai/growth/workspace/store');
const {currentMonth}=require('../ai/growth/workspace/period');
const {requiredString}=require('../ai/growth/workspace/contracts');
function createRouter({db=require('../db/connection')}={}){
 const router=express.Router();const store=workspaceStore(db);
 const h=fn=>async(req,res)=>{try{
  if(!req.user?.user_id)return res.status(401).json({error:'未登录'});
  await fn(req,res,String(req.user.user_id));
 }catch(e){const known=Number.isInteger(e.status)&&e.status>=400&&e.status<500;const status=known?e.status:503;return res.status(status).json({error:known?e.message:'工作台服务暂不可用；请先核验数据库迁移与 API/Worker 拓扑'})}};
 const num=(v,defaultValue)=>v===undefined?defaultValue:Number(v);
 router.get('/dashboard',h(async(req,res,owner)=>{
  const month=currentMonth();
  // API reads use previously persisted owner-scoped evidence only.
  // Refreshes run in the leased daily scheduler, never on a page GET.
  const goals=store.listGoals(owner,{start:month.start,end:month.end})
   .map(goal=>({goal,progress:store.progress(owner,goal.id).progress}));
  res.json({version:'growth-workspace-v1',month,goals,problems:store.problems(owner),actions:store.actions(owner),reports:store.reportList(owner),quality:store.qualitySummary(owner),externalActions:0,modelCalls:0});
 }));
 router.post('/goals',h(async(req,res,owner)=>res.status(201).json(store.saveGoal(owner,req.body||{}))));
 router.get('/goals',h(async(req,res,owner)=>res.json({goals:store.listGoals(owner,{asOf:num(req.query.at,Date.now()),versions:req.query.versions==='1'})})));
 router.get('/goals/:id',h(async(req,res,owner)=>{const g=store.goalById(owner,req.params.id,req.query.version?Number(req.query.version):null);res.status(g?200:404).json(g||{error:'目标不存在'})}));
 router.get('/goals/:id/progress',h(async(req,res,owner)=>res.json(store.progress(owner,req.params.id,{evidenceId:req.query.evidenceId||null}))));
 router.post('/problems',h(async(req,res,owner)=>{
  const body=req.body||{};
  res.status(201).json(store.observeProblem(owner,{type:'user',subject:requiredString(body.subject,'研究主题',256),description:requiredString(body.description||body.subject,'研究问题',2000),scope:body.scope||{source:'all'},nextStep:'在授权范围内核对相关业务证据',priority:2}));
 }));
 router.get('/problems',h(async(req,res,owner)=>res.json({problems:store.problems(owner,{status:req.query.status||null,limit:num(req.query.limit,50)})})));
 router.get('/problems/:id',h(async(req,res,owner)=>{const p=store.problem(owner,req.params.id);res.status(p?200:404).json(p?{problem:p,history:store.problemEvents(owner,p.id)}:{error:'不存在'})}));
 router.post('/problems/:id/status',h(async(req,res,owner)=>res.json(store.setProblemStatus(owner,req.params.id,req.body?.status,{reason:req.body?.reason,expectedStatus:req.body?.expectedStatus}))));
 router.post('/problems/:id/review',h(async(req,res,owner)=>res.json(store.reviewProblem(owner,req.params.id,req.body?.verdict,req.body?.reason||''))));
 router.post('/problems/:id/investigations',h(async(req,res,owner)=>res.status(201).json(store.startRun(owner,req.params.id,{mode:'manual'}))));
 router.get('/investigations/:id',h(async(req,res,owner)=>{const run=store.run(owner,req.params.id);res.status(run?200:404).json(run||{error:'不存在'})}));
 router.post('/investigations/:id/cancel',h(async(req,res,owner)=>res.json(store.cancelRun(owner,req.params.id))));
 router.post('/questions/:id/answer',h(async(req,res,owner)=>res.json(store.answer(owner,req.params.id,req.body?.answer))));
 router.post('/problems/:id/link-task',h(async(req,res,owner)=>res.json(store.linkOperationTask(owner,req.params.id,req.body?.taskId))));
 router.post('/problems/:id/actions',h(async(req,res,owner)=>res.status(201).json(store.createAction(owner,req.params.id,req.body||{}))));
 router.post('/actions/:id/status',h(async(req,res,owner)=>res.json(store.updateAction(owner,req.params.id,req.body?.status,req.body||{}))));
 router.post('/actions/:id/review',h(async(req,res,owner)=>res.json(store.reviewAction(owner,req.params.id,req.body||{}))));
 router.get('/evidence/:id',h(async(req,res,owner)=>{const evidence=store.getEvidence(owner,req.params.id);res.status(evidence?200:404).json(evidence||{error:'证据不存在'})}));
 // Last *completed* Monday-Sunday period, computed server-side in Bangkok time.
 // All report queries use the shared, owner-scoped AI record store.
 router.get('/ai-weekly-reports',h(async(req,res,owner)=>{
  const records=require('../db/aiRecords');
  const {weeklyPeriod}=require('../ai/growth/weeklyReport');
  res.json({period:weeklyPeriod(),
   reports:await records.listWeeklyReportRecords(owner,{limit:20}),paidGeneration:false});
 }));
 router.post('/ai-weekly-reports',h(async(req,res,owner)=>{
  const {weeklyPeriod,weeklyKey,weeklyOperations}=require('../ai/growth/weeklyReport');
  const records=require('../db/aiRecords');
  const period=weeklyPeriod();
  const requestKey=weeklyKey(period);
  const prior=await records.listWeeklyReportRecords(owner,{limit:50});
  const existing=prior.find(row=>Number(row.date_range_start)===period.start&&Number(row.date_range_end)===period.end);
  if(existing)return res.json({analysisId:existing.id,status:existing.status,reused:true,notice:'本周已有周报任务，不会重复触发模型'});
  const operations=weeklyOperations(store,owner,period);
  const userQuestion='请对本周 LogEarn 业务增长与运营工作输出可核对的完整 AI 运营周报：本周变化、核心漏斗、重要异常、渠道证据、人工运营工作量、下周优先事项和数据缺口。严禁无数据归因或编造业务指标。';
  const focusGoal='activation',scope={source:'all'},modelMode='auto',title='AI 运营周报 · '+new Date(period.start+25200000).toISOString().slice(0,10);
  const {record,created}=await records.createWeeklyReportRecord({
   ownerId:owner,requestKey,title,start:period.start,end:period.end,question:userQuestion,
   conditions:{businessScope:scope,focusGoal,modelMode,evidenceReportId:null,
    goalRef:null,skillId:null,weeklyReport:'v1',weeklyOperations:operations}
  });
  if(record.filter_conditions?.weeklyReport!=='v1'||
     Number(record.date_range_start)!==period.start||Number(record.date_range_end)!==period.end)
   return res.status(409).json({error:'周报请求标识与已保存任务不一致，禁止重复付费'});
  if(!created)return res.json({analysisId:record.id,status:record.status,reused:true,
   notice:'已存在本周 AI 周报任务，未重复提交模型调用'});
  try{
   const job=await require('../queues/queues').addAIAnalysisJob('business-analysis',{
    analysisId:record.id,ownerId:owner,dateRangeStart:period.start,dateRangeEnd:period.end,
    businessScope:scope,userQuestion,focusGoal,modelMode,skillId:null
   },{jobId:record.id,attempts:1});
   res.status(202).json({analysisId:record.id,jobId:job.id,status:record.status,queued:true,
    notice:'AI 周报已提交到现有分析队列，模型调用可能产生费用。'});
  }catch(error){
   // The task is durable. Do not fabricate a successful queue dispatch.
   await records.updateAnalysisStatus(record.id,'failed',null,'队列提交失败：'+error.message);
   throw error;
  }
 }));
 // Only a human can deliberately authorize another paid task when the last
 // model call timed out with UNKNOWN cost. Preserve the failed record and ledger.
 // Never reset its original request key or replay the old unknown provider call.
 router.post('/ai-weekly-reports/:id/new-attempt',h(async(req,res,owner)=>{
  if(req.body?.acceptPotentialDuplicateCharge!==true)
   return res.status(400).json({error:'需要明确确认此前模型请求可能已计费，本次将新建付费任务'});
  const records=require('../db/aiRecords');
  const {weeklyPeriod,weeklyKey}=require('../ai/growth/weeklyReport');
  const period=weeklyPeriod();
  const previous=await records.getAnalysisRecord(req.params.id,owner);
  if(!previous||previous.filter_conditions?.weeklyReport!=='v1')
   return res.status(404).json({error:'原周报不存在或无访问权限'});
  if(previous.status!=='failed'||previous.cancel_requested||
     previous.filter_conditions?.weeklyReissueOf||
     !/(?:timed out|timeout|请求超时|模型请求超时)/i.test(previous.error_message||'')||
     Number(previous.date_range_start)!==period.start||
     Number(previous.date_range_end)!==period.end)
   return res.status(409).json({error:'只有本周首次请求超时且费用未知的周报可人工新建一次'});
  const ledger=await records.listAnalysisPaidCalls(previous.id,owner);
  if(!ledger.some(call=>['unknown','started'].includes(call.status)))
   return res.status(409).json({error:'前一次调用账本不是未确认状态，禁止绕过原任务'});
  const requestKey=weeklyKey(period)+':manual-timeout:'+previous.id;
  const conditions={...previous.filter_conditions,weeklyReissueOf:previous.id};
  const {record,created}=await records.createWeeklyReportRecord({
   ownerId:owner,requestKey,
   title:'AI 运营周报 · 人工新尝试 · '+new Date(period.start+25200000).toISOString().slice(0,10),
   start:period.start,end:period.end,question:previous.user_question,conditions
  });
  if(!created)return res.json({analysisId:record.id,status:record.status,reused:true,
   notice:'已有人工新尝试，未再次提交付费调用'});
  try{
   const job=await require('../queues/queues').addAIAnalysisJob('business-analysis',{
    analysisId:record.id,ownerId:owner,dateRangeStart:period.start,dateRangeEnd:period.end,
    businessScope:{source:'all'},userQuestion:previous.user_question,
    focusGoal:conditions.focusGoal||'activation',modelMode:conditions.modelMode||'auto'
   },{jobId:record.id,attempts:1});
   res.status(202).json({analysisId:record.id,jobId:job.id,status:record.status,queued:true,
    notice:'人工发起新的付费周报任务；原超时任务及未确认费用保持不变'});
  }catch(error){
   await records.updateAnalysisStatus(record.id,'failed',null,'队列提交失败：'+error.message);
   throw error;
  }
 }));
 router.get('/reports',h(async(req,res,owner)=>res.json({reports:store.reportList(owner,{kind:req.query.kind||null})})));
 router.post('/reports/:kind',h(async(req,res,owner)=>{const report=store.buildReport(owner,req.params.kind,{publish:req.body?.publish===true,forceRevision:req.body?.forceRevision===true});res.json(report)}));
 router.get('/quality',h(async(req,res,owner)=>res.json(store.qualitySummary(owner))));
 return router;
}
module.exports={createRouter};

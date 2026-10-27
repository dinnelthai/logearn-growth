const express=require('express'),{randomUUID}=require('node:crypto');
const router=express.Router();
const {addAIAnalysisJob,getJobStatus}=require('../queues/queues');
const records=require('../db/aiRecords');
const {validateRange,validateScope,reviewPeriods}=require('../ai/business/policy');
const handle=fn=>async(req,res)=>{try{await fn(req,res)}catch(e){console.error('[AI API]',e.message);res.status(e.status||503).json({error:e.message})}};
const paging=req=>{
  const limit=Number(req.query.limit||20),offset=Number(req.query.offset||0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)throw Object.assign(Error('分页参数无效'),{status:400});
  return {limit,offset,status:req.query.status||null};
};
router.post('/analyze',handle(async(req,res)=>{
  const {title,analysisType='optimization',dateRangeStart:start,dateRangeEnd:end,userQuestion='',focusGoal='activation',modelMode='auto',evidenceReportId=null,goalRef=null}=req.body;
  validateRange(start,end);const businessScope=validateScope(req.body.businessScope);
  if(typeof title!=='string'||!title.trim()||title.length>200||typeof userQuestion!=='string'||userQuestion.length>5000
    ||!['optimization','anomaly'].includes(analysisType)||!['activation','retention','conversion','revenue'].includes(focusGoal)||!['auto','complex'].includes(modelMode))
    return res.status(400).json({error:'分析标题、类型、目标或模型模式无效'});
  const requestKey=req.body.requestKey||randomUUID();
  if(typeof requestKey!=='string'||requestKey.length>100)return res.status(400).json({error:'请求标识无效'});
  const ownerId=req.user.user_id;
  if(goalRef){
    if(typeof goalRef.id!=='string'||!Number.isSafeInteger(goalRef.version)||goalRef.version<1)return res.status(400).json({error:'目标版本格式无效'});
    if(!require('../ai/business/context').createContextStore(require('../db/connection')).getGoal(ownerId,goalRef.id,goalRef.version))return res.status(404).json({error:'目标不存在或无权限'});
  }
  if(evidenceReportId){
    if(typeof evidenceReportId!=='string')return res.status(400).json({error:'业务报告标识无效'});
    const report=require('../db/businessReports').createStore(require('../db/connection')).get(evidenceReportId,ownerId);
    if(!report)return res.status(404).json({error:'业务报告不存在或无权访问'});
    if(report.period.start!==start||report.period.end!==end||report.focusGoal!==focusGoal||report.business.scope.source!==businessScope.source)return res.status(400).json({error:'AI分析范围须与原始业务报告一致'});
  }
  const record=await records.createAnalysisRecord({ownerId,requestKey,title,analysisType,dateRangeStart:start,dateRangeEnd:end,
    businessScope,userQuestion,dataSnapshot:{},filterConditions:{businessScope,focusGoal,modelMode,evidenceReportId,goalRef}});
  if(record.status==='completed')return res.json({analysisId:record.id,status:'completed',jobId:record.id});
  if (Number(record.date_range_start)!==start || Number(record.date_range_end)!==end || record.user_question!==userQuestion || record.business_scope.source!==businessScope.source || record.filter_conditions.focusGoal!==focusGoal || record.filter_conditions.modelMode!==modelMode || (record.filter_conditions.evidenceReportId||null)!==evidenceReportId || JSON.stringify(record.filter_conditions.goalRef||null)!==JSON.stringify(goalRef)) return res.status(409).json({error:'请求标识已用于不同分析，请重新发起'});
  let job;
  try { job=await addAIAnalysisJob('business-analysis',{analysisId:record.id,ownerId,dateRangeStart:start,dateRangeEnd:end,
    businessScope,userQuestion,focusGoal,modelMode,evidenceReportId,goalRef},{jobId:record.id,attempts:1});
  } catch(error) { await records.updateAnalysisStatus(record.id,'failed',null,error.message);throw error; }
  res.status(202).json({analysisId:record.id,jobId:job.id,status:'pending'});
}));
router.post('/:id/retry',handle(async(req,res)=>{
  const record=await records.claimAnalysisRetry(req.params.id,req.user.user_id);
  if(!record)return res.status(409).json({error:'仅能重试自己已失败的分析'});
  try {
    const job=await addAIAnalysisJob('business-analysis',{analysisId:record.id,ownerId:req.user.user_id,
      dateRangeStart:Number(record.date_range_start),dateRangeEnd:Number(record.date_range_end),businessScope:record.business_scope,
      userQuestion:record.user_question,focusGoal:record.filter_conditions.focusGoal||'activation',modelMode:record.filter_conditions.modelMode||'auto',evidenceReportId:record.filter_conditions.evidenceReportId||null,goalRef:record.filter_conditions.goalRef||null},
      {jobId:record.id+'-'+randomUUID(),attempts:1});
    res.status(202).json({analysisId:record.id,jobId:job.id,status:'pending'});
  }catch(error){await records.updateAnalysisStatus(record.id,'failed',null,error.message);throw error;}
}));
router.get('/list',handle(async(req,res)=>{
  const opts=paging(req),rows=await records.listAnalysisRecords(req.user.user_id,opts);
  res.json({records:rows,count:rows.length,...opts});
}));
router.get('/cost-stats',handle(async(req,res)=>{
  const {startTime,endTime}=req.query;
  for(const value of [startTime,endTime])if(value!=null&&(!Number.isSafeInteger(Number(value))||Number(value)<0))return res.status(400).json({error:'成本统计时间无效'});
  res.json(await records.getUserCostStats(req.user.user_id,startTime?Number(startTime):null,endTime?Number(endTime):null));
}));
router.get('/suggestions/list',handle(async(req,res)=>res.json({suggestions:await records.listSuggestions(req.user.user_id,paging(req))})));
router.put('/suggestions/:id/status',handle(async(req,res)=>{
  const {userStatus,actualAction,actionScope,executedAt,rejectionReason}=req.body;
  if(!['pending','adopted','executing','executed','rejected','invalid'].includes(userStatus))return res.status(400).json({error:'建议状态无效'});
  const current=await records.getSuggestion(req.params.id,req.user.user_id);
  if(!current)return res.status(404).json({error:'建议不存在'});
  const updates={};
  if(rejectionReason!=null){if(typeof rejectionReason!=='string'||rejectionReason.length>5000)return res.status(400).json({error:'拒绝原因无效'});updates.rejectionReason=rejectionReason;}
  if(userStatus==='rejected'&&!updates.rejectionReason)return res.status(400).json({error:'请记录拒绝原因，供下次分析参考'});
  if(actualAction!=null){if(typeof actualAction!=='string'||actualAction.length>5000)return res.status(400).json({error:'实际行动无效'});updates.actualAction=actualAction;}
  if(actionScope!=null)updates.actionScope=validateScope(actionScope);
  if(userStatus==='executed'){
    if(!(actualAction||current.actual_action)?.trim())return res.status(400).json({error:'请记录实际执行的行动'});
    updates.executedAt=executedAt ?? (Number(current.executed_at)||Date.now());
    if(!Number.isSafeInteger(updates.executedAt)||updates.executedAt<0||updates.executedAt>Date.now())return res.status(400).json({error:'执行时间无效'});
    updates.executedBy=req.user.user_id;
  }
  res.json(await records.updateSuggestionStatus(req.params.id,req.user.user_id,userStatus,updates));
}));
router.post('/suggestions/:id/retrospective',handle(async(req,res)=>{
  const ownerId=req.user.user_id,s=await records.getSuggestion(req.params.id,ownerId);
  if(!s)return res.status(404).json({error:'建议不存在'});
  if(s.user_status!=='executed')return res.status(400).json({error:'只能复盘已执行的建议'});
  reviewPeriods(Number(s.executed_at));
  const id=req.body.requestKey||randomUUID();
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(id))return res.status(400).json({error:'请求标识无效'});
  const {createHash}=require('node:crypto');
  const retrospectiveId=createHash('sha256').update(JSON.stringify([ownerId,s.id,id])).digest('hex');
  const job=await addAIAnalysisJob('retrospective',{retrospectiveId,suggestionId:s.id,ownerId,triggeredBy:ownerId},{jobId:retrospectiveId,attempts:1});
  res.status(202).json({retrospectiveId,jobId:job.id,status:'pending'});
}));
router.get('/retrospectives/list',handle(async(req,res)=>res.json({retrospectives:await records.listRetrospectives(req.user.user_id,paging(req))})));
router.get('/retrospectives/:id',handle(async(req,res)=>{
  const record=await records.getRetrospective(req.params.id,req.user.user_id);
  if(!record)return res.status(404).json({error:'复盘不存在'});
  res.json(record);
}));
router.get('/jobs/:jobId/status',handle(async(req,res)=>{
  const status=await getJobStatus('aiAnalysis',req.params.jobId);
  if(!status.exists)return res.status(404).json({error:'任务不存在或已过期，请查阅持久化分析记录'});
  if(status.data?.ownerId!==req.user.user_id)return res.status(403).json({error:'无权访问任务'});
  res.json({jobId:status.id,state:status.state,progress:status.progress,result:status.returnvalue,error:status.failedReason});
}));
router.get('/:id',handle(async(req,res)=>{
  const record=await records.getAnalysisRecord(req.params.id,req.user.user_id);
  if(!record)return res.status(404).json({error:'分析不存在'});
  res.json({...record,suggestions:await records.listSuggestionsByAnalysis(record.id,req.user.user_id)});
}));
module.exports=router;

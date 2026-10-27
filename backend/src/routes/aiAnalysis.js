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
// Connected Search Console settings: server-side API credentials only, no
// credentials are accepted from or returned to the browser.
router.get('/growth-seo/gsc/connection',handle(async(req,res)=>{
  const state=await require('../ai/growth/gscService').createGscService()
    .connection(req.user.user_id);
  res.json({...state,readOnly:true,paidCalls:0});
}));
router.put('/growth-seo/gsc/settings',handle(async(req,res)=>{
  if(typeof req.body?.siteUrl!=='string')
   return res.status(400).json({error:'请选择已经由服务端授权的 Search Console 资源'});
  const value=await require('../ai/growth/gscService').createGscService()
    .select(req.user.user_id,req.body.siteUrl);
  res.json({...value,paidCalls:0});
}));
router.get('/growth-seo/gsc/report',handle(async(req,res)=>{
  const store=require('../ai/growth/gscService').createGscService();
  const record=await store.latest(req.user.user_id,{
    startDate:req.query.startDate||null,endDate:req.query.endDate||null
  });
  if(!record)return res.json({available:false,reason:'尚未同步该站点与日期范围的 Search Console API 数据',
    paidCalls:0});
  const report=require('../ai/growth/gscService').summarizeGsc(record);
  res.json({available:true,report,paidCalls:0});
}));
router.post('/growth-seo/gsc/sync',handle(async(req,res)=>{
  const {startDate,endDate}=req.body||{};
  const result=await require('../ai/growth/gscService').createGscService()
   .sync(req.user.user_id,{startDate,endDate});
  res.json({...result,externalActions:0,paidCalls:0});
}));
// Specialty evidence ingestion/read paths are operator initiated and have
// no model calls. GSC exports are explicitly unverified user-provided data.
router.get('/growth-seo/imports',handle(async(req,res)=>{
  const imports=await require('../ai/growth/seoStore').createSeoStore()
    .list(req.user.user_id,{limit:50});
  res.json({imports,source:'gsc-manual-export',googleConnected:false,paidCalls:0});
}));
router.post('/growth-seo/import',handle(async(req,res)=>{
  const value=await require('../ai/growth/seoStore').createSeoStore()
    .importSnapshot(req.user.user_id,req.body);
  res.status(value.created?201:200).json({...value,googleConnected:false,paidCalls:0});
}));
router.post('/growth-seo/preview',handle(async(req,res)=>{
  if(typeof req.body?.snapshotId!=='string'||req.body.snapshotId.length>128)
    return res.status(400).json({error:'SEO 快照 ID 无效'});
  const store=require('../ai/growth/seoStore').createSeoStore();
  const record=await store.get(req.user.user_id,req.body.snapshotId);
  if(!record)return res.status(404).json({error:'SEO 快照不存在或无权限'});
  const report=require('../ai/growth/seoStore').summarizeSeo(record,{
    startDate:req.body.startDate||record.start_date,
    endDate:req.body.endDate||record.end_date,limit:20
  });
  res.json({report,dispatched:false,paidCalls:0});
}));
router.post('/growth-kol/preview',handle(async(req,res)=>{
  const {start,end}=req.body||{};
  validateRange(start,end);
  const source=req.body?.source||'all';
  if(source!=='all')return res.status(400).json({error:'KOL 归组效果只支持全来源范围'});
  const report=await require('../ai/growth/kolReader').createKolReader().summarize({
    ownerId:req.user.user_id,start,end,source,limit:20
  });
  res.json({report,dispatched:false,paidCalls:0});
}));
router.get('/growth-skills',handle(async(req,res)=>{
  res.json({version:'growth-skills-v1',
    skills:require('../ai/growth/skills').listSkills(),
    execution:'read-only-tools; no automatic external actions'});
}));
router.post('/growth-signals',handle(async(req,res)=>{
  const reportId=req.body?.reportId;
  if(typeof reportId!=='string'||!reportId.trim()||reportId.length>256)
    return res.status(400).json({error:'需要已保存的业务报告 ID'});
  const report=require('../db/businessReports').createStore(require('../db/connection')).get(reportId,req.user.user_id);
  if(!report)return res.status(404).json({error:'业务报告不存在或无权限'});
  const triage=require('../ai/growth/triage').detectGrowthSignals(report);
  res.json({triage,dispatched:false,paidCalls:0});
}));
router.post('/growth-plan',handle(async(req,res)=>{
  const reportId=req.body?.reportId;
  if(typeof reportId!=='string'||!reportId.trim()||reportId.length>256)
    return res.status(400).json({error:'需要已保存的业务报告 ID'});
  const ownerId=req.user.user_id;
  const report=require('../db/businessReports').createStore(require('../db/connection')).get(reportId,ownerId);
  if(!report)return res.status(404).json({error:'业务报告不存在或无权限'});
  const goal=req.body.goal||report.focusGoal||report.business?.focusGoal||'activation';
  const history=await records.getAnalysisMemory(ownerId,report.business.scope.source);
  const plan=require('../ai/growth/planner').planGrowthInvestigation({
    goal,report,maxSkills:3,history,focusSkillId:req.body?.skillId||null
  });
  res.json({plan,dispatched:false});
}));
router.post('/analyze',handle(async(req,res)=>{
  const {title,analysisType='optimization',dateRangeStart:start,dateRangeEnd:end,userQuestion='',focusGoal='activation',modelMode='auto',evidenceReportId=null,goalRef=null,skillId=null}=req.body;
  validateRange(start,end);const businessScope=validateScope(req.body.businessScope);
  if(typeof title!=='string'||!title.trim()||title.length>200||typeof userQuestion!=='string'||userQuestion.length>5000
    ||!['optimization','anomaly'].includes(analysisType)||!['activation','retention','conversion','revenue'].includes(focusGoal)||!['auto','complex'].includes(modelMode))
    return res.status(400).json({error:'分析标题、类型、目标或模型模式无效'});
  if(skillId!=null&&(!['seo-organic','kol-impact'].includes(skillId)||
    !(skillId==='seo-organic'?['activation','conversion']:['conversion','revenue']).includes(focusGoal)||
    businessScope.source!=='all'))
    return res.status(400).json({error:'SEO/KOL 专项技能须匹配目标且使用全来源范围'});
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
    businessScope,userQuestion,dataSnapshot:{},filterConditions:{businessScope,focusGoal,modelMode,evidenceReportId,goalRef,skillId}});

  if (Number(record.date_range_start)!==start || Number(record.date_range_end)!==end || record.user_question!==userQuestion || record.business_scope.source!==businessScope.source || record.filter_conditions.focusGoal!==focusGoal || record.filter_conditions.modelMode!==modelMode || (record.filter_conditions.evidenceReportId||null)!==evidenceReportId || JSON.stringify(record.filter_conditions.goalRef||null)!==JSON.stringify(goalRef) || (record.filter_conditions.skillId||null)!==skillId) return res.status(409).json({error:'请求标识已用于不同分析，请重新发起'});
  if(record.status==='completed')return res.json({analysisId:record.id,status:'completed',jobId:record.id});
  let job;
  try { job=await addAIAnalysisJob('business-analysis',{analysisId:record.id,ownerId,dateRangeStart:start,dateRangeEnd:end,
    businessScope,userQuestion,focusGoal,modelMode,evidenceReportId,goalRef,skillId},{jobId:record.id,attempts:1});
  } catch(error) { await records.updateAnalysisStatus(record.id,'failed',null,error.message);throw error; }
  res.status(202).json({analysisId:record.id,jobId:job.id,status:'pending'});
}));
router.post('/:id/resume',handle(async(req,res)=>{
  const ownerId=req.user.user_id;
  const record=await records.getAnalysisRecord(req.params.id,ownerId);
  if(!record)return res.status(404).json({error:'分析不存在或无权限'});
  if(record.cancel_requested||record.status!=='processing'||!record.lease_expires_at||
     Number(record.lease_expires_at)>=Date.now())
    return res.status(409).json({error:'仅可恢复未取消且执行租约已过期的调查'});
  const shared=await records.listAnalysisPaidCalls(record.id,ownerId);
  if(!shared.length||shared.some(row=>row.status!=='received'))
    return res.status(409).json({error:'模型调用存在未确认状态，或缺少可恢复的调用记录',reason:'unconfirmed-paid-call'});
  // The Worker validates shared paid-call states, journal rounds, the exact
  // context hash and each tool checkpoint before making any new paid call.
  const job=await addAIAnalysisJob('resume-investigation',
    {analysisId:record.id,ownerId},
    {jobId:'manual-resume-'+record.id+'-'+Math.floor(Date.now()/60000),attempts:1});
  res.status(202).json({analysisId:record.id,jobId:job.id,status:'queued',
    notice:'将优先复用已完成步骤；如果后续需要新的模型轮次，仍可能产生费用'});
}));
router.post('/:id/cancel',handle(async(req,res)=>{
  const updated=await records.requestAnalysisCancellation(req.params.id,req.user.user_id);
  if(!updated)return res.status(409).json({error:'任务不存在、无权限或已经结束'});
  // Cooperative cancellation does not revoke an already-dispatched provider call.
  // All subsequent paid calls and final writes are fenced by DB status/token.
  res.json({analysisId:updated.id,status:updated.status,cancelRequested:updated.cancel_requested,
    notice:'取消请求已记录；正在进行的模型请求可能仍会产生费用'});
}));
router.post('/:id/retry',handle(async(req,res)=>{
  const ownerId=req.user.user_id;
  const existing=await records.getAnalysisRecord(req.params.id,ownerId);
  if(!existing||existing.status!=='failed')return res.status(409).json({error:'仅能重试自己已失败的分析'});
  // A different Worker replica may own a different local SQLite file.
  // Shared PostgreSQL paid-call entries are an independent replay blocker.
  if(await records.hasAnalysisPaidCalls(existing.id,ownerId))
    return res.status(409).json({error:'存在已发起的模型调用，禁止跨 Worker 重试',reason:'shared-paid-call-guard'});
  // The trace journal is the authority on whether paid work may already exist.
  // If it is unavailable, the request fails without changing persistent status.
  const calls=require('../ai/business/trace').createTraceStore(require('../db/connection')).list(ownerId,existing.id);
  const verdict=require('../ai/business/retrySafety').assessRetry(existing,calls);
  if(!verdict.allowed)return res.status(409).json({error:'已有模型调用记录，禁止从头重试以免重复计费；需要人工核查后创建新的分析',reason:verdict.reason});
  const record=await records.claimAnalysisRetry(req.params.id,ownerId);
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
router.get('/growth-budget',handle(async(req,res)=>{
  const budget=await require('../ai/growth/budget').dailyBudgetStatus(req.user.user_id);
  res.json(budget);
}));
router.get('/growth-investigations',handle(async(req,res)=>{
  const proposals=await require('../ai/growth/investigationStore')
    .createInvestigationStore().list(req.user.user_id,{limit:100});
  res.json({version:'growth-investigation-proposals-v1',proposals,
    requiresHumanApproval:true,automaticPaidCalls:false});
}));
router.get('/growth-investigations/:id/timeline',handle(async(req,res)=>{
  const timeline=await require('../ai/growth/investigationTimeline')
    .createInvestigationTimeline().get(req.user.user_id,req.params.id);
  if(!timeline)return res.status(404).json({error:'调查提案不存在或无权限'});
  res.json(timeline);
}));
router.post('/growth-investigations/:id/action',handle(async(req,res)=>{
  const ownerId=req.user.user_id;
  const {action,expectedVersion}=req.body||{};
  if(!['approve','dismiss'].includes(action)||!Number.isSafeInteger(expectedVersion))
    return res.status(400).json({error:'操作类型或版本无效'});
  const store=require('../ai/growth/investigationStore').createInvestigationStore();
  let proposal=await store.get(ownerId,req.params.id);
  if(!proposal)return res.status(404).json({error:'调查提案不存在或无权限'});
  if(action==='dismiss'){
    const changed=await store.decide(ownerId,proposal.id,expectedVersion,'dismiss');
    if(!changed)return res.status(409).json({error:'提案已更新或不能撤销'});
    return res.json({proposal:changed,paidCalls:0});
  }
  // Quota-off means no paid investigation may be approved or enqueued.
  // The Worker independently enforces this limit atomically before provider IO.
  const {budgetLimit,dailyBudgetStatus}=require('../ai/growth/budget');
  if(budgetLimit()===0)return res.status(409).json({
    error:'异常调查付费额度未开启；须先设置 AI_GROWTH_PAID_CALLS_PER_DAY',
    reason:'growth-paid-budget-disabled'
  });
  const budget=await dailyBudgetStatus(ownerId);
  if(budget.remainingCalls<1)return res.status(409).json({
    error:'当日异常调查模型轮次配额已用完',reason:'growth-paid-budget-exhausted'
  });
  // Approval is an explicit authenticated human action; concurrent callers
  // share one deterministic request key and Bull job ID.
  if(proposal.status==='proposed'){
    const approved=await store.decide(ownerId,proposal.id,expectedVersion,'approve');
    if(!approved)return res.status(409).json({error:'提案已更新、告警已确认或不再符合调查条件'});
    proposal=await store.get(ownerId,proposal.id);
  }else if(proposal.status!=='approved'||proposal.version!==expectedVersion){
    return res.status(409).json({error:'提案已更新或已被撤销'});
  }
  const request=store.analysisRequest(proposal,ownerId);
  const record=await records.createAnalysisRecord(request);
  if(record.filter_conditions?.proposalId!==proposal.id)
    throw Object.assign(Error('幂等任务关联异常，拒绝派发'),{status:409});
  await store.attachAnalysis(ownerId,proposal.id,record.id);
  if(record.status==='completed')return res.json({analysisId:record.id,status:'completed'});
  if(record.status!=='pending')
    return res.status(202).json({analysisId:record.id,status:record.status,alreadyStarted:true});
  const job=await addAIAnalysisJob('business-analysis',{
    analysisId:record.id,ownerId,dateRangeStart:Number(record.date_range_start),
    dateRangeEnd:Number(record.date_range_end),businessScope:record.business_scope,
    userQuestion:record.user_question,focusGoal:record.filter_conditions.focusGoal,
    modelMode:'auto'
  },{jobId:record.id,attempts:1});
  res.status(202).json({analysisId:record.id,jobId:job.id,status:'queued',
    note:'人工已批准；模型调查可能产生费用，受任务及跨日调用配额约束'});
}));
router.get('/growth-notifications',handle(async(req,res)=>{
  const notifications=await require('../ai/growth/notificationStore')
    .createNotificationStore().list(req.user.user_id,{limit:100,unreadOnly:req.query.unread==='1'});
  res.json({notifications,externalDelivery:false});
}));
router.post('/growth-notifications/:id/read',handle(async(req,res)=>{
  const notice=await require('../ai/growth/notificationStore')
    .createNotificationStore().markRead(req.user.user_id,req.params.id);
  if(!notice)return res.status(404).json({error:'通知不存在或无权限'});
  res.json({notification:notice});
}));
router.get('/growth-alerts',handle(async(req,res)=>{
  const store=require('../ai/growth/alertStore').createAlertStore();
  const includeResolved=req.query.resolved==='1';
  const alerts=await store.list(req.user.user_id,{limit:100,includeResolved});
  res.json({version:'growth-alerts-v1',alerts,paidCalls:0,externalActions:0});
}));
router.post('/growth-alerts/scan',handle(async(req,res)=>{
  // Explicit no-LLM scan, restricted to the authenticated owner.
  const ownerId=req.user.user_id,goal=req.body?.goal||'activation',
    source=req.body?.source||'all';
  require('../ai/growth/daily').dailyRequest({ownerId,goal,source});
  const result=await require('../ai/growth/monitor').scanDailyAlerts({
    ownerId,goal,source,store:require('../ai/growth/alertStore').createAlertStore(),
    proposalStore:require('../ai/growth/investigationStore').createInvestigationStore()
  });
  res.json({...result,paidCalls:0,externalActions:0});
}));
router.get('/growth-alerts/:id/history',handle(async(req,res)=>{
  const store=require('../ai/growth/alertStore').createAlertStore();
  const record=await store.get(req.user.user_id,req.params.id);
  if(!record)return res.status(404).json({error:'告警不存在或无权限'});
  res.json({events:await store.history(req.user.user_id,req.params.id)});
}));
router.post('/growth-alerts/:id/action',handle(async(req,res)=>{
  const result=await require('../ai/growth/alertStore').createAlertStore().transition(
    req.user.user_id,req.params.id,{
      action:req.body?.action,expectedVersion:req.body?.expectedVersion,
      snoozeUntil:req.body?.snoozeUntil??null,note:req.body?.note??null
    });
  if(!result)return res.status(409).json({error:'告警状态已变化、无权限或操作不允许，请刷新后重试'});
  res.json({alert:result,externalActions:0,paidCalls:0});
}));
router.get('/growth-inbox',handle(async(req,res)=>{
  const ownerId=req.user.user_id;
  const [analyses,suggestions,reviewRows,alerts,proposals]=await Promise.all([
    records.listAnalysisRecords(ownerId,{limit:100,offset:0}),
    records.listSuggestions(ownerId,{limit:200,offset:0}),
    records.listPendingReviewSuggestions(ownerId,{limit:200}),
    require('../ai/growth/alertStore').createAlertStore().list(ownerId,{limit:100}),
    require('../ai/growth/investigationStore').createInvestigationStore().list(ownerId,{limit:100})
  ]);
  let reviewEntries=[],watermarkWarning=null;
  try{
    const remote=require('../data/hologres');
    const status=await remote.status();
    const asOf=Date.parse(status.as_of);
    if(!Number.isFinite(asOf))throw Error('invalid watermark');
    reviewEntries=require('../ai/growth/reviewQueue').buildReviewQueue(reviewRows,{
      now:Date.now(),watermark:asOf
    });
  }catch(error){
    // Inability to prove data maturity must suppress review-ready tasks.
    watermarkWarning='业务数据水位暂不可用，未显示复盘到期任务';
  }
  const inbox=require('../ai/growth/inbox').buildGrowthInbox({
    analyses,suggestions,reviewEntries,alerts,proposals,now:Date.now()
  });
  if(watermarkWarning)inbox.warnings.push(watermarkWarning);
  res.json(inbox);
}));
router.get('/growth-review-queue',handle(async(req,res)=>{
  const ownerId=req.user.user_id;
  const rows=await records.listPendingReviewSuggestions(ownerId,{limit:100});
  // Never report review readiness using future or stale event data.
  const watermark=await require('../data/hologres').status();
  const asOf=Date.parse(watermark.as_of);
  if(!Number.isFinite(asOf))return res.status(503).json({error:'业务数据水位未知，暂不判定复盘成熟'});
  const now=Date.now();
  const entries=require('../ai/growth/reviewQueue').buildReviewQueue(rows,{now,watermark:asOf});
  res.json({version:'growth-review-queue-v1',asOf:watermark.as_of,
    readyCount:entries.filter(e=>e.status==='ready').length,
    entries,automaticPaidReviews:false});
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
  // The decision is human initiated; compare-and-swap prevents stale tabs
  // from silently overwriting another operator's decision.
  const effective={...updates,actualAction:updates.actualAction||current.actual_action};
  const updated=await records.transitionSuggestionStatus(req.params.id,req.user.user_id,
    current.user_status,userStatus,effective);
  if(!updated)return res.status(409).json({error:'建议已被其他操作更新，请刷新后重试'});
  res.json(updated);
}));
router.post('/suggestions/:id/retrospective',handle(async(req,res)=>{
  const ownerId=req.user.user_id,s=await records.getSuggestion(req.params.id,ownerId);
  if(!s)return res.status(404).json({error:'建议不存在'});
  if(s.user_status!=='executed')return res.status(400).json({error:'只能复盘已执行的建议'});
  // Use the same maturity policy in the preview and execution endpoints.
  const watermark=await require('../data/hologres').status();
  const asOf=Date.parse(watermark.as_of);
  if(!Number.isFinite(asOf))return res.status(503).json({error:'数据水位不可用，禁止提前复盘'});
  const maturity=require('../ai/growth/reviewQueue').classifyReview(s,{now:Date.now(),watermark:asOf});
  if(maturity.status!=='ready')return res.status(409).json({error:'尚未达到三个完整业务日且数据水位确认的复盘条件',earliestReviewAt:maturity.earliestReviewAt});
  // Exactly one first review per executed suggestion. An arbitrary client
  // requestKey must never multiply paid jobs for the same action.
  const {createHash}=require('node:crypto');
  const retrospectiveId=createHash('sha256').update(JSON.stringify([ownerId,s.id,'initial-review-v1'])).digest('hex');
  const existing=await records.getRetrospective(retrospectiveId,ownerId);
  if(existing)return res.json({retrospectiveId,jobId:retrospectiveId,status:'completed',result:existing});
  const job=await addAIAnalysisJob('retrospective',{retrospectiveId,suggestionId:s.id,ownerId,triggeredBy:ownerId},{jobId:retrospectiveId,attempts:1});
  res.status(202).json({retrospectiveId,jobId:job.id,status:'pending'});
}));
router.get('/retrospectives/list',handle(async(req,res)=>res.json({retrospectives:await records.listRetrospectives(req.user.user_id,paging(req))})));
router.get('/retrospectives/:id',handle(async(req,res)=>{
  const record=await records.getRetrospective(req.params.id,req.user.user_id);
  if(!record)return res.status(404).json({error:'复盘不存在'});
  res.json(record);
}));
router.get('/jobs/:jobId/checkpoint',handle(async(req,res)=>{
  const record=await records.getAnalysisRecord(req.params.jobId,req.user.user_id);
  if(!record)return res.status(404).json({error:'分析不存在'});
  // Owner authorization precedes any journal lookup. Never expose raw prompts,
  // model responses or tool results on this diagnostics endpoint.
  const calls=require('../ai/business/trace').createTraceStore(require('../db/connection')).list(req.user.user_id,record.id);
  const summary=require('../ai/business/checkpointState').inspectCheckpoint(calls);
  const leaseExpired=record.status==='processing' && (!record.lease_expires_at || Number(record.lease_expires_at)<=Date.now());
  res.json({analysisId:record.id,recordStatus:record.status,
    leaseExpired,leaseExpiresAt:record.lease_expires_at||null,
    requiresHumanReview:leaseExpired||summary.state==='blocked'||summary.state==='partial-tools',
    ...summary});
}));
router.get('/jobs/:jobId/status',handle(async(req,res)=>{
  const status=await getJobStatus('aiAnalysis',req.params.jobId);
  if(!status.exists){
    // Once Bull prunes a job, use only the authenticated durable analysis record.
    // Retry jobs have a distinct jobId; their owner can still use GET /:id.
    const record=await records.getAnalysisRecord(req.params.jobId,req.user.user_id);
    const projected=require('../ai/business/jobStatus').statusFromRecord(record,req.params.jobId);
    if(!projected)return res.status(404).json({error:'任务不存在或已过期，请查阅持久化分析记录'});
    return res.json(projected);
  }
  if(status.data?.ownerId!==req.user.user_id)return res.status(403).json({error:'无权访问任务'});
  res.json({jobId:status.id,state:status.state,progress:status.progress,result:status.returnvalue,error:status.failedReason});
}));
router.get('/:id',handle(async(req,res)=>{
  const record=await records.getAnalysisRecord(req.params.id,req.user.user_id);
  if(!record)return res.status(404).json({error:'分析不存在'});
  res.json({...record,suggestions:await records.listSuggestionsByAnalysis(record.id,req.user.user_id)});
}));
module.exports=router;

const {runTask,validateAnalysis} = require('../../ai/business/runner');
const weeklyReport=require('../../ai/growth/weeklyReport');
const weeklyCoverage=require('../../ai/growth/weeklyCoverage');
const {definitions,rankEvidence,validateRange,validateScope} = require('../../ai/business/policy');
const {fetchNorthStar,fetchGrowthInsights,fetchWeeklyCore} = require('./dataFetcher');
const records = require('../../db/aiRecords');
const remote = require('../../data/hologres');
const reportsService = require('../../services/businessReport').createService({remote,evidence:{fetchNorthStar,fetchGrowthInsights,fetchWeeklyCore}});

const {analysisPrompt:prompt}=require('../../ai/business/analysisContract');
async function persistValidatedResult({job,analysisId,ownerId,token,compact,result}) {
  const source=compact.business.scope.source;
  const {analysis}=result;
    const {formatActionExecutionPlan}=require('../../ai/growth/actionWorkflow');
    await job.progress(85);
    const suggestions=analysis.suggestions.map(s=>({analysisId,ownerId,businessProblem:s.problem,dataEvidence:s.evidence,
      hypothesis:s.hypothesis,uncertainties:s.uncertainties,action:formatActionExecutionPlan(s.action,s.executionPlan),priority:s.priority,priorityReason:s.priorityReason,
      applicableScope:{...s.scope,source},expectedImpact:s.expectedImpact,impactBasis:s.impactBasis,validationMetrics:s.validationMetrics,reviewConditions:s.reviewConditions,forecast:s.forecast||null}));
    const saved={summary:analysis.summary,keyFindings:analysis.keyFindings,suggestionsCount:analysis.suggestions.length,
      claims:analysis.claims,
      growthSignals:compact.growthPlan?.triage?.signals||[],
      growthSkills:compact.growthPlan?.steps?.map(step=>({id:step.skillId,version:step.skillVersion}))||[],
      ...(compact.weeklySources?{weeklySources:compact.weeklySources}:{}),
      ...(compact.weeklyCoverage?{weeklyCoverage:weeklyCoverage.finalizeWeeklyCoverage(
       compact.weeklyCoverage,analysis,{additionalEvidence:result.evidence,
        requireStructuredClaims:compact.weeklyReportContractVersion==='weekly-report-v2'})}:{}),
      evidenceIds:compact.evidence.map(e=>e.id),goalVersion:compact.goal?.version||null,candidates:compact.candidates,routing:result.routing,calls:result.calls,additionalEvidence:result.evidence,cost:result.cost,analysisId,
      ...(compact.weeklyOperations&&analysis.weeklyReport?{weeklyReport:analysis.weeklyReport,weeklyOperations:compact.weeklyOperations,reportPeriod:compact.period}:{})};
    await records.assertAnalysisLease(analysisId,ownerId,token);
    await records.completeAnalysis(analysisId,ownerId,suggestions,saved,result,token);await job.progress(100);
    return saved;
}

async function businessAnalysis(job) {
  const {analysisId,ownerId,dateRangeStart:start,dateRangeEnd:end,userQuestion,focusGoal='activation',modelMode='auto'}=job.data;
  const scope=validateScope(job.data.businessScope);
  validateRange(start,end);
  // This gate is intentionally before report-building, tool execution and LLM calls.
  // A duplicate delivery must not mark the other Worker's analysis as failed.
  const traceStore=require('../../ai/business/trace').createTraceStore(require('../../db/connection'));
  const executionClaim=await require('../../ai/business/workerStart').claimSafeAnalysis({
    analysisId,ownerId,records,traceStore
  });
  if(executionClaim.action==='completed')return executionClaim.result;
  const token=executionClaim.token;
  const isWeeklyReport=executionClaim.record.filter_conditions?.weeklyReport==='v1';
  const isCustomReport=isWeeklyReport&&
    executionClaim.record.filter_conditions?.reportPeriod==='custom-v1';
  // Only NEW business analyses opt into v2. Archived checkpoints select their
  // version from the saved system prompt, so deployment cannot rewrite replay.
  // New tasks use v3 to reduce repeated tool plans/evidence. Either
  // rollout switch can turn it off without mutating archived v1/v2 jobs.
  const useContextV3=process.env.AI_MODEL_CONTEXT_V3_ENABLED!=='0'&&
    process.env.AI_MODEL_CONTEXT_V2_ENABLED!=='0';
  // v4 applies only to newly created weekly reports. Archived rounds are
  // pinned to their saved prompt/version and must never be silently rewritten.
  const useWeeklyV4=isWeeklyReport&&useContextV3&&
    process.env.AI_WEEKLY_CONTEXT_V4_ENABLED!=='0';
  // v5 is additive: archived v1-v4 prompts keep their exact transport.
  // Newly created analyses receive the versioned business knowledge layer.
  const useBusinessBrainV5=useContextV3&&
    process.env.AI_BUSINESS_BRAIN_V5_ENABLED!=='0';
  const useWeeklyV5=isWeeklyReport&&useBusinessBrainV5&&
    process.env.AI_WEEKLY_CONTEXT_V5_ENABLED!=='0';
  let leaseError=null,renewing=false;
  const heartbeat=setInterval(async()=>{
    if(renewing)return;
    renewing=true;
    try {
      const ok=await records.renewAnalysisLease(analysisId,ownerId,token);
      if(!ok)leaseError=Error('AI 执行租约已失效');
    }catch(error){leaseError=error;}
    finally{renewing=false;}
  },20000);
  heartbeat.unref?.();
  const beforeStep=async()=>{
    if(leaseError)throw leaseError;
    await records.assertAnalysisLease(analysisId,ownerId,token);
  };
  try {
    await beforeStep();
    await job.progress(10);
    const duration=end-start,source=scope.source;
    let compact;
    if(job.data.evidenceReportId){
      const store=require('../../db/businessReports').createStore(require('../../db/connection'));
      const report=store.get(job.data.evidenceReportId,ownerId);
      if(!report)throw Error('原始业务报告不存在或无权访问');
      if(report.period.start!==start||report.period.end!==end||report.business.scope.source!==source||report.focusGoal!==focusGoal)throw Error('AI分析范围与业务报告不一致');
      compact={...report,manualActions:store.actions(report.id,ownerId).map(({review,...action})=>({...action,review:review?{periods:review.periods,metricChanges:review.metricChanges,conclusion:review.conclusion,warnings:review.warnings}:null})),manualHistory:store.history(ownerId,source)};
    }else{
      const seeded=require('../../ai/growth/sharedDailyReport').fromClaimedRecord(
       executionClaim.record,{start,end,source,goal:focusGoal});
      compact=seeded||await reportsService.build({start,end,businessScope:scope,
       focusGoal,question:userQuestion});
    }
    if(isWeeklyReport&&compact?.period){
      compact.period={...compact.period,kind:isCustomReport?'custom':'weekly'};
    }
    // Ranked business candidates stay untouched; plan adds explainable
    // anomaly triage and permitted investigations for the existing runner.
    const memory=await records.getAnalysisMemory(ownerId,source);
    // Only opt-in daily autonomy reads previously reviewed strategy versions.
    // The exact selected policy is persisted within the analysis context for
    // deterministic replay; nothing mutates growth KPIs or source SQL.
    const learnedStrategy=process.env.AI_AUTONOMY_ENABLED==='1'&&
      executionClaim.record.filter_conditions?.dailySchedule==='v1'
      ?await require('../../ai/growth/agentStore').createAgentStore()
        .getStrategy(ownerId,focusGoal,source):null;
    const isDailyConversion=executionClaim.record.filter_conditions?.dailySchedule==='v1'&&
      focusGoal==='conversion'&&source==='all';
    const focusSkillId=executionClaim.record.filter_conditions?.skillId||null;
    const discovered=(isDailyConversion||isWeeklyReport)
      ?require('../../ai/growth/dailySpecialties').availableDailySpecialties(require('../../db/connection'),ownerId):[];
    // Explicit content investigations also preload the same owner-scoped tool.
    // No API fetch or paid call is triggered by this data read.
    const availableSpecialties=[...new Set([...discovered,
      ...(focusSkillId==='content-growth'||focusSkillId==='follower-quality'?[focusSkillId]:[])])];
    // Only a specialized SEO task needs external tool discovery. The provider
    // catalog evaluates the LIVE owner binding; nothing is sourced from model input.
    let availableCapabilityIds=null;
    if(focusSkillId==='seo-organic'){
      const toolRegistry=require('../../ai/business/tools/registry').defaultRegistry();
      availableCapabilityIds=toolRegistry.listCapabilities({
        ownerId,runId:analysisId,scope,period:compact.period
      }).map(item=>item.id);
    }
    // This reads already saved owner-scoped successful tool timings. It never
    // invokes a provider, paid probe or new business query; missing/old samples
    // must remain unknown and must not block normal report generation.
    const observedTimingRegistry={observedToolTimings:context=>{
      try{
       return require('../../ai/business/evidence').createEvidenceStore(
        require('../../db/connection')).recentToolTimings(context);
      }catch{return {}}
    }};
    const growthPlan=require('../../ai/growth/planner').planGrowthInvestigation({
      goal:focusGoal,report:compact,history:memory,focusSkillId,
      maxSkills:isWeeklyReport?12:Math.min(6,3+availableSpecialties.length),availableSpecialties,
      strategy:learnedStrategy,availableCapabilityIds,
      observedTimingRegistry,ownerId,
      // Weekly reports cover channels beyond the primary activation goal.
      includeWeeklySpecialties:isWeeklyReport
    });
    const memoryView=require('../../ai/business/contextBudget').compactMemory(memory);
    compact={...compact,business:{...compact.business,question:userQuestion||compact.business.question},
      memory:memoryView.items,memoryMeta:memoryView.meta,growthPlan,
      ...(!isWeeklyReport&&focusGoal==='activation'?{reviewLessonsVersion:2}:{}),
      ...(isWeeklyReport?{weeklyOperations:executionClaim.record.filter_conditions.weeklyOperations}:{}),
      };
    const session=require('../../ai/business/foundation').defaultFoundation().prepare(compact,{ownerId,runId:analysisId,goalRef:job.data.goalRef});
    compact=session.context;
    // Rank only against the final authorized capability list, not the wider
    // pre-session catalog. This cannot authorize an unapproved tool.
    const permittedIds=new Set((compact.capabilities||[]).map(cap=>cap.id));
    const storedTimings=observedTimingRegistry.observedToolTimings({ownerId,
     scope:compact.business?.scope||scope,period:compact.period});
    // Freeze a small, authorized-only timing snapshot with this analysis so a
    // resumed validation cannot silently use later or other-owner timings.
    compact.trustedToolTimings=Object.fromEntries(
     Object.entries(storedTimings).filter(([id])=>permittedIds.has(id)).slice(0,30));
    if(compact.growthPlan){
      compact.growthPlan.questionRanking=require('../../ai/growth/questionPriority')
       .rankBusinessQuestions({goal:focusGoal,candidates:compact.candidates||[],
        capabilityIds:[...permittedIds],observedTimings:compact.trustedToolTimings});
    }
    // Pin the strict output contract into the saved snapshot; archived contexts
    // without this marker retain their original validation behavior on recovery.
    compact.analysisContractVersion=require('../../ai/business/analysisContract').ANALYSIS_CONTRACT_VERSION;
    if(useWeeklyV5)compact.weeklyReportContractVersion='weekly-report-v2';
    // A single bounded, owner-scoped read-only manifest backs EVERY weekly
    // section. Only a subset is queried; all other modules remain explicitly
    // uninvestigated. This does not create model calls or loosen tool budgets.
    if(isWeeklyReport){
      const coverage=await weeklyCoverage.collectWeeklyCoverage({
       context:compact,investigate:session.investigate,
       allowedTools:compact.capabilities.map(x=>x.id),
       availableSpecialties,maxQueries:10,shouldContinue:beforeStep
      });
      compact.weeklyCoverage=coverage;
      const seo=coverage.modules.find(x=>x.id==='seo-organic');
      const seoEvidence=compact.evidence.find(e=>e.id===seo?.evidenceIds?.[0]);
      const v=seoEvidence?.value||{};
      const matched=seoEvidence?.coverage?.periodMatched===true;
      compact.weeklySources={seo:{
       status:seo?.status==='not-connected'?'unavailable':
        seo?.status==='collected'&&matched?'period-matched':
        seoEvidence?.value?.available===false?'not-synced':
        seoEvidence?'reference-only':'unavailable',
       periodMatched:matched,
       range:v.startDate&&v.endDate?{startDate:v.startDate,endDate:v.endDate}:null,
       evidenceIds:seo?.evidenceIds||[]
      },note:'GSC 日期按 PT，业务周按 Asia/Bangkok；不匹配时仅为参考趋势，不能计算业务周 SEO 环比或归因'};
    }else{
      // Keep existing optional prefetch behavior for non-weekly daily jobs.
      const permittedTools=new Set(compact.capabilities.map(cap=>cap.id));
      for(const skillId of availableSpecialties){
       const tool=skillId==='content-growth'?'get_content_growth':'get_follower_quality';
       if(!permittedTools.has(tool))continue;
       const observed=await session.investigate({tool,input:{start,end,scope:{source:'all'}}});
       if(observed.status==='ok'&&Array.isArray(observed.evidence))
        compact.evidence.unshift(...observed.evidence);
      }
    }
    const snapshot={snapshot_id:compact.snapshot.id,snapshot_cutoff:compact.snapshot.cutoff,as_of:compact.snapshot.asOf,
      history_complete:compact.snapshot.historyComplete,events_complete_through:compact.snapshot.eventsCompleteThrough};
    await records.updateAnalysisSnapshot(analysisId,compact,ownerId,token);await job.progress(40);
    const investigate=async query=>{
      if(query.tool)return session.investigate(query);
      const ids={north:['active_users','new_users','returning_users'],growth:['activation_rate','d7','registered_users','registration_activation_rate','registered_trade_conversion_rate'],weekly:['weekly_core']}[query.kind];
      if(!ids)throw Error('未实现该调查工具：'+query.kind);
      return session.investigate({tool:'query_metrics',input:{metrics:ids,scope:{source:query.source||source},start:query.start??start,end:query.end??end}});
    };
    const currentPrompt=require('../../ai/optimization/promptRegistry')
      .createPromptRegistry(require('../../db/connection'))
      .resolve(ownerId,'analysis',prompt,{runId:analysisId});
    const reportPrompt=isWeeklyReport?
      (isCustomReport?
       (useWeeklyV5?weeklyReport.customPeriodPromptV1:weeklyReport.customPeriodPromptV0):
       (useWeeklyV5?weeklyReport.weeklyPromptV3:useContextV3?weeklyReport.weeklyPromptV2:weeklyReport.weeklyPrompt)):
      currentPrompt;
    const result=await runTask({context:compact,prompt:isWeeklyReport?currentPrompt+'\n'+reportPrompt:currentPrompt,
      ownerId,operationId:analysisId,operationType:'analysis',mode:modelMode,investigate,traceStore:session.traceStore,beforeStep,
      contextVersion:useWeeklyV5?'v5':useWeeklyV4?'v4':useBusinessBrainV5?'v5':useContextV3?'v3':'v1',
      ...(isWeeklyReport?{modelTimeoutMs:weeklyReport.weeklyModelTimeoutMs()}:{}),
      paidCalls:{
        begin:round=>executionClaim.record.filter_conditions?.proposalId
          ?require('../../ai/growth/budget').beginBudgetedPaidCall({
             analysisId,ownerId,token,round
           })
          :executionClaim.record.filter_conditions?.dailySchedule==='v1'
            ?require('../../ai/growth/autonomyBudget').beginAutonomyPaidCall({analysisId,ownerId,token,round})
            :records.beginAnalysisPaidCall(analysisId,ownerId,token,round),
        finish:(round,status)=>records.finishAnalysisPaidCall(analysisId,ownerId,token,round,status)
      },
      validate:value=>{validateAnalysis(value,compact);session.validate(value);if(isWeeklyReport)weeklyReport.ensureWeeklyReport(value,{context:compact});}});
    await beforeStep();
    return await persistValidatedResult({job,analysisId,ownerId,token,compact,result});
  }catch(error){await records.failClaimedAnalysis(analysisId,ownerId,token,error.message);throw error;}
  finally{clearInterval(heartbeat);}
}
// Finalization-only recovery: zero model requests, zero tool calls.
// Unknown paid calls, partial investigations and mismatched original context
// always block. This cannot resume incomplete multi-step investigations.
async function recoverValidatedAnalysis(job) {
  const {analysisId,ownerId}=job.data;
  const record=await records.getAnalysisRecord(analysisId,ownerId);
  if(!record)throw Error('分析记录不存在或无权限');
  if(record.status==='completed')return record.result;
  if(record.status!=='processing'||!record.lease_expires_at||Number(record.lease_expires_at)>=Date.now())
    throw Error('分析仍在运行或不是可恢复的过期任务');
  // JSONB can reorder object keys; fingerprint against the exact model input.
  const compact=record.context_payload ? JSON.parse(record.context_payload) : record.data_snapshot;
  if(!compact?.business?.scope?.source||!Array.isArray(compact.evidence))
    throw Error('原始调查快照不完整，禁止恢复');
  const guards=await records.listAnalysisPaidCalls(analysisId,ownerId);
  if(!guards.length||guards.some(c=>c.status!=='received'))throw Error('付费调用状态未全部确认，禁止恢复');
  const journal=require('../../ai/business/trace').createTraceStore(require('../../db/connection'));
  const rows=journal.list(ownerId,analysisId);
  if(rows.length!==guards.length || guards.some((g,i)=>Number(g.round)!==rows[i].round||rows[i].status!=='received'))
    throw Error('共享付费日志与详细调查记录不一致，禁止恢复');
  const originalPrompt=journal.promptForRun(ownerId,analysisId,'analysis');
  if(!originalPrompt)throw Error('缺少本次执行归档的原始提示词，禁止改变提示词版本后重放');
  const rebuilt=require('../../ai/business/transcriptRecovery').reconstructTranscript({
    rows,systemPrompt:originalPrompt,context:compact,operationType:'analysis'
  });
  if(rebuilt.state!=='reconstructed')throw Error('调查上下文不能安全恢复：'+rebuilt.reason);
  const finalRow=rows.at(-1);
  const analysis=finalRow?.result?.validatedAnalysis;
  if(!analysis||finalRow.result.followup||finalRow.result.investigations?.length)
    throw Error('没有经过验证的最终输出，禁止重新调用模型');
  validateAnalysis(analysis,compact);
  const token=require('node:crypto').randomUUID();
  const claimed=await records.claimExpiredFinalization(analysisId,ownerId,token);
  if(!claimed)throw Error('恢复执行权已被其他 Worker 领取');
  const calls=rebuilt.calls;
  const result={analysis,calls,evidence:rebuilt.evidence,
    routing:require('../../ai/business/policy').routeTask(compact,record.filter_conditions?.modelMode||'auto'),
    cost:calls.reduce((n,c)=>n+(Number(c.cost)||0),0),
    model:finalRow.result.model,provider:finalRow.result.provider};
  try{
    return await persistValidatedResult({job,analysisId,ownerId,token,compact,result});
  }catch(error){
    await records.failClaimedAnalysis(analysisId,ownerId,token,error.message);
    throw error;
  }
}

// Resume only from matching, positively received paid-call and read-only tool
// checkpoints. A new model request occurs only for the next missing round.
// The shared Postgres fence and execution token still own all new requests.
async function resumeIncompleteAnalysis(job){
  const {analysisId,ownerId}=job.data;
  const record=await records.getAnalysisRecord(analysisId,ownerId);
  if(!record)throw Error('分析记录不存在或无权限');
  if(record.status==='completed')return record.result;
  const manualFailedWeekly=job.data.manualFailedWeekly===true;
  const failedForTokenBudget=record.error_message===
    'AI Token硬预算不足，未发起下一轮模型请求；已付费证据保留在断点';
  const matchingFailedWeekly=manualFailedWeekly&&record.status==='failed'&&
    !record.cancel_requested&&record.filter_conditions?.weeklyReport==='v1'&&
    (record.error_message==='补充查询过多，请缩小问题范围或提高调查能力'||
     failedForTokenBudget);
  if(!matchingFailedWeekly&&
    (manualFailedWeekly||record.status!=='processing'||record.cancel_requested||
     !record.lease_expires_at||Number(record.lease_expires_at)>=Date.now()))
    throw Error('只能恢复未取消且已过期的调查或人工确认的失败周报');
  // JSONB can reorder object keys; fingerprint against the exact model input.
  const compact=record.context_payload ? JSON.parse(record.context_payload) : record.data_snapshot;
  if(!compact?.business?.scope?.source||!Array.isArray(compact.evidence))throw Error('缺少固定的原始业务快照');
  const guards=await records.listAnalysisPaidCalls(analysisId,ownerId);
  const store=require('../../ai/business/trace').createTraceStore(require('../../db/connection'));
  const rows=store.list(ownerId,analysisId);
  if(rows.length!==guards.length)throw Error('无法安全恢复调查：journal-count-mismatch');
  const originalPrompt=store.promptForRun(ownerId,analysisId,'analysis');
  if(!originalPrompt)throw Error('缺少原始提示词，禁止在恢复时使用最新版本');
  const plan=require('../../ai/business/resumePlan').planInvestigationResume({
    rows,guards,context:compact,systemPrompt:originalPrompt
  });
  if(!plan.allowed)throw Error('无法安全恢复调查：'+plan.reason);
  const foundation=require('../../ai/business/foundation').defaultFoundation();
  const session=foundation.resume(compact,{ownerId,runId:analysisId});
  const token=require('node:crypto').randomUUID();
  const claimed=matchingFailedWeekly
    ?await records.claimFailedWeeklyOverflow(analysisId,ownerId,token)
    :await records.claimExpiredFinalization(analysisId,ownerId,token);
  if(!claimed)throw Error('调查恢复租约已被其他 Worker 领取，或付费状态不符合续跑要求');
  let leaseError=null,renewing=false;
  const heartbeat=setInterval(async()=>{
    if(renewing)return;renewing=true;
    try{if(!await records.renewAnalysisLease(analysisId,ownerId,token))leaseError=Error('恢复租约已经失效');}
    catch(e){leaseError=e}finally{renewing=false}
  },20000);
  heartbeat.unref?.();
  const beforeStep=async()=>{
    if(leaseError)throw leaseError;
    await records.assertAnalysisLease(analysisId,ownerId,token);
  };
  const source=compact.business.scope.source;
  const investigate=async query=>{
    if(query.tool)return session.investigate(query);
    const ids={north:['active_users','new_users','returning_users'],growth:['activation_rate','d7','registered_users'],weekly:['weekly_core']}[query.kind];
    if(!ids)throw Error('未知调查工具');
    return session.investigate({tool:'query_metrics',input:{metrics:ids,scope:{source:query.source||source},
      start:query.start??compact.period.start,end:query.end??compact.period.end}});
  };
  try{
    await beforeStep();
    const result=await runTask({context:compact,prompt,ownerId,operationId:analysisId,
      operationType:'analysis',mode:record.filter_conditions?.modelMode||'auto',
      resumeRows:rows,systemPromptOverride:originalPrompt,
      relaxV2BudgetOnManualResume:matchingFailedWeekly&&failedForTokenBudget,
      investigate,traceStore:session.traceStore,beforeStep,
      ...(record.filter_conditions?.weeklyReport==='v1'?{modelTimeoutMs:weeklyReport.weeklyModelTimeoutMs()}:{}),
      paidCalls:{
        begin:round=>record.filter_conditions?.proposalId
          ?require('../../ai/growth/budget').beginBudgetedPaidCall({
             analysisId,ownerId,token,round
           })
          :record.filter_conditions?.dailySchedule==='v1'
            ?require('../../ai/growth/autonomyBudget').beginAutonomyPaidCall({analysisId,ownerId,token,round})
            :records.beginAnalysisPaidCall(analysisId,ownerId,token,round),
        finish:(round,status)=>records.finishAnalysisPaidCall(analysisId,ownerId,token,round,status)
      },validate:value=>{
        validateAnalysis(value,compact);session.validate(value);
        if(record.filter_conditions?.weeklyReport==='v1')weeklyReport.ensureWeeklyReport(value,{context:compact});
      }});
    await beforeStep();
    return await persistValidatedResult({job,analysisId,ownerId,token,compact,result});
  }catch(error){
    await records.failClaimedAnalysis(analysisId,ownerId,token,error.message);
    throw error;
  }finally{clearInterval(heartbeat)}
}
module.exports={businessAnalysis,recoverValidatedAnalysis,resumeIncompleteAnalysis,analysisPrompt:prompt};

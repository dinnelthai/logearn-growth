const {runTask,validateAnalysis} = require('../../ai/business/runner');
const {definitions,rankEvidence,validateRange,validateScope} = require('../../ai/business/policy');
const {fetchNorthStar,fetchGrowthInsights,fetchWeeklyCore} = require('./dataFetcher');
const records = require('../../db/aiRecords');
const remote = require('../../data/hologres');
const reportsService = require('../../services/businessReport').createService({remote,evidence:{fetchNorthStar,fetchGrowthInsights,fetchWeeklyCore}});

const prompt=`你是LogEarn业务增长分析师。依据业务目标和真实观测证据排序任务，考虑目标差距、影响人数、证据强度、实施成本。
筹码查看/下钻是行为代理，不代表成功、理解或付费；未观测不等于流失。历史及采集覆盖未知时降低结论强度。
检查所有相关证据，必要时请求补查并由当前单模型深入调查；不能为节省费用省略必要任务。不得以相关性证明因果。
参考历史行动、拒绝原因和复盘；重复建议必须解释新证据。业务范围以请求为准。
最终输出必须包含claims数组，每项为{id,kind:"fact|hypothesis|recommendation",text,evidenceIds,values:[{evidenceId,value}],uncertainties}。事实和建议必须引用提供的证据ID；引用数值写在values中。建议evidence对象必须包含evidenceIds数组。补查可返回investigations:[{tool:"能力目录中的ID",input:{}}]。
输出JSON：{"summary":"摘要","keyFindings":["发现"],"suggestions":[{"problem":"问题","evidence":{"metrics":["可核对数值"],"dataPoints":["证据"]},"hypothesis":"假设","uncertainties":["未知"],"action":"具体行动","priority":"P0或P1或P2","priorityReason":"数据影响、实施成本及排序依据","scope":{"source":"请求来源"},"expectedImpact":"有依据的预期或未知","impactBasis":"依据","validationMetrics":{"primary":"active_users/new_users/returning_users 或明确业务指标ID","secondary":[]},"reviewConditions":["验证条件与观察期"]}]}。
每条建议可以增加可选 forecast 字段，包含 metric（必须等于 validationMetrics.primary）、direction（increase/decrease）、horizonDays（3–14整数）、minRelativeChangePct（0–100）、confidence（low/medium/high）以及 evidenceIds（已引用的证据ID）。预测不是必要字段；没有足够证据就不要提供数字预测，绝不宣称行动的因果收益。可不提出建议，但必须解释原因；指标不存在时不能自行造数。不得自行承诺收益。`;
async function persistValidatedResult({job,analysisId,ownerId,token,compact,result}) {
  const source=compact.business.scope.source;
  const {analysis}=result;
    await job.progress(85);
    const suggestions=analysis.suggestions.map(s=>({analysisId,ownerId,businessProblem:s.problem,dataEvidence:s.evidence,
      hypothesis:s.hypothesis,uncertainties:s.uncertainties,action:s.action,priority:s.priority,priorityReason:s.priorityReason,
      applicableScope:{...s.scope,source},expectedImpact:s.expectedImpact,impactBasis:s.impactBasis,validationMetrics:s.validationMetrics,reviewConditions:s.reviewConditions,forecast:s.forecast||null}));
    const saved={summary:analysis.summary,keyFindings:analysis.keyFindings,suggestionsCount:analysis.suggestions.length,
      claims:analysis.claims,
      growthSignals:compact.growthPlan?.triage?.signals||[],
      growthSkills:compact.growthPlan?.steps?.map(step=>({id:step.skillId,version:step.skillVersion}))||[],
      evidenceIds:compact.evidence.map(e=>e.id),goalVersion:compact.goal?.version||null,candidates:compact.candidates,routing:result.routing,calls:result.calls,additionalEvidence:result.evidence,cost:result.cost,analysisId};
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
      compact=await reportsService.build({start,end,businessScope:scope,focusGoal,question:userQuestion});
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
    const growthPlan=require('../../ai/growth/planner').planGrowthInvestigation({
      goal:focusGoal,report:compact,history:memory,
      focusSkillId:executionClaim.record.filter_conditions?.skillId||null,
      strategy:learnedStrategy
    });
    compact={...compact,business:{...compact.business,question:userQuestion||compact.business.question},
      memory,growthPlan};
    const session=require('../../ai/business/foundation').defaultFoundation().prepare(compact,{ownerId,runId:analysisId,goalRef:job.data.goalRef});
    compact=session.context;
    const snapshot={snapshot_id:compact.snapshot.id,snapshot_cutoff:compact.snapshot.cutoff,as_of:compact.snapshot.asOf,
      history_complete:compact.snapshot.historyComplete,events_complete_through:compact.snapshot.eventsCompleteThrough};
    await records.updateAnalysisSnapshot(analysisId,compact,ownerId,token);await job.progress(40);
    const investigate=async query=>{
      if(query.tool)return session.investigate(query);
      const ids={north:['active_users','new_users','returning_users'],growth:['activation_rate','d7','registered_users'],weekly:['weekly_core']}[query.kind];
      if(!ids)throw Error('未实现该调查工具：'+query.kind);
      return session.investigate({tool:'query_metrics',input:{metrics:ids,scope:{source:query.source||source},start:query.start??start,end:query.end??end}});
    };
    const result=await runTask({context:compact,prompt,ownerId,operationId:analysisId,operationType:'analysis',mode:modelMode,investigate,traceStore:session.traceStore,beforeStep,
      paidCalls:{
        begin:round=>executionClaim.record.filter_conditions?.proposalId
          ?require('../../ai/growth/budget').beginBudgetedPaidCall({
             analysisId,ownerId,token,round
           })
          :records.beginAnalysisPaidCall(analysisId,ownerId,token,round),
        finish:(round,status)=>records.finishAnalysisPaidCall(analysisId,ownerId,token,round,status)
      },
      validate:value=>{validateAnalysis(value);session.validate(value);}});
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
  const {buildSystemPrompt}=require('../../ai/business/runner');
  const rebuilt=require('../../ai/business/transcriptRecovery').reconstructTranscript({
    rows,systemPrompt:buildSystemPrompt(prompt),context:compact,operationType:'analysis'
  });
  if(rebuilt.state!=='reconstructed')throw Error('调查上下文不能安全恢复：'+rebuilt.reason);
  const finalRow=rows.at(-1);
  const analysis=finalRow?.result?.validatedAnalysis;
  if(!analysis||finalRow.result.followup||finalRow.result.investigations?.length)
    throw Error('没有经过验证的最终输出，禁止重新调用模型');
  validateAnalysis(analysis);
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
  if(record.status!=='processing'||record.cancel_requested||
     !record.lease_expires_at||Number(record.lease_expires_at)>=Date.now())
    throw Error('只能恢复未取消且已过期的调查');
  // JSONB can reorder object keys; fingerprint against the exact model input.
  const compact=record.context_payload ? JSON.parse(record.context_payload) : record.data_snapshot;
  if(!compact?.business?.scope?.source||!Array.isArray(compact.evidence))throw Error('缺少固定的原始业务快照');
  const guards=await records.listAnalysisPaidCalls(analysisId,ownerId);
  const store=require('../../ai/business/trace').createTraceStore(require('../../db/connection'));
  const rows=store.list(ownerId,analysisId);
  const {buildSystemPrompt}=require('../../ai/business/runner');
  const plan=require('../../ai/business/resumePlan').planInvestigationResume({
    rows,guards,context:compact,systemPrompt:buildSystemPrompt(prompt)
  });
  if(!plan.allowed)throw Error('无法安全恢复调查：'+plan.reason);
  const foundation=require('../../ai/business/foundation').defaultFoundation();
  const session=foundation.resume(compact,{ownerId,runId:analysisId});
  const token=require('node:crypto').randomUUID();
  const claimed=await records.claimExpiredFinalization(analysisId,ownerId,token);
  if(!claimed)throw Error('调查恢复租约已被其他 Worker 领取');
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
      resumeRows:rows,investigate,traceStore:session.traceStore,beforeStep,
      paidCalls:{
        begin:round=>record.filter_conditions?.proposalId
          ?require('../../ai/growth/budget').beginBudgetedPaidCall({
             analysisId,ownerId,token,round
           })
          :records.beginAnalysisPaidCall(analysisId,ownerId,token,round),
        finish:(round,status)=>records.finishAnalysisPaidCall(analysisId,ownerId,token,round,status)
      },validate:value=>{validateAnalysis(value);session.validate(value);}});
    await beforeStep();
    return await persistValidatedResult({job,analysisId,ownerId,token,compact,result});
  }catch(error){
    await records.failClaimedAnalysis(analysisId,ownerId,token,error.message);
    throw error;
  }finally{clearInterval(heartbeat)}
}
module.exports={businessAnalysis,recoverValidatedAnalysis,resumeIncompleteAnalysis,analysisPrompt:prompt};

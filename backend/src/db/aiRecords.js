/**
 * AI 分析记录数据访问层
 * 统一管理所有 AI 相关表的读写操作
 */

const aiPool = require('./aiPool');
const write = (sql, params) => aiPool.query(sql, params);
const read = write;
const { v4: uuidv4 } = require('uuid');

/**
 * ===================================================================
 * 分析记录 (ai_analysis_records)
 * ===================================================================
 */

/**
 * 创建分析记录
 */
async function createAnalysisRecord({
  ownerId,
  requestKey = uuidv4(),
  title,
  analysisType,
  dateRangeStart,
  dateRangeEnd,
  businessScope = {},
  userQuestion = null,
  dataSnapshot,
  filterConditions = {},
  comparisonPeriod = null
}) {
  const id = uuidv4();
  const now = Date.now();

  const result = await write(`
    INSERT INTO ai_analysis_records (
      id, owner_id, title, analysis_type,
      date_range_start, date_range_end, business_scope, user_question,
      data_snapshot, filter_conditions, comparison_period,
      status, created_at, request_key
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (owner_id, request_key) DO UPDATE SET request_key=EXCLUDED.request_key
    RETURNING *
  `, [
    id, ownerId, title, analysisType,
    dateRangeStart, dateRangeEnd, JSON.stringify(businessScope), userQuestion,
    JSON.stringify(dataSnapshot), JSON.stringify(filterConditions), comparisonPeriod ? JSON.stringify(comparisonPeriod) : null,
    'pending', now, requestKey
  ]);

  return result.rows[0];
}

/**
 * 更新分析状态
 */
async function updateAnalysisStatus(id, status, result = null, errorMessage = null) {
  const updates = ['status = $2'];
  const params = [id, status];
  let paramIndex = 3;

  if (status === 'processing' && !result) {
    updates.push(`started_at = $${paramIndex++}`);
    params.push(Date.now());
  }

  if (status === 'completed' || status === 'failed') {
    updates.push(`completed_at = $${paramIndex++}`);
    params.push(Date.now());
  }

  if (result) {
    updates.push(`result = $${paramIndex++}`);
    params.push(JSON.stringify(result));
  }

  if (errorMessage) {
    updates.push(`error_message = $${paramIndex++}`);
    params.push(errorMessage);
  }

  const updateResult = await write(`
    UPDATE ai_analysis_records
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
  `, params);

  return updateResult.rows[0];
}

/**
 * 记录模型使用信息
 */
async function updateAnalysisModel(id, modelProvider, modelName, promptVersion, costUsd) {
  const result = await write(`
    UPDATE ai_analysis_records
    SET model_provider = $2, model_name = $3, prompt_version = $4, cost_usd = $5
    WHERE id = $1
    RETURNING *
  `, [id, modelProvider, modelName, promptVersion, costUsd]);

  return result.rows[0];
}

/**
 * 获取用户的分析记录列表
 */
async function listAnalysisRecords(ownerId, { limit = 20, offset = 0, status = null } = {}) {
  let sql = `
    SELECT ai_analysis_summary.*,
      (SELECT COUNT(*) FROM ai_suggestions s
       WHERE s.analysis_id = ai_analysis_summary.id AND s.owner_id = $1
         AND s.user_status IN ('adopted','executing','executed')) AS accepted_count
    FROM ai_analysis_summary
    WHERE owner_id = $1
      AND NOT EXISTS (SELECT 1 FROM ai_analysis_records a WHERE a.id = ai_analysis_summary.id AND a.owner_id = $1 AND a.filter_conditions->>'hiddenFromHistory' = 'true')
  `;
  const params = [ownerId];
  let paramIndex = 2;

  if (status) {
    sql += ` AND status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const result = await read(sql, params);
  return result.rows;
}

// Remove a terminal analysis from the history list while preserving its audit trail.
async function hideAnalysisRecord(id, ownerId) {
  const result = await write(`UPDATE ai_analysis_records
    SET filter_conditions = COALESCE(filter_conditions, '{}'::jsonb) || '{"hiddenFromHistory":true}'::jsonb
    WHERE id=$1 AND owner_id=$2 AND status IN ('completed','failed','cancelled')
    RETURNING id`, [id, ownerId]);
  return result.rows[0] || null;
}

// Insert-only idempotency, so concurrent HTTP requests cannot both enqueue paid jobs.
// We never reset, retry, or replace a task with a known request key.
async function createWeeklyReportRecord({ownerId,requestKey,title,start,end,question,conditions}){
 const now=Date.now(),id=uuidv4();
 const inserted=await write(`INSERT INTO ai_analysis_records
  (id,owner_id,title,analysis_type,date_range_start,date_range_end,business_scope,
   user_question,data_snapshot,filter_conditions,status,created_at,request_key)
  VALUES ($1,$2,$3,'optimization',$4,$5,$6,$7,'{}'::jsonb,$8,'pending',$9,$10)
  ON CONFLICT (owner_id,request_key) DO NOTHING RETURNING *`,
  [id,ownerId,title,start,end,JSON.stringify({source:'all'}),question,JSON.stringify(conditions),now,requestKey]);
 if(inserted.rows.length)return {record:inserted.rows[0],created:true};
 const existing=await read(`SELECT * FROM ai_analysis_records
  WHERE owner_id=$1 AND request_key=$2`,[ownerId,requestKey]);
 if(!existing.rows.length)throw Error('并发周报请求仍在提交，请刷新任务状态');
 return {record:existing.rows[0],created:false};
}
// Owner-scoped completed-week reports live in the existing AI analysis records.
// Read the same shared PostgreSQL store as the Worker; no parallel report database.
async function listWeeklyReportRecords(ownerId,{limit=20}={}){
 const safeLimit=Number.isSafeInteger(limit)?Math.max(1,Math.min(50,limit)):20;
 const result=await read(`SELECT id,title,status,created_at,completed_at,error_message,
   date_range_start,date_range_end,cost_usd,model_name,
   filter_conditions->>'weeklyReissueOf' AS weekly_reissue_of,
   filter_conditions->>'reportPeriod' AS report_period
   FROM ai_analysis_records
   WHERE owner_id=$1 AND filter_conditions->>'weeklyReport'='v1'
     AND COALESCE(filter_conditions->>'hiddenFromHistory','false')<>'true'
   ORDER BY date_range_end DESC,created_at DESC LIMIT $2`,[ownerId,safeLimit]);
 return result.rows;
}
// Find the latest hidden FAILED weekly run. It remains fully intact for
// evidence and billing reconciliation; only the history view hides it.
async function getArchivedFailedWeeklyReport(ownerId,{start,end}){
 const result=await read(`SELECT id,request_key,created_at FROM ai_analysis_records
  WHERE owner_id=$1 AND date_range_start=$2 AND date_range_end=$3
    AND filter_conditions->>'weeklyReport'='v1'
    AND filter_conditions->>'hiddenFromHistory'='true'
    AND status='failed'
  ORDER BY created_at DESC LIMIT 1`,[ownerId,start,end]);
 return result.rows[0]||null;
}
// A hidden, owner-scoped weekly report must not reappear as a new task:
 // its original idempotency key and paid-call journal remain durable.
async function hasHiddenWeeklyReport(ownerId,{start,end}){
 const result=await read(`SELECT EXISTS(
  SELECT 1 FROM ai_analysis_records
  WHERE owner_id=$1 AND date_range_start=$2 AND date_range_end=$3
    AND filter_conditions->>'weeklyReport'='v1'
    AND filter_conditions->>'hiddenFromHistory'='true'
 ) AS has_hidden`,[ownerId,start,end]);
 return result.rows[0]?.has_hidden===true;
}
/**
 * 获取单个分析记录详情
 */
async function getAnalysisRecord(id, ownerId) {
  const result = await read(`
    SELECT * FROM ai_analysis_records
    WHERE id = $1 AND owner_id = $2
  `, [id, ownerId]);

  return result.rows[0] || null;
}

/**
 * ===================================================================
 * 建议 (ai_suggestions)
 * ===================================================================
 */

/**
 * 创建建议
 */
async function createSuggestion({
  analysisId,
  ownerId,
  businessProblem,
  dataEvidence,
  hypothesis,
  uncertainties = [],
  action,
  priority,
  priorityReason,
  applicableScope = {},
  expectedImpact = null,
  impactBasis = null,
  validationMetrics,
  reviewConditions = [],
  forecast = null
}, client = null) {
  const id = uuidv4();
  const now = Date.now();

  const result = await (client ? client.query.bind(client) : write)(`
    INSERT INTO ai_suggestions (
      id, analysis_id, owner_id,
      business_problem, data_evidence, hypothesis, uncertainties,
      action, priority, priority_reason, applicable_scope,
      expected_impact, impact_basis, validation_metrics, review_conditions, forecast,
      user_status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *
  `, [
    id, analysisId, ownerId,
    businessProblem, JSON.stringify(dataEvidence), hypothesis, uncertainties,
    action, priority, priorityReason, JSON.stringify(applicableScope),
    expectedImpact, impactBasis, JSON.stringify(validationMetrics), reviewConditions,
    forecast?JSON.stringify(forecast):null,
    'pending', now, now
  ]);

  return result.rows[0];
}

/**
 * 批量创建建议
 */
async function createSuggestionsBatch(suggestions) {
  if (suggestions.length === 0) return [];

  const pool = aiPool;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('SELECT id FROM ai_analysis_records WHERE id=$1 FOR UPDATE', [suggestions[0].analysisId]);
    const existing = await client.query('SELECT * FROM ai_suggestions WHERE analysis_id=$1', [suggestions[0].analysisId]);
    if (existing.rows.length) { await client.query('COMMIT'); return existing.rows; }
    const created = [];
    for (const suggestion of suggestions) {
      const result = await createSuggestion(suggestion, client);
      created.push(result);
    }

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 更新建议的用户状态
 */
// Compare-and-swap: two concurrent approvals cannot overwrite one another.
// Atomic, owner-scoped transition. Legacy writes must use the same policy.
async function transitionSuggestionStatus(id,ownerId,from,to,updates={}) {
  const {validateActionTransition}=require('../ai/growth/actionWorkflow');
  validateActionTransition(from,to,updates);
  const values=[id,ownerId,from,to,Date.now()];
  const sets=['user_status=$4','updated_at=$5'];
  if(to==='rejected'){
    values.push(updates.rejectionReason);sets.push('rejection_reason=$'+values.length);
  }
  if(to==='executed'){
    if(!Number.isSafeInteger(updates.executedAt)||updates.executedAt<0||updates.executedAt>Date.now())
      throw Object.assign(Error('执行时间无效'),{status:400});
    values.push(updates.actualAction);sets.push('actual_action=$'+values.length);
    values.push(updates.executedAt);sets.push('executed_at=$'+values.length);
    sets.push('executed_by=$2');
    if(updates.actionScope){
      values.push(JSON.stringify(updates.actionScope));sets.push('action_scope=$'+values.length);
    }
  }
  const sql='UPDATE ai_suggestions SET '+sets.join(', ')+
    ' WHERE id=$1 AND owner_id=$2 AND user_status=$3 RETURNING *';
  const result=await write(sql,values);
  return result.rows[0]||null;
}
async function updateSuggestionStatus(id,ownerId,userStatus,updates={}){
  const current=await getSuggestion(id,ownerId);
  if(!current)return null;
  return transitionSuggestionStatus(id,ownerId,current.user_status,userStatus,updates);
}
/**
 * 获取分析的所有建议
 */
// Efficient owner-scoped review queue; excludes suggestions with a completed
// retrospective. The scheduler still enforces business-day maturity.
async function listPendingReviewSuggestions(ownerId,{limit=100}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw Error('复盘查询数量无效');
  const result=await read(`SELECT s.id,s.analysis_id,s.owner_id,s.business_problem,s.priority,
      s.user_status,s.executed_at,s.action_scope,s.applicable_scope
    FROM ai_suggestions s
    WHERE s.owner_id=$1 AND s.user_status='executed' AND s.executed_at IS NOT NULL
      AND NOT EXISTS(
        SELECT 1 FROM ai_retrospectives r
        WHERE r.suggestion_id=s.id AND r.owner_id=$1
      )
    ORDER BY s.executed_at ASC LIMIT $2`,[ownerId,limit]);
  return result.rows;
}
async function listSuggestionsByAnalysis(analysisId, ownerId) {
  const result = await read(`
    SELECT * FROM ai_suggestions
    WHERE analysis_id = $1 AND owner_id = $2
    ORDER BY
      CASE priority
        WHEN 'P0' THEN 1
        WHEN 'P1' THEN 2
        WHEN 'P2' THEN 3
      END,
      created_at DESC
  `, [analysisId, ownerId]);

  return result.rows;
}

/**
 * 获取用户的建议列表（支持按状态过滤）
 */
async function listSuggestions(ownerId, { status = null, limit = 50, offset = 0 } = {}) {
  let sql = `
    SELECT s.*, r.title as analysis_title, r.date_range_start, r.date_range_end
    FROM ai_suggestions s
    JOIN ai_analysis_records r ON r.id = s.analysis_id
    WHERE s.owner_id = $1
  `;
  const params = [ownerId];
  let paramIndex = 2;

  if (status) {
    sql += ` AND s.user_status = $${paramIndex++}`;
    params.push(status);
  }

  sql += ` ORDER BY s.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
  params.push(limit, offset);

  const result = await read(sql, params);
  return result.rows;
}

/**
 * 获取单个建议详情
 */
async function getSuggestion(id, ownerId) {
  const result = await read(`
    SELECT s.*, r.title as analysis_title, r.date_range_start, r.date_range_end, r.data_snapshot
    FROM ai_suggestions s
    JOIN ai_analysis_records r ON r.id = s.analysis_id
    WHERE s.id = $1 AND s.owner_id = $2
  `, [id, ownerId]);

  return result.rows[0] || null;
}

/**
 * ===================================================================
 * 复盘记录 (ai_retrospectives)
 * ===================================================================
 */

/**
 * 创建复盘记录
 */
async function createRetrospective({
  id = uuidv4(),
  suggestionId,
  ownerId,
  baselinePeriod,
  effectPeriod,
  baselineData,
  effectData,
  metricChanges,
  hasImprovement,
  hasCausality,
  conclusion,
  confidence,
  confoundingFactors = [],
  lessonsLearned = null,
  modelProvider = null,
  modelName = null,
  costUsd = null,
  triggeredBy
}) {
  const now = Date.now();

  const result = await write(`
    INSERT INTO ai_retrospectives (
      id, suggestion_id, owner_id,
      baseline_period, effect_period, baseline_data, effect_data,
      metric_changes, has_improvement, has_causality,
      conclusion, confidence, confounding_factors, lessons_learned,
      model_provider, model_name, cost_usd,
      created_at, triggered_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id
    RETURNING *
  `, [
    id, suggestionId, ownerId,
    JSON.stringify(baselinePeriod), JSON.stringify(effectPeriod),
    JSON.stringify(baselineData), JSON.stringify(effectData),
    JSON.stringify(metricChanges), hasImprovement, hasCausality,
    conclusion, confidence, confoundingFactors, lessonsLearned,
    modelProvider, modelName, costUsd,
    now, triggeredBy
  ]);

  return result.rows[0];
}

/**
 * 获取建议的复盘记录列表
 */
// Read-only, owner-scoped bulk fetch prevents N+1 queries in a growth case.
async function listRetrospectivesByAnalysis(analysisId,ownerId){
  if(!analysisId||!ownerId)throw Error('复盘关联参数无效');
  const result=await read(`SELECT r.* FROM ai_retrospectives r
    JOIN ai_suggestions s ON s.id=r.suggestion_id AND s.owner_id=r.owner_id
    WHERE s.analysis_id=$1 AND s.owner_id=$2 AND r.owner_id=$2
    ORDER BY r.created_at DESC`,[analysisId,ownerId]);
  return result.rows;
}
async function listRetrospectivesBySuggestion(suggestionId, ownerId) {
  const result = await read(`
    SELECT * FROM ai_retrospectives
    WHERE suggestion_id = $1 AND owner_id = $2
    ORDER BY created_at DESC
  `, [suggestionId, ownerId]);

  return result.rows;
}

/**
 * 获取用户的所有复盘记录
 */
async function listRetrospectives(ownerId, { limit = 20, offset = 0 } = {}) {
  const result = await read(`
    SELECT r.*, s.business_problem, s.action, a.title as analysis_title
    FROM ai_retrospectives r
    JOIN ai_suggestions s ON s.id = r.suggestion_id
    JOIN ai_analysis_records a ON a.id = s.analysis_id
    WHERE r.owner_id = $1
    ORDER BY r.created_at DESC
    LIMIT $2 OFFSET $3
  `, [ownerId, limit, offset]);

  return result.rows;
}

/**
 * ===================================================================
 * 成本追踪 (ai_usage_logs)
 * ===================================================================
 */

/**
 * 记录 AI 使用日志
 */
async function logAIUsage({
  ownerId,
  operationType,
  operationId,
  modelProvider,
  modelName,
  inputTokens,
  outputTokens,
  totalTokens,
  costUsd,
  durationMs,
  fromCache = false
}) {
  const now = Date.now();

  await write(`
    INSERT INTO ai_usage_logs (
      owner_id, operation_type, operation_id,
      model_provider, model_name,
      input_tokens, output_tokens, total_tokens, cost_usd,
      duration_ms, from_cache, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, [
    ownerId, operationType, operationId,
    modelProvider, modelName,
    inputTokens, outputTokens, totalTokens, costUsd,
    durationMs, fromCache, now
  ]);
}

/**
 * 获取用户的成本统计
 */
async function getUserCostStats(ownerId, startTime = null, endTime = null) {
  let sql = `
    SELECT
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE NOT cost_known) AS unknown_cost_calls,
      SUM(cost_usd) as total_cost,
      SUM(total_tokens) as total_tokens,
      AVG(duration_ms) as avg_duration_ms,
      SUM(CASE WHEN from_cache THEN 1 ELSE 0 END) as cache_hits
    FROM ai_usage_logs
    WHERE owner_id = $1
  `;
  const params = [ownerId];
  let paramIndex = 2;

  if (startTime) {
    sql += ` AND created_at >= $${paramIndex++}`;
    params.push(startTime);
  }

  if (endTime) {
    sql += ` AND created_at <= $${paramIndex++}`;
    params.push(endTime);
  }

  const result = await read(sql, params);
  return result.rows[0];
}

/**
 * ===================================================================
 * 历史经验索引 (ai_experience_index)
 * ===================================================================
 */

/**
 * 创建或更新历史经验索引
 */
async function upsertExperienceIndex({
  suggestionId,
  ownerId,
  businessProblem,
  actionTaken = null,
  resultSummary,
  effectiveness,
  applicableScope = {},
  dateRange
}) {
  const id = uuidv4();
  const now = Date.now();

  const result = await write(`
    INSERT INTO ai_experience_index (
      id, owner_id, suggestion_id,
      business_problem, action_taken, result_summary, effectiveness,
      applicable_scope, date_range,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (suggestion_id)
    DO UPDATE SET
      action_taken = EXCLUDED.action_taken,
      applicable_scope = EXCLUDED.applicable_scope,
      date_range = EXCLUDED.date_range,
      result_summary = EXCLUDED.result_summary,
      effectiveness = EXCLUDED.effectiveness,
      updated_at = EXCLUDED.updated_at
    RETURNING *
  `, [
    id, ownerId, suggestionId,
    businessProblem, actionTaken, resultSummary, effectiveness,
    JSON.stringify(applicableScope), JSON.stringify(dateRange),
    now, now
  ]);

  return result.rows[0];
}

/**
 * 搜索相关历史经验（简单文本匹配，后续可接入向量检索）
 */
async function searchExperience(ownerId, query, limit = 10) {
  const result = await read(`
    SELECT * FROM ai_experience_index
    WHERE owner_id = $1
      AND (
        business_problem ILIKE $2
        OR action_taken ILIKE $2
        OR result_summary ILIKE $2
      )
    ORDER BY
      CASE effectiveness
        WHEN 'effective' THEN 1
        WHEN 'ineffective' THEN 2
        WHEN 'rejected' THEN 3
        WHEN 'unknown' THEN 4
      END,
      created_at DESC
    LIMIT $3
  `, [ownerId, `%${query}%`, limit]);

  return result.rows;
}

async function completeAnalysis(id, ownerId, suggestions, result, model, token) {
  const client=await aiPool.connect();
  try {
    await client.query('BEGIN');
    const locked=await client.query('SELECT status,result,execution_token,lease_expires_at,cancel_requested FROM ai_analysis_records WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,ownerId]);
    if(!locked.rows.length)throw Error('分析记录不存在或无权限');
    if(locked.rows[0].status==='completed'){await client.query('COMMIT');return locked.rows[0].result;}
    if(!token||locked.rows[0].status!=='processing'||locked.rows[0].execution_token!==token||locked.rows[0].cancel_requested||Number(locked.rows[0].lease_expires_at)<=Date.now())throw Error('执行租约失效，禁止写入分析结果');
    // This transaction owns all result writes; rollback leaves no partial suggestions.
    const existing=await client.query('SELECT id FROM ai_suggestions WHERE analysis_id=$1',[id]);
    if(existing.rows.length)throw Error('发现旧版本未完成的建议，请新建分析以保留原记录');
    for(const suggestion of suggestions)await createSuggestion(suggestion,client);
    await client.query(`UPDATE ai_analysis_records SET status='completed',result=$3,model_provider=$4,model_name=$5,
      prompt_version='business-v2',cost_usd=$6,completed_at=$7,error_message=NULL,execution_token=NULL,lease_expires_at=NULL WHERE id=$1 AND owner_id=$2`,
      [id,ownerId,JSON.stringify(result),model.provider,model.model,model.cost,Date.now()]);
    await client.query('COMMIT');return result;
  } catch(error) {await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
// Atomic pending -> processing claim. The returned row is the only authority
// for starting expensive business analysis; stale Bull jobs cannot bypass it.
async function claimAnalysisExecution(id, ownerId, token, leaseMs=120000) {
  if(typeof token!=='string'||!token||!Number.isSafeInteger(leaseMs)||leaseMs<30000)throw Error('执行租约参数无效');
  const now=Date.now();
  const result=await write(`UPDATE ai_analysis_records
    SET status='processing',started_at=$3,error_message=NULL,
        execution_token=$4,lease_expires_at=$5
    WHERE id=$1 AND owner_id=$2 AND status='pending' AND cancel_requested=false
    RETURNING *`,[id,ownerId,now,token,now+leaseMs]);
  return result.rows[0]||null;
}
async function renewAnalysisLease(id,ownerId,token,leaseMs=120000) {
  const now=Date.now();
  const result=await write(`UPDATE ai_analysis_records SET lease_expires_at=$4
    WHERE id=$1 AND owner_id=$2 AND execution_token=$3 AND status='processing' AND cancel_requested=false
      AND lease_expires_at>$5 RETURNING id`,[id,ownerId,token,now+leaseMs,now]);
  return !!result.rows.length;
}
async function assertAnalysisLease(id,ownerId,token) {
  const result=await read(`SELECT id FROM ai_analysis_records WHERE id=$1 AND owner_id=$2
    AND execution_token=$3 AND status='processing' AND cancel_requested=false AND lease_expires_at>$4`,
    [id,ownerId,token,Date.now()]);
  if(!result.rows.length)throw Object.assign(Error('AI 执行租约失效，停止执行'),{status:409});
}
async function failClaimedAnalysis(id,ownerId,token,errorMessage) {
  const result=await write(`UPDATE ai_analysis_records SET status='failed',
    error_message=$4,completed_at=$5,execution_token=NULL,lease_expires_at=NULL
    WHERE id=$1 AND owner_id=$2 AND execution_token=$3 AND status='processing'
      AND lease_expires_at>$6 RETURNING id`,
    [id,ownerId,token,String(errorMessage),Date.now(),Date.now()]);
  return !!result.rows.length;
}
// Shared fail-closed paid-call journal. The SQLite trace keeps detailed content;
// this PostgreSQL fence lets every Worker see whether a charge might have begun.
// Read-only crash detection. Do not change status or enqueue paid calls.
async function listAnalysisPaidCalls(id,ownerId) {
  const result=await read(`SELECT round,status FROM ai_analysis_call_guard
    WHERE analysis_id=$1 AND owner_id=$2 ORDER BY round ASC`,[id,ownerId]);
  return result.rows;
}
// Only claim an expired execution for finalizing an already-validated response.
// Never use this claim to issue further paid calls or unrecorded tools.
async function requestAnalysisCancellation(id,ownerId) {
  const now=Date.now();
  // Revocation is atomic with the request. An already-in-flight provider
  // request may still finish, but cannot commit a report or start another call.
  const result=await write(`UPDATE ai_analysis_records SET cancel_requested=true,
    status='failed',error_message='用户已取消任务',completed_at=$3,
    execution_token=NULL,lease_expires_at=NULL
    WHERE id=$1 AND owner_id=$2 AND status IN ('pending','processing')
    RETURNING id,status,cancel_requested`,[id,ownerId,now]);
  return result.rows[0]||null;
}
async function claimExpiredFinalization(id,ownerId,token,leaseMs=120000){
  const now=Date.now();
  const result=await write(`UPDATE ai_analysis_records SET execution_token=$3,
      lease_expires_at=$4 WHERE id=$1 AND owner_id=$2 AND status='processing' AND cancel_requested=false
      AND lease_expires_at<$5
      AND EXISTS(SELECT 1 FROM ai_analysis_call_guard WHERE analysis_id=$1 AND status='received')
      AND NOT EXISTS(SELECT 1 FROM ai_analysis_call_guard
        WHERE analysis_id=$1 AND status IN ('started','unknown'))
      RETURNING *`,[id,ownerId,token,now+leaseMs,now]);
  return result.rows[0]||null;
}
async function listExpiredAnalysisLeases(limit=100){
  if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('过期任务查询限制无效');
  const result=await read(`SELECT id,owner_id,lease_expires_at
    FROM ai_analysis_records WHERE status='processing' AND cancel_requested=false AND lease_expires_at<$1
    ORDER BY lease_expires_at ASC LIMIT $2`,[Date.now(),limit]);
  return result.rows;
}
async function hasAnalysisPaidCalls(id,ownerId){
  const result=await read('SELECT 1 FROM ai_analysis_call_guard WHERE analysis_id=$1 AND owner_id=$2 LIMIT 1',[id,ownerId]);
  return result.rows.length>0;
}
async function beginAnalysisPaidCall(id,ownerId,token,round){
  if(!Number.isSafeInteger(round)||round<0)throw Error('无效的模型调用序号');
  const now=Date.now();
  const result=await write(`INSERT INTO ai_analysis_call_guard
    (analysis_id,owner_id,round,execution_token,status,started_at)
    SELECT id,owner_id,$4,$3,'started',$5 FROM ai_analysis_records
    WHERE id=$1 AND owner_id=$2 AND execution_token=$3 AND status='processing'
      AND lease_expires_at>$5 AND cancel_requested=false
      AND NOT EXISTS (SELECT 1 FROM ai_analysis_call_guard
        WHERE analysis_id=$1 AND status IN ('started','unknown'))
    ON CONFLICT (analysis_id,round) DO NOTHING RETURNING analysis_id`,
    [id,ownerId,token,round,now]);
  if(!result.rows.length)throw Object.assign(Error('模型调用已开始或执行租约失效，禁止重复付费'),{status:409});
}
async function finishAnalysisPaidCall(id,ownerId,token,round,status){
  if(!['received','unknown'].includes(status))throw Error('无效的模型调用状态');
  const result=await write(`UPDATE ai_analysis_call_guard SET status=$5,finished_at=$6
    WHERE analysis_id=$1 AND owner_id=$2 AND execution_token=$3 AND round=$4
      AND status='started' RETURNING analysis_id`,
    [id,ownerId,token,round,status,Date.now()]);
  if(!result.rows.length)throw Error('模型调用状态未能确认，禁止继续执行');
}
// Only retry a failed daily task when absolutely no provider call has ever
// been reserved; update and check are one PostgreSQL atomic statement.
async function claimDailySafeRetry(id,ownerId){
 const result=await write(`UPDATE ai_analysis_records SET
   status='pending',error_message=NULL,started_at=NULL,completed_at=NULL,
   autonomy_safe_retries=autonomy_safe_retries+1
   WHERE id=$1 AND owner_id=$2 AND status='failed'
     AND cancel_requested=false AND autonomy_safe_retries<3
     AND filter_conditions->>'dailySchedule'='v1'
     AND NOT EXISTS(SELECT 1 FROM ai_analysis_call_guard
       WHERE analysis_id=$1 AND owner_id=$2)
   RETURNING *`,[id,ownerId]);
 return result.rows[0]||null;
}
// Manual continuation of a failed WEEKLY report whose first paid response was
// saved, but whose over-sized tool request was rejected before execution.
// An atomic lease prevents duplicate Workers from continuing the same task.
async function claimFailedWeeklyOverflow(id,ownerId,token,leaseMs=120000){
 const now=Date.now();
 if(typeof token!=='string'||!token||!Number.isSafeInteger(leaseMs)||leaseMs<10000)
  throw Error('周报断点租约参数无效');
 const result=await write(`UPDATE ai_analysis_records
 SET status='processing',execution_token=$3,lease_expires_at=$4,error_message=NULL,
   completed_at=NULL
 WHERE id=$1 AND owner_id=$2 AND status='failed' AND cancel_requested=false
   AND filter_conditions->>'weeklyReport'='v1'
   AND error_message IN ('补充查询过多，请缩小问题范围或提高调查能力',
     'AI Token硬预算不足，未发起下一轮模型请求；已付费证据保留在断点')
   AND EXISTS(SELECT 1 FROM ai_analysis_call_guard
     WHERE analysis_id=$1 AND owner_id=$2 AND status='received')
   AND NOT EXISTS(SELECT 1 FROM ai_analysis_call_guard
     WHERE analysis_id=$1 AND owner_id=$2 AND status<>'received')
 RETURNING *`,[id,ownerId,token,now+leaseMs]);
 return result.rows[0]||null;
}
async function claimAnalysisRetry(id, ownerId) {
  const result=await write(`UPDATE ai_analysis_records SET status='pending',error_message=NULL,started_at=NULL,completed_at=NULL
    WHERE id=$1 AND owner_id=$2 AND status='failed' AND cancel_requested=false RETURNING *`,[id,ownerId]);
  return result.rows[0]||null;
}
async function updateAnalysisSnapshot(id, snapshot, ownerId, token) {
  const result=await write(`UPDATE ai_analysis_records SET data_snapshot=$2,context_payload=$6 WHERE id=$1
    AND owner_id=$3 AND execution_token=$4 AND status='processing' AND cancel_requested=false AND lease_expires_at>$5 RETURNING id`,
    [id, JSON.stringify(snapshot), ownerId, token, Date.now(),JSON.stringify(snapshot)]);
  if(!result.rows.length)throw Error('执行租约失效，禁止更新快照');
}
async function getAnalysisMemory(ownerId, source = 'all') {
  const result = await read(`SELECT s.id, s.business_problem, s.action, s.user_status,
    s.actual_action, s.rejection_reason, s.updated_at,
    s.validation_metrics, s.applicable_scope, s.action_scope, s.executed_at, COALESCE(e.result_summary,ret.conclusion) AS result_summary, e.effectiveness, COALESCE(e.updated_at,ret.created_at) AS reviewed_at,
    ret.metric_changes,ret.confidence AS review_confidence,ret.has_improvement,ret.baseline_data->>'reviewContextVersion' AS review_context_version
    FROM ai_suggestions s LEFT JOIN ai_experience_index e ON e.suggestion_id=s.id
    JOIN ai_analysis_records a ON a.id=s.analysis_id
    LEFT JOIN LATERAL (SELECT conclusion,created_at,metric_changes,confidence,has_improvement,baseline_data FROM ai_retrospectives WHERE suggestion_id=s.id AND owner_id=$1 ORDER BY created_at DESC LIMIT 1) ret ON true
    WHERE s.owner_id=$1 AND COALESCE(s.action_scope->>'source',s.applicable_scope->>'source',a.business_scope->>'source','all')=$2
    ORDER BY GREATEST(s.updated_at,COALESCE(e.updated_at,0)) DESC LIMIT 30`, [ownerId, source]);
  return result.rows;
}
async function getRetrospective(id, ownerId) {
  const result = await read('SELECT * FROM ai_retrospectives WHERE id=$1 AND owner_id=$2',[id,ownerId]);
  return result.rows[0] || null;
}

module.exports = {
  completeAnalysis, claimAnalysisRetry, claimFailedWeeklyOverflow, claimDailySafeRetry, claimAnalysisExecution, renewAnalysisLease, assertAnalysisLease, failClaimedAnalysis, hasAnalysisPaidCalls, beginAnalysisPaidCall, finishAnalysisPaidCall, listAnalysisPaidCalls, claimExpiredFinalization, requestAnalysisCancellation, listExpiredAnalysisLeases, updateAnalysisSnapshot, getAnalysisMemory, getRetrospective,
  // 分析记录
  createAnalysisRecord,
  updateAnalysisStatus,
  updateAnalysisModel,
  listAnalysisRecords,
  listWeeklyReportRecords,
  getArchivedFailedWeeklyReport,
  hasHiddenWeeklyReport,
  createWeeklyReportRecord,
  hideAnalysisRecord,
  getAnalysisRecord,

  // 建议
  createSuggestion,
  createSuggestionsBatch,
  updateSuggestionStatus,
  transitionSuggestionStatus,
  listSuggestionsByAnalysis,
  listPendingReviewSuggestions,
  listSuggestions,
  getSuggestion,

  // 复盘
  createRetrospective,
  listRetrospectivesBySuggestion,
  listRetrospectivesByAnalysis,
  listRetrospectives,

  // 成本追踪
  logAIUsage,
  getUserCostStats,

  // 历史经验
  upsertExperienceIndex,
  searchExperience
};

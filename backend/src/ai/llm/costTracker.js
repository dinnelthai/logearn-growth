/**
 * 成本追踪器
 * 记录每次 LLM 调用的成本，提供统计和预警
 *
 * 统一由模型客户端按实际调用写入；任务层不重复记账。
 */

const pool = require('../../db/pool');
const logger = require('../../utils/logger');

class CostTracker {
  constructor({schemaReady=()=>require('../business/health').aiSchemaReady()}={}){
    this.schemaReady=schemaReady;
  }

  /**
   * 记录一次实际模型调用
   */
  async track(usage) {
    try {
      // 兼容旧格式，转换到新表结构
      await pool.query(
        `INSERT INTO ai_usage_logs (
          owner_id, operation_type, operation_id,
          model_provider, model_name,
          input_tokens, output_tokens, total_tokens, cost_usd,
          duration_ms, from_cache, created_at, cost_known, trace_id, round
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (owner_id, trace_id) WHERE trace_id IS NOT NULL DO NOTHING`,
        [
          usage.ownerId || 'system',
          usage.operationType || 'analysis',
          usage.operationId || 'legacy',
          usage.provider,
          usage.model,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalTokens,
          usage.cost,
          usage.duration,
          false,
          Date.now(),
          usage.costKnown !== false,
          usage.traceId || null,
          Number.isSafeInteger(usage.round) && usage.round >= 0 ? usage.round : null
        ]
      );
    } catch (error) {
      logger.error('Failed to track AI usage:', error);
      throw error;
    }
  }

  /**
   * 获取今日统计 - 更新以适配新表结构
   */
  async getTodayStats(ownerId = null) {
    const offset=7*3600000,day=86400000;
    const todayMs=Math.floor((Date.now()+offset)/day)*day-offset;

    const result = await pool.query(
      `SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE cost_known = false) as unknown_cost_calls,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost,
        AVG(duration_ms) as avg_duration,
        model_name as model,
        model_provider as provider
      FROM ai_usage_logs
      WHERE created_at >= $1 AND ($2::text IS NULL OR owner_id=$2)
      GROUP BY model_name, model_provider`,
      [todayMs, ownerId]
    );

    return result.rows;
  }

  /**
   * 获取指定日期范围的统计
   */
  async getStats(startDate, endDate, ownerId = null) {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    const result = await pool.query(
      `SELECT
        to_timestamp(created_at / 1000)::date as date,
        COUNT(*) as total_calls,
        SUM(cost_usd) as total_cost,
        model_name as model,
        model_provider as provider
      FROM ai_usage_logs
      WHERE created_at >= $1 AND created_at < $2 AND ($3::text IS NULL OR owner_id=$3)
      GROUP BY to_timestamp(created_at / 1000)::date, model_name, model_provider
      ORDER BY date DESC`,
      [startMs, endMs, ownerId]
    );

    return result.rows;
  }

  /**
   * 检查今日成本是否超限
   */
  async checkDailyLimit(maxDailyCost, ownerId = null, maxDailyTokens = 100000) {
    // This check happens BEFORE the provider request. A stale usage table
    // could otherwise accept paid inference then fail to journal its cost.
    if(!await this.schemaReady()){
      throw Error('AI 计费表版本过旧，已阻止付费调用；需在正确的独立 AI 数据库执行已授权迁移');
    }
    const stats = await this.getTodayStats(ownerId);
    const totalCost = stats.reduce((sum, stat) => sum + parseFloat(stat.total_cost || 0), 0);
    // A zero-dollar estimate is not proof of free usage. Once an unknown-priced
    // call has been recorded, dollar-based limits cannot certify remaining funds.
    const unknown = stats.reduce((sum, stat) => sum + Number(stat.unknown_cost_calls || 0), 0);
    if (unknown > 0) {
      throw new Error('模型实际价格未知，美元预算无法核实；请配置中转站输入及输出单价后再付费调用');
    }
    if (totalCost >= maxDailyCost) {
      throw new Error(
        `Daily cost limit exceeded: $${totalCost.toFixed(4)} / $${maxDailyCost}`
      );
    }

    if(!Number.isSafeInteger(maxDailyTokens)||maxDailyTokens<1)
      throw Error('每日 Token 配额必须为正整数');
    const usedTokens=stats.reduce((sum,stat)=>sum+Number(stat.total_tokens||0),0);
    if(usedTokens>=maxDailyTokens)
      throw Error('每日 Token 配额已耗尽：'+usedTokens+' / '+maxDailyTokens);
    return totalCost;
  }

  /**
   * 对比不同模型的成本和性能
   */
  async compareModels(startDate, endDate, ownerId = null) {
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    const result = await pool.query(
      `SELECT
        model_name as model,
        model_provider as provider,
        COUNT(*) as calls,
        AVG(input_tokens) as avg_input_tokens,
        AVG(output_tokens) as avg_output_tokens,
        AVG(cost_usd) as avg_cost,
        SUM(cost_usd) as total_cost,
        AVG(duration_ms) as avg_duration
      FROM ai_usage_logs
      WHERE created_at >= $1 AND created_at < $2 AND ($3::text IS NULL OR owner_id=$3)
      GROUP BY model_name, model_provider
      ORDER BY total_cost DESC`,
      [startMs, endMs, ownerId]
    );

    return result.rows;
  }
}

module.exports = CostTracker;

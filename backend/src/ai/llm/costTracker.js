/**
 * 成本追踪器
 * 记录每次 LLM 调用的成本，提供统计和预警
 */

const pool = require('../../db/pool');
const logger = require('../../utils/logger');

class CostTracker {
  /**
   * 记录使用情况
   */
  async track(usage) {
    try {
      await pool.query(
        `INSERT INTO ai_usage_logs (
          model, provider, input_tokens, output_tokens,
          total_tokens, cost, duration, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          usage.model,
          usage.provider,
          usage.inputTokens,
          usage.outputTokens,
          usage.totalTokens,
          usage.cost,
          usage.duration,
          usage.timestamp
        ]
      );
    } catch (error) {
      logger.error('Failed to track AI usage:', error);
    }
  }

  /**
   * 获取今日统计
   */
  async getTodayStats() {
    const result = await pool.query(
      `SELECT
        COUNT(*) as total_calls,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(cost) as total_cost,
        AVG(duration) as avg_duration,
        model,
        provider
      FROM ai_usage_logs
      WHERE created_at >= CURRENT_DATE
      GROUP BY model, provider`
    );

    return result.rows;
  }

  /**
   * 获取指定日期范围的统计
   */
  async getStats(startDate, endDate) {
    const result = await pool.query(
      `SELECT
        DATE(created_at) as date,
        COUNT(*) as total_calls,
        SUM(cost) as total_cost,
        model,
        provider
      FROM ai_usage_logs
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY DATE(created_at), model, provider
      ORDER BY date DESC`,
      [startDate, endDate]
    );

    return result.rows;
  }

  /**
   * 检查今日成本是否超限
   */
  async checkDailyLimit(maxDailyCost) {
    const stats = await this.getTodayStats();
    const totalCost = stats.reduce((sum, stat) => sum + parseFloat(stat.total_cost), 0);

    if (totalCost >= maxDailyCost) {
      throw new Error(
        `Daily cost limit exceeded: $${totalCost.toFixed(4)} / $${maxDailyCost}`
      );
    }

    return totalCost;
  }

  /**
   * 对比不同模型的成本和性能
   */
  async compareModels(startDate, endDate) {
    const result = await pool.query(
      `SELECT
        model,
        provider,
        COUNT(*) as calls,
        AVG(input_tokens) as avg_input_tokens,
        AVG(output_tokens) as avg_output_tokens,
        AVG(cost) as avg_cost,
        SUM(cost) as total_cost,
        AVG(duration) as avg_duration
      FROM ai_usage_logs
      WHERE created_at >= $1 AND created_at < $2
      GROUP BY model, provider
      ORDER BY total_cost DESC`,
      [startDate, endDate]
    );

    return result.rows;
  }
}

module.exports = CostTracker;

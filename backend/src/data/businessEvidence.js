/**
 * 数据获取封装 - 为 AI 分析任务提供真实业务数据
 *
 * 职责：
 * 1. 封装对 growth analytics API 的调用
 * 2. 处理异步任务的等待和结果获取
 * 3. 提供统一的错误处理
 */

const remote = require('./hologres');
const analysisJobs = require('../services/analysisJobs');
const logger = require('../utils/logger');

/**
 * 等待分析任务完成
 * @param {string} jobId - 任务 ID
 * @param {string} owner - 任务所有者
 * @param {number} maxWaitMs - 最长等待时间（毫秒）
 * @param {number} pollIntervalMs - 轮询间隔（毫秒）
 * @returns {Promise<Object>} 任务结果
 */
async function waitForJob(jobId, owner, maxWaitMs = 30000, pollIntervalMs = 500) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const job = analysisJobs.get(jobId, owner);
    if (job.state === 'complete') return analysisJobs.result(jobId, owner).value;
    if (job.state === 'failed') throw new Error(job.error || 'Analysis job failed');
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Analysis job timeout after ${maxWaitMs}ms`);
}

/**
 * 获取北极星指标数据
 * @param {number} start - 开始时间戳（毫秒）
 * @param {number} end - 结束时间戳（毫秒）
 * @param {string} source - 来源筛选（'all' 或具体来源）
 * @returns {Promise<Object>} 北极星指标数据
 */
async function fetchNorthStar(start, end, source = 'all', snapshot = null) {
  const s = snapshot || await remote.status();
  const cacheKey = JSON.stringify(['business-north-v3', s.snapshot_id, start, end, source === 'all' ? null : source]);

  const result = await remote.cached(cacheKey, async () => {
    const cte = remote.eventsCte();
    const ANALYSIS_SQL = require('./analysisUsers').ANALYSIS_SQL;
    const D7_SQL = require('./analysisUsers').D7_SQL;

    const params = [s.snapshot_cutoff, start, end, source === 'all' ? null : source];

    const [days, summary] = await Promise.all([
      remote.query(`${cte} SELECT e.date,
        COUNT(DISTINCT e.user_key) FILTER (WHERE event_name IN (${ANALYSIS_SQL})) AS active_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE event_name IN (${ANALYSIS_SQL}) AND
          TO_CHAR(TO_TIMESTAMP(f.first_chip/1000.0) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') = e.date) AS new_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE event_name IN (${ANALYSIS_SQL}) AND
          TO_CHAR(TO_TIMESTAMP(f.first_chip/1000.0) AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') < e.date) AS returning_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE event_name IN (${ANALYSIS_SQL}) AND ${D7_SQL}) AS d7_users,
        COUNT(DISTINCT e.user_id) FILTER (WHERE NULLIF(BTRIM(e.user_id),'') IS NOT NULL) AS login_users,
        COUNT(*) FILTER (WHERE event_name IN (${ANALYSIS_SQL})) AS chip_events
        FROM e JOIN facts f ON f.user_key=e.user_key WHERE client_ts >= $2 AND client_ts < $3
          AND ($4::text IS NULL OR f.source=$4) GROUP BY e.date ORDER BY e.date`, params),
      remote.query(`${cte} SELECT COUNT(DISTINCT e.user_key) AS active_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE f.first_chip >= $2) AS new_users,
        COUNT(DISTINCT e.user_key) FILTER (WHERE f.first_chip < $2) AS returning_users
        FROM e JOIN facts f ON f.user_key=e.user_key
        WHERE event_name IN (${ANALYSIS_SQL}) AND client_ts >= $2 AND client_ts < $3
          AND ($4::text IS NULL OR f.source=$4)`, params)
    ]);

    const totals = Object.fromEntries(Object.entries(summary[0]).map(([k, v]) => [k, Number(v)]));

    return {
      days: days.map(d => ({
        date: d.date,
        active_users: Number(d.active_users || 0),
        new_users: Number(d.new_users || 0),
        returning_users: Number(d.returning_users || 0),
        login_users: Number(d.login_users || 0),
        chip_events: Number(d.chip_events || 0),
        d7_users: Number(d.d7_users || 0)
      })),
      totals,
      meta: {
        snapshot_id: s.snapshot_id,
        as_of: s.as_of,
        start,
        end,
        source
      }
    };
  });

  return result;
}

/**
 * 获取增长洞察数据
 * @param {Object} params - 查询参数
 * @param {number} params.start - 开始时间戳
 * @param {number} params.end - 结束时间戳
 * @param {string} params.source - 来源筛选
 * @returns {Promise<Object>} 增长洞察数据
 */
async function fetchGrowthInsights(params) {
  const { start, end, source = 'all', snapshot } = params;
  const s = snapshot || await remote.status();

  // 使用 analysisJobs 启动远程分析任务
  const job = analysisJobs.start('growth-insights', { start, end, source }, s, null, 'business-report');

  logger.info(`Started growth-insights job: ${job.id}`, { start, end, source });

  // 等待任务完成
  const result = await waitForJob(job.id, 'business-report', 30000);

  return result.payload;
}

/**
 * 获取周核心指标
 * @param {Object} params - 查询参数
 * @param {number} params.end - 结束时间戳
 * @param {string} params.source - 来源筛选
 * @returns {Promise<Object>} 周核心指标数据
 */
async function fetchWeeklyCore(params = {}) {
  const { end, source = 'all', snapshot } = params;
  const s = snapshot || await remote.status();

  const weeklyCore = require('./weeklyCore');
  return weeklyCore.weeklyCorePayload(s,{end,source});
}

/**
 * 计算指标变化百分比
 * @param {number} current - 当前值
 * @param {number} previous - 之前的值
 * @returns {number} 变化百分比
 */
function calculateChange(current, previous) {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
}

/**
 * 检测指标异常
 * @param {Object} currentData - 当前数据
 * @param {Object} previousData - 历史数据
 * @param {Array<string>} metrics - 要检测的指标列表
 * @param {number} threshold - 异常阈值（百分比）
 * @returns {Array<Object>} 检测到的异常列表
 */
function detectAnomalies(currentData, previousData, metrics, threshold = 15) {
  const anomalies = [];

  for (const metric of metrics) {
    const current = currentData.totals[metric];
    const previous = previousData.totals[metric];

    if (current == null || previous == null) {
      continue;
    }

    const change = calculateChange(current, previous);

    // 如果变化超过阈值，认为是异常
    if (Math.abs(change) >= threshold) {
      anomalies.push({
        metric,
        current,
        previous,
        change: parseFloat(change.toFixed(2)),
        severity: Math.abs(change) >= 30 ? 'critical' : Math.abs(change) >= 20 ? 'high' : 'medium',
        trend: change > 0 ? 'up' : 'down'
      });
    }
  }

  return anomalies;
}

/**
 * 格式化日期为 YYYY-MM-DD
 * @param {number} timestamp - 时间戳（毫秒）
 * @returns {string} 格式化的日期
 */
function formatDate(timestamp) {
  return new Date(timestamp + 7 * 3600000).toISOString().slice(0, 10);
}

module.exports = {
  waitForJob,
  fetchNorthStar,
  fetchGrowthInsights,
  fetchWeeklyCore,
  calculateChange,
  detectAnomalies,
  formatDate
};


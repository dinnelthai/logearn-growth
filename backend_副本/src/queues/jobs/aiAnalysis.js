/**
 * AI 分析任务类型定义 - 对接真实业务数据
 */

const { createClient } = require('../../ai/llm');
const {
  fetchNorthStar,
  fetchGrowthInsights,
  fetchWeeklyCore,
  detectAnomalies,
  formatDate
} = require('./dataFetcher');
const logger = require('../../utils/logger');

// WebSocket handlers for real-time updates
let jobProgress;
try {
  const websocket = require('../../websocket');
  jobProgress = websocket.jobProgress;
} catch (error) {
  // Fallback for when WebSocket is not available
  jobProgress = {
    emitProgress: () => {}
  };
}

/**
 * Helper: Update both Bull job progress and WebSocket
 */
async function updateProgress(job, progress, step) {
  await job.progress(progress);
  jobProgress.emitProgress(job.id, progress, { step });
}

/**
 * 异常检测任务 - 使用真实业务数据
 */
async function anomalyDetection(job) {
  const {
    date,
    metrics = ['active_users', 'new_users', 'returning_users'],
    threshold = 15,
    source = 'all'
  } = job.data;

  // 将日期字符串转换为时间戳
  const dateTs = typeof date === 'string' ? Date.parse(date) : date;
  const dayMs = 86400000;

  logger.info(`Starting anomaly detection for ${formatDate(dateTs)}`, { metrics, threshold });

  await updateProgress(job, 10, 'Fetching current day data');

  try {
    // 1. 获取当天数据
    const currentData = await fetchNorthStar(dateTs, dateTs + dayMs, source);

    await updateProgress(job, 30, 'Fetching comparison data');

    // 2. 获取前一天数据作为对比
    const previousData = await fetchNorthStar(dateTs - dayMs, dateTs, source);

    await updateProgress(job, 50, 'Detecting anomalies');

    // 3. 检测异常
    const anomalies = detectAnomalies(currentData, previousData, metrics, threshold);

    logger.info(`Detected ${anomalies.length} anomalies`, {
      date: formatDate(dateTs),
      anomalies: anomalies.map(a => ({ metric: a.metric, change: a.change }))
    });

    // 如果没有异常，直接返回
    if (anomalies.length === 0) {
      await updateProgress(job, 100, 'No anomalies detected');

      return {
        date: formatDate(dateTs),
        anomalyCount: 0,
        message: 'No significant anomalies detected',
        dataSnapshot: {
          current: currentData.totals,
          previous: previousData.totals,
          threshold
        }
      };
    }

    await updateProgress(job, 60, `Analyzing ${anomalies.length} anomalies with AI`);

    // 4. 获取增长维度数据辅助 AI 分析
    let growthContext = null;
    try {
      growthContext = await fetchGrowthInsights({
        start: dateTs - 7 * dayMs,
        end: dateTs + dayMs,
        source
      });
    } catch (error) {
      logger.warn('Failed to fetch growth context for AI analysis', error);
      // 继续进行，但没有维度数据
    }

    // 5. AI 分析每个异常
    const client = createClient();

    for (let i = 0; i < anomalies.length; i++) {
      const anomaly = anomalies[i];

      await updateProgress(
        job,
        60 + (i / anomalies.length) * 35,
        `AI analyzing ${anomaly.metric}`
      );

      // 构建分析上下文
      let contextInfo = `
指标异常详情：
- 指标名称：${anomaly.metric}
- 日期：${formatDate(dateTs)}
- 当前值：${anomaly.current}
- 前一天：${anomaly.previous}
- 变化：${anomaly.change}% (${anomaly.trend === 'up' ? '上升' : '下降'})
- 严重程度：${anomaly.severity}
`;

      // 添加增长维度信息（如果有）
      if (growthContext && growthContext.dimensions) {
        contextInfo += `
\n增长维度拆解：`;

        if (growthContext.dimensions.source) {
          const topSources = growthContext.dimensions.source.slice(0, 3);
          contextInfo += `\n按来源：${topSources.map(s =>
            `${s.value}(当前${s.current}, 前期${s.previous}, 变化${s.delta > 0 ? '+' : ''}${s.delta})`
          ).join(', ')}`;
        }

        if (growthContext.dimensions.device) {
          contextInfo += `\n按设备：${growthContext.dimensions.device.slice(0, 3).map(d =>
            `${d.value}(${d.current})`
          ).join(', ')}`;
        }
      }

      const messages = [
        {
          role: 'system',
          content: `你是一个增长数据分析专家，擅长解释指标异常和提供可操作的建议。

分析要点：
1. 基于真实数据进行判断
2. 考虑常见的影响因素（季节性、营销活动、产品变更、竞品动态、技术问题）
3. 结合维度数据（来源、设备等）定位问题
4. 给出具体、可操作的建议

输出要求：
- 原因分析：列出 3-5 个最可能的原因，按概率排序
- 受影响维度：指出哪些维度受影响最大
- 建议行动：给出 3 个具体的行动建议，按优先级排序`
        },
        {
          role: 'user',
          content: contextInfo
        }
      ];

      try {
        const response = await client.chat(messages, {
          userId: job.data.userId || 'ai-system',
          metadata: {
            jobId: job.id,
            metric: anomaly.metric,
            date: formatDate(dateTs)
          }
        });

        anomaly.aiAnalysis = response.content;
        anomaly.fromCache = response.fromCache;

        logger.info(`AI analysis completed for ${anomaly.metric}`, {
          fromCache: response.fromCache,
          analysisLength: response.content.length
        });
      } catch (error) {
        logger.error(`AI analysis failed for ${anomaly.metric}`, error);
        anomaly.aiAnalysis = '分析失败，请稍后重试';
        anomaly.error = error.message;
      }
    }

    await updateProgress(job, 100, 'Analysis complete');

    return {
      date: formatDate(dateTs),
      anomalyCount: anomalies.length,
      anomalies,
      dataSnapshot: {
        current: currentData.totals,
        previous: previousData.totals,
        threshold
      },
      metadata: {
        source,
        metricsChecked: metrics,
        hasGrowthContext: !!growthContext
      }
    };
  } catch (error) {
    logger.error('Anomaly detection failed', error);
    throw error;
  }
}

/**
 * 维度分析任务 - 使用真实业务数据
 */
async function dimensionAnalysis(job) {
  const {
    anomaly,
    dimensions = ['source', 'device', 'app_version'],
    dateRange = 7 // 分析过去 N 天的数据
  } = job.data;

  await updateProgress(job, 10, 'Fetching dimension data');

  logger.info('Starting dimension analysis', { anomaly, dimensions });

  try {
    // 解析异常数据中的日期
    const anomalyDate = typeof anomaly.date === 'string' ? Date.parse(anomaly.date) : anomaly.date;
    const dayMs = 86400000;

    // 获取增长洞察数据（包含维度拆解）
    const growthData = await fetchGrowthInsights({
      start: anomalyDate - dateRange * dayMs,
      end: anomalyDate + dayMs,
      source: 'all'
    });

    await updateProgress(job, 40, 'Processing dimension breakdown');

    // 提取相关维度数据
    const dimensionBreakdown = {};

    for (const dim of dimensions) {
      if (growthData.dimensions && growthData.dimensions[dim]) {
        dimensionBreakdown[dim] = growthData.dimensions[dim].slice(0, 5); // 取前 5 个
      }
    }

    // 如果有渠道数据，也包含进来
    if (growthData.channels) {
      dimensionBreakdown.channels = growthData.channels.slice(0, 5);
    }

    await updateProgress(job, 60, 'AI analyzing dimensions');

    // AI 分析维度数据
    const client = createClient();

    const messages = [
      {
        role: 'system',
        content: `你是增长分析专家，擅长多维度拆解分析。

分析要点：
1. 识别对指标变化贡献最大的维度和值
2. 计算每个维度值的贡献度（绝对值和相对占比）
3. 找出异常的维度组合
4. 给出针对性的优化建议

输出格式（JSON）：
{
  "summary": "核心发现的一句话总结",
  "dimensions": [
    {
      "name": "维度名称",
      "impact": "high/medium/low",
      "insights": "该维度的洞察",
      "topContributors": [
        {
          "value": "维度值",
          "contribution": "贡献说明",
          "change": 数字变化
        }
      ]
    }
  ],
  "recommendations": [
    {
      "priority": 1,
      "action": "具体行动",
      "expectedImpact": "预期影响",
      "effort": "实施难度"
    }
  ]
}`
      },
      {
        role: 'user',
        content: `
指标异常：
- 指标：${anomaly.metric}
- 变化：${anomaly.change}% (${anomaly.trend || (anomaly.change > 0 ? 'up' : 'down')})
- 当前值：${anomaly.current}
- 前期值：${anomaly.previous}

维度拆解数据：
${JSON.stringify(dimensionBreakdown, null, 2)}

请分析哪些维度对这个指标变化的贡献最大，并给出优化建议。
`
      }
    ];

    try {
      const response = await client.chat(messages, {
        userId: job.data.userId || 'ai-system',
        metadata: {
          jobId: job.id,
          analysisType: 'dimension-analysis'
        },
        // 尝试使用结构化输出
        temperature: 0.3
      });

      await updateProgress(job, 100, 'Dimension analysis complete');

      // 尝试解析 JSON
      let analysis;
      try {
        // 提取 JSON 部分（AI 可能会用 markdown 包裹）
        const jsonMatch = response.content.match(/```json\n([\s\S]*?)\n```/) ||
                         response.content.match(/```\n([\s\S]*?)\n```/) ||
                         [null, response.content];
        analysis = JSON.parse(jsonMatch[1]);
      } catch (parseError) {
        // 如果解析失败，返回原始文本
        logger.warn('Failed to parse dimension analysis as JSON', parseError);
        analysis = {
          summary: 'Analysis completed',
          rawAnalysis: response.content
        };
      }

      return {
        anomaly,
        dimensions: dimensionBreakdown,
        analysis,
        metadata: {
          fromCache: response.fromCache,
          dateRange,
          dimensionsAnalyzed: dimensions
        }
      };
    } catch (error) {
      logger.error('AI dimension analysis failed', error);
      throw error;
    }
  } catch (error) {
    logger.error('Dimension analysis failed', error);
    throw error;
  }
}

/**
 * 每日简报任务 - 使用真实业务数据
 */
async function dailyReport(job) {
  const {
    date, // 默认是昨天
    source = 'all',
    includeWeeklyCore = true
  } = job.data;

  // 如果没有指定日期，默认使用昨天
  const dateTs = date ? (typeof date === 'string' ? Date.parse(date) : date) : Date.now() - 86400000;
  const dayMs = 86400000;

  logger.info(`Generating daily report for ${formatDate(dateTs)}`);

  await updateProgress(job, 10, 'Fetching daily metrics');

  try {
    // 1. 获取当天和前一天的北极星数据
    const [currentData, previousData] = await Promise.all([
      fetchNorthStar(dateTs, dateTs + dayMs, source),
      fetchNorthStar(dateTs - dayMs, dateTs, source)
    ]);

    await updateProgress(job, 30, 'Fetching growth insights');

    // 2. 获取增长洞察（7 天窗口）
    const growthData = await fetchGrowthInsights({
      start: dateTs - 6 * dayMs,
      end: dateTs + dayMs,
      source
    });

    await updateProgress(job, 50, 'Fetching weekly core metrics');

    // 3. 获取周核心指标（如果需要）
    let weeklyCore = null;
    if (includeWeeklyCore) {
      try {
        weeklyCore = await fetchWeeklyCore({ end: dateTs + dayMs, source });
      } catch (error) {
        logger.warn('Failed to fetch weekly core metrics', error);
      }
    }

    await updateProgress(job, 70, 'Detecting anomalies');

    // 4. 检测异常
    const anomalies = detectAnomalies(
      currentData,
      previousData,
      ['active_users', 'new_users', 'returning_users', 'login_users'],
      15 // 15% 阈值
    );

    await updateProgress(job, 80, 'Generating AI report');

    // 5. 生成 AI 简报
    const client = createClient();

    const reportContext = {
      date: formatDate(dateTs),
      metrics: {
        current: currentData.totals,
        previous: previousData.totals,
        changes: Object.fromEntries(
          Object.keys(currentData.totals).map(key => [
            key,
            {
              value: currentData.totals[key],
              change: ((currentData.totals[key] - previousData.totals[key]) / previousData.totals[key] * 100).toFixed(2) + '%'
            }
          ])
        )
      },
      anomalies: anomalies.map(a => ({
        metric: a.metric,
        change: a.change,
        severity: a.severity
      })),
      growth: {
        newUsers: growthData.change?.fresh || 0,
        resumedUsers: growthData.change?.resumed || 0,
        continuingUsers: growthData.change?.continuing || 0,
        absentUsers: growthData.change?.absent || 0
      },
      topSources: growthData.dimensions?.source?.slice(0, 3) || [],
      weeklyCore: weeklyCore ? {
        coreUsers: weeklyCore.core || 0,
        newCore: weeklyCore.new_core || 0,
        atRisk: weeklyCore.at_risk || 0
      } : null
    };

    const messages = [
      {
        role: 'system',
        content: `你是增长分析专家，擅长撰写简洁、可操作的每日数据简报。

简报要求：
1. 执行摘要：3 个要点，每个 1 句话，突出最重要的变化
2. 关键指标：活跃用户、新用户、留存用户的变化及解读
3. 异常情况：如有异常，说明原因和影响
4. 增长趋势：新增、回流、流失的变化
5. 行动建议：3 个具体建议，按优先级排序

输出格式：
## 📊 每日简报 - {日期}

### 🎯 执行摘要
1. 核心发现1
2. 核心发现2
3. 核心发现3

### 📈 关键指标
- 活跃用户：...
- 新用户：...
- 回访用户：...

### ⚠️ 异常情况
（如有）

### 📊 增长趋势
- 新增：...
- 回流：...
- 流失：...

### 💡 行动建议
1. 【高优先级】...
2. 【中优先级】...
3. 【低优先级】...`
      },
      {
        role: 'user',
        content: `
请基于以下数据生成每日简报：

${JSON.stringify(reportContext, null, 2)}
`
      }
    ];

    try {
      const response = await client.chat(messages, {
        userId: job.data.userId || 'ai-system',
        metadata: {
          jobId: job.id,
          reportType: 'daily-report',
          date: formatDate(dateTs)
        },
        temperature: 0.5
      });

      await updateProgress(job, 100, 'Report generated');

      return {
        date: formatDate(dateTs),
        report: response.content,
        data: reportContext,
        generatedAt: new Date().toISOString(),
        metadata: {
          fromCache: response.fromCache,
          source,
          anomalyCount: anomalies.length,
          hasWeeklyCore: !!weeklyCore
        }
      };
    } catch (error) {
      logger.error('AI report generation failed', error);
      throw error;
    }
  } catch (error) {
    logger.error('Daily report generation failed', error);
    throw error;
  }
}

/**
 * 假设验证任务 - 使用真实业务数据
 */
async function hypothesisValidation(job) {
  const {
    hypothesis,
    dateRange, // { start, end }
    metrics = ['active_users', 'new_users'],
    source = 'all',
    comparisonPeriod = 'previous' // 'previous' | 'custom'
  } = job.data;

  logger.info('Starting hypothesis validation', { hypothesis, dateRange });

  await updateProgress(job, 10, 'Fetching test period data');

  try {
    const start = typeof dateRange.start === 'string' ? Date.parse(dateRange.start) : dateRange.start;
    const end = typeof dateRange.end === 'string' ? Date.parse(dateRange.end) : dateRange.end;
    const duration = end - start;

    // 1. 获取测试期数据
    const testData = await fetchNorthStar(start, end, source);

    await updateProgress(job, 30, 'Fetching comparison data');

    // 2. 获取对比期数据
    let comparisonData;
    if (comparisonPeriod === 'previous') {
      // 对比前一个同等时长的周期
      comparisonData = await fetchNorthStar(start - duration, start, source);
    } else {
      // 自定义对比期
      comparisonData = await fetchNorthStar(
        comparisonPeriod.start,
        comparisonPeriod.end,
        source
      );
    }

    await updateProgress(job, 50, 'Analyzing statistical significance');

    // 3. 计算指标变化
    const metricChanges = metrics.map(metric => {
      const testValue = testData.totals[metric] || 0;
      const comparisonValue = comparisonData.totals[metric] || 0;
      const change = comparisonValue > 0
        ? ((testValue - comparisonValue) / comparisonValue * 100)
        : 0;

      return {
        metric,
        testValue,
        comparisonValue,
        change: parseFloat(change.toFixed(2)),
        absoluteChange: testValue - comparisonValue,
        direction: change > 0 ? 'improvement' : change < 0 ? 'decline' : 'no_change'
      };
    });

    // 4. 简单的统计显著性判断（基于变化幅度）
    const isSignificant = metricChanges.some(m => Math.abs(m.change) >= 5);

    await updateProgress(job, 70, 'AI validating hypothesis');

    // 5. AI 验证假设
    const client = createClient();

    const messages = [
      {
        role: 'system',
        content: `你是数据科学家，擅长验证增长假设和 A/B 测试分析。

分析要点：
1. 根据数据判断假设是否成立
2. 评估变化的统计显著性
3. 识别可能的混淆因素
4. 给出置信度评估（0-1，考虑样本量、变化幅度、一致性）
5. 建议下一步行动

输出格式（JSON）：
{
  "isValid": boolean,
  "confidence": number,
  "reasoning": "详细推理过程",
  "supportingEvidence": ["证据1", "证据2"],
  "concerns": ["顾虑1", "顾虑2"],
  "nextSteps": [
    {
      "action": "具体行动",
      "priority": "high/medium/low",
      "rationale": "原因"
    }
  ]
}`
      },
      {
        role: 'user',
        content: `
假设：${hypothesis}

测试期数据：
- 时间范围：${formatDate(start)} 至 ${formatDate(end)}
- 来源：${source}

对比期数据：
- 时间范围：${formatDate(start - duration)} 至 ${formatDate(start)}

指标变化：
${JSON.stringify(metricChanges, null, 2)}

统计显著性：${isSignificant ? '显著' : '不显著'}

请验证这个假设是否成立，给出置信度并建议下一步行动。
`
      }
    ];

    try {
      const response = await client.chat(messages, {
        userId: job.data.userId || 'ai-system',
        metadata: {
          jobId: job.id,
          analysisType: 'hypothesis-validation',
          hypothesis
        },
        temperature: 0.3
      });

      await updateProgress(job, 100, 'Validation complete');

      // 尝试解析 JSON
      let validation;
      try {
        const jsonMatch = response.content.match(/```json\n([\s\S]*?)\n```/) ||
                         response.content.match(/```\n([\s\S]*?)\n```/) ||
                         [null, response.content];
        validation = JSON.parse(jsonMatch[1]);
      } catch (parseError) {
        logger.warn('Failed to parse validation as JSON', parseError);
        validation = {
          rawAnalysis: response.content
        };
      }

      return {
        hypothesis,
        validation,
        data: {
          test: testData.totals,
          comparison: comparisonData.totals,
          changes: metricChanges,
          isSignificant
        },
        metadata: {
          fromCache: response.fromCache,
          dateRange: {
            test: { start: formatDate(start), end: formatDate(end) },
            comparison: { start: formatDate(start - duration), end: formatDate(start) }
          },
          source
        }
      };
    } catch (error) {
      logger.error('AI hypothesis validation failed', error);
      throw error;
    }
  } catch (error) {
    logger.error('Hypothesis validation failed', error);
    throw error;
  }
}

module.exports = {
  'anomaly-detection': anomalyDetection,
  'dimension-analysis': dimensionAnalysis,
  'daily-report': dailyReport,
  'hypothesis-validation': hypothesisValidation
};

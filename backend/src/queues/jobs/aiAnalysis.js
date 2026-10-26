/**
 * AI 分析任务类型定义
 */

const { createClient } = require('../../ai/llm');

/**
 * 异常检测任务
 */
async function anomalyDetection(job) {
  const { date, metrics } = job.data;

  job.progress(10);

  // TODO: 实际的异常检测逻辑
  // 这里先模拟
  const anomalies = [];

  for (let i = 0; i < metrics.length; i++) {
    const metric = metrics[i];

    job.progress(20 + (i / metrics.length) * 60);

    // 模拟检测
    const hasAnomaly = Math.random() > 0.7;

    if (hasAnomaly) {
      anomalies.push({
        metric,
        date,
        change: -15,
        severity: 'high'
      });
    }
  }

  job.progress(80);

  // 如果有异常，调用 LLM 分析
  if (anomalies.length > 0) {
    const client = createClient();

    const analysisPromises = anomalies.map(async (anomaly) => {
      const messages = [
        {
          role: 'system',
          content: '你是一个增长分析专家，擅长解释指标异常。'
        },
        {
          role: 'user',
          content: `指标 ${anomaly.metric} 在 ${anomaly.date} 下降了 ${Math.abs(anomaly.change)}%，请分析可能的原因。`
        }
      ];

      const response = await client.chat(messages, {
        userId: job.data.userId,
        metadata: { jobId: job.id }
      });

      return {
        ...anomaly,
        analysis: response.content
      };
    });

    const results = await Promise.all(analysisPromises);

    job.progress(100);

    return {
      date,
      anomalyCount: anomalies.length,
      anomalies: results
    };
  }

  job.progress(100);

  return {
    date,
    anomalyCount: 0,
    message: 'No anomalies detected'
  };
}

/**
 * 维度分析任务
 */
async function dimensionAnalysis(job) {
  const { anomaly, dimensions } = job.data;

  job.progress(10);

  const client = createClient();

  // 构建分析 prompt
  const messages = [
    {
      role: 'system',
      content: '你是增长分析专家，擅长多维度拆解分析。'
    },
    {
      role: 'user',
      content: `
指标异常：${anomaly.metric} 下降 ${Math.abs(anomaly.change)}%

请按以下维度分析：${dimensions.join(', ')}

返回 JSON 格式：
{
  "dimensions": [
    {
      "name": "渠道",
      "breakdown": [
        {"value": "Twitter", "impact": -20, "contribution": 0.6},
        {"value": "Facebook", "impact": -5, "contribution": 0.2}
      ]
    }
  ],
  "insights": ["洞察1", "洞察2"]
}
`
    }
  ];

  job.progress(50);

  const response = await client.chat(messages, {
    userId: job.data.userId,
    metadata: { jobId: job.id }
  });

  job.progress(100);

  return {
    anomaly,
    analysis: response.content
  };
}

/**
 * 每日简报任务
 */
async function dailyReport(job) {
  const { date } = job.data;

  job.progress(10);

  const client = createClient();

  // 生成每日简报
  const messages = [
    {
      role: 'system',
      content: '你是增长分析专家，擅长撰写每日数据简报。'
    },
    {
      role: 'user',
      content: `
生成 ${date} 的增长数据简报，包括：

1. 关键指标总览
2. 异常情况（如果有）
3. 重要趋势
4. 行动建议

格式：
- 执行摘要（3 个要点）
- 详细分析
- 建议优先级排序
`
    }
  ];

  job.progress(50);

  const response = await client.chat(messages, {
    metadata: { jobId: job.id, type: 'daily-report' }
  });

  job.progress(100);

  return {
    date,
    report: response.content,
    generatedAt: new Date().toISOString()
  };
}

/**
 * 假设验证任务
 */
async function hypothesisValidation(job) {
  const { hypothesis, data } = job.data;

  job.progress(20);

  const client = createClient();

  const messages = [
    {
      role: 'system',
      content: '你是数据科学家，擅长验证增长假设。'
    },
    {
      role: 'user',
      content: `
假设：${hypothesis}

数据：${JSON.stringify(data, null, 2)}

请：
1. 验证假设是否成立
2. 给出置信度（0-1）
3. 说明理由
4. 建议下一步行动

返回 JSON 格式：
{
  "isValid": boolean,
  "confidence": number,
  "reasoning": "string",
  "nextSteps": ["step1", "step2"]
}
`
    }
  ];

  job.progress(60);

  const response = await client.chat(messages, {
    userId: job.data.userId,
    metadata: { jobId: job.id }
  });

  job.progress(100);

  return {
    hypothesis,
    validation: response.content
  };
}

module.exports = {
  'anomaly-detection': anomalyDetection,
  'dimension-analysis': dimensionAnalysis,
  'daily-report': dailyReport,
  'hypothesis-validation': hypothesisValidation
};

/**
 * AI 配置管理 API
 * 用于查看、切换模型和查看成本统计
 */

const express = require('express');
const { getAvailableModels, getConfig, CostTracker } = require('../ai/llm');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const costTracker = new CostTracker();

/**
 * 获取可用的模型列表
 */
router.get('/models', requireAuth, async (req, res) => {
  try {
    const models = getAvailableModels();
    const config = getConfig();

    res.json({
      models,
      currentModel: config.defaultModel,
      complexModel: config.defaultModel,
      providers: {
        openai: !!config.openai.apiKey
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取今日使用统计
 */
router.get('/usage/today', requireAuth, async (req, res) => {
  try {
    const stats = await costTracker.getTodayStats(req.user.user_id);

    const summary = {
      totalCalls: 0,
      totalCost: 0,
      totalTokens: 0,
      byModel: {}
    };

    stats.forEach(stat => {
      summary.totalCalls += parseInt(stat.total_calls);
      summary.totalCost += parseFloat(stat.total_cost);
      summary.totalTokens += parseInt(stat.total_tokens);

      summary.byModel[stat.model] = {
        provider: stat.provider,
        calls: parseInt(stat.total_calls),
        cost: parseFloat(stat.total_cost),
        inputTokens: parseInt(stat.total_input_tokens),
        outputTokens: parseInt(stat.total_output_tokens),
        avgDuration: parseFloat(stat.avg_duration)
      };
    });

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取历史使用统计
 */
router.get('/usage/history', requireAuth, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const stats = await costTracker.getStats(startDate, endDate, req.user.user_id);

    res.json({
      startDate,
      endDate,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 对比不同模型
 */
router.get('/usage/compare', requireAuth, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const comparison = await costTracker.compareModels(startDate, endDate, req.user.user_id);

    res.json({
      startDate,
      endDate,
      comparison
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新配置 (需要重启服务)
 */
router.post('/config', requireAuth, async (req, res) => {
  try {
    const { defaultModel } = req.body;

    // 这里只是返回提示，实际需要修改环境变量
    res.json({
      message: 'To change the default model, update AI_DEFAULT_MODEL in .env and restart the server',
      currentModel: getConfig().defaultModel,
      requestedModel: defaultModel
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

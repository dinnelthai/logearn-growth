const express = require('express');
const { redis, llmCache, dataCache } = require('../cache');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

/**
 * 获取 Redis 健康状态
 */
router.get('/cache/health', requireAuth, async (req, res) => {
  try {
    const health = await redis.checkHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取 LLM 缓存统计
 */
router.get('/cache/llm/stats', requireAuth, async (req, res) => {
  try {
    const stats = await llmCache.getStats();
    res.json(stats || { message: 'Redis not available' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 清空 LLM 缓存
 */
router.delete('/cache/llm', requireAuth, async (req, res) => {
  try {
    const count = await llmCache.clear();
    res.json({
      success: true,
      cleared: count,
      message: `Cleared ${count} LLM cache entries`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 使数据缓存失效
 */
router.delete('/cache/data/:metric/:date', requireAuth, async (req, res) => {
  try {
    const { metric, date } = req.params;
    const count = await dataCache.invalidate(metric, date);
    res.json({
      success: true,
      invalidated: count,
      message: `Invalidated ${count} data cache entries for ${metric}:${date}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 测试缓存性能
 */
router.post('/cache/benchmark', requireAuth, async (req, res) => {
  try {
    const { createClient } = require('../ai/llm');
    const client = createClient();

    const testMessages = [
      { role: 'user', content: '为什么活跃用户下降？' }
    ];

    // 第一次调用（无缓存）
    const start1 = Date.now();
    const response1 = await client.chat(testMessages);
    const duration1 = Date.now() - start1;

    // 第二次调用（有缓存）
    const start2 = Date.now();
    const response2 = await client.chat(testMessages);
    const duration2 = Date.now() - start2;

    res.json({
      firstCall: {
        duration: duration1,
        fromCache: response1.fromCache,
        tokens: response1.usage?.totalTokens
      },
      secondCall: {
        duration: duration2,
        fromCache: response2.fromCache,
        tokens: response2.usage?.totalTokens
      },
      speedup: `${(duration1 / duration2).toFixed(1)}x faster`,
      cacheSaved: !response2.fromCache ? 0 : client.calculateCost(response1.usage)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

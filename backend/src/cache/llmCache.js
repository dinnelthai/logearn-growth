const crypto = require('crypto');
const { getClient } = require('./redis');
const logger = console;

const DEFAULT_TTL = 86400; // 24 小时
const NAMESPACE = 'llm:response';

/**
 * 生成缓存 key 的哈希
 */
function generateHash(prompt, model, options = {}) {
  const content = JSON.stringify({
    prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
    model,
    temperature: options.temperature,
    maxTokens: options.maxTokens
  });

  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * 构建缓存 key
 */
function buildKey(hash, version = 'v1') {
  return `${NAMESPACE}:${hash}:${version}`;
}

/**
 * 获取缓存的 LLM 响应
 */
async function get(prompt, model, options = {}) {
  try {
    const redis = getClient();
    if (!redis) return null;

    const hash = generateHash(prompt, model, options);
    const key = buildKey(hash);

    const cached = await redis.get(key);

    if (cached) {
      logger.debug(`LLM cache hit: ${key}`);
      return JSON.parse(cached);
    }

    logger.debug(`LLM cache miss: ${key}`);
    return null;
  } catch (error) {
    logger.error('LLM cache get error:', error.message);
    return null; // 缓存失败不影响业务
  }
}

/**
 * 设置 LLM 响应缓存
 */
async function set(prompt, model, response, options = {}) {
  try {
    const redis = getClient();
    if (!redis) return false;

    const hash = generateHash(prompt, model, options);
    const key = buildKey(hash);

    const cacheData = {
      prompt: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
      response,
      model,
      tokens: response.usage?.totalTokens,
      cost: calculateCost(response.usage, model),
      timestamp: Date.now(),
      metadata: options.metadata || {}
    };

    const ttl = options.ttl || DEFAULT_TTL;
    await redis.setex(key, ttl, JSON.stringify(cacheData));

    logger.debug(`LLM cache set: ${key} (TTL: ${ttl}s)`);
    return true;
  } catch (error) {
    logger.error('LLM cache set error:', error.message);
    return false;
  }
}

/**
 * 删除缓存
 */
async function del(prompt, model, options = {}) {
  try {
    const redis = getClient();
    if (!redis) return false;

    const hash = generateHash(prompt, model, options);
    const key = buildKey(hash);

    await redis.del(key);
    logger.debug(`LLM cache deleted: ${key}`);
    return true;
  } catch (error) {
    logger.error('LLM cache delete error:', error.message);
    return false;
  }
}

/**
 * 清空所有 LLM 缓存
 */
async function clear() {
  try {
    const redis = getClient();
    if (!redis) return 0;

    const keys = await redis.keys(`${NAMESPACE}:*`);

    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Cleared ${keys.length} LLM cache entries`);
    }

    return keys.length;
  } catch (error) {
    logger.error('LLM cache clear error:', error.message);
    return 0;
  }
}

/**
 * 获取缓存统计
 */
async function getStats() {
  try {
    const redis = getClient();
    if (!redis) return null;

    const keys = await redis.keys(`${NAMESPACE}:*`);

    let totalSize = 0;
    let sampleCount = 0;

    // 只采样前 100 个
    for (const key of keys.slice(0, 100)) {
      const data = await redis.get(key);
      if (data) {
        totalSize += Buffer.byteLength(data, 'utf8');
        sampleCount++;
      }
    }

    const avgSize = sampleCount > 0 ? totalSize / sampleCount : 0;
    const estimatedTotalSize = avgSize * keys.length;

    return {
      totalKeys: keys.length,
      estimatedSizeBytes: Math.round(estimatedTotalSize),
      estimatedSizeMB: (estimatedTotalSize / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    logger.error('LLM cache stats error:', error.message);
    return null;
  }
}

/**
 * 计算成本（简化版）
 */
function calculateCost(usage, model) {
  if (!usage) return 0;

  const costs = {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'claude-sonnet-4': { input: 0.003, output: 0.015 },
    'claude-opus-4': { input: 0.015, output: 0.075 },
    'claude-haiku-4': { input: 0.0003, output: 0.0015 }
  };

  const cost = costs[model] || costs['gpt-4o-mini'];
  const inputCost = ((usage.inputTokens || 0) / 1000) * cost.input;
  const outputCost = ((usage.outputTokens || 0) / 1000) * cost.output;

  return inputCost + outputCost;
}

module.exports = {
  get,
  set,
  del,
  clear,
  getStats
};

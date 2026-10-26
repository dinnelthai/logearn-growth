const { getClient } = require('./redis');
const logger = console;

const NAMESPACE = 'rate:limit';

/**
 * 检查速率限制
 */
async function checkLimit(key, limit, window = 3600) {
  try {
    const redis = getClient();
    if (!redis) {
      // Redis 不可用时，允许请求（fail-open）
      return { allowed: true };
    }

    const fullKey = `${NAMESPACE}:${key}`;

    const current = await redis.incr(fullKey);

    if (current === 1) {
      await redis.expire(fullKey, window);
    }

    if (current > limit) {
      const ttl = await redis.ttl(fullKey);
      logger.warn(`Rate limit exceeded for ${key}: ${current}/${limit}`);

      return {
        allowed: false,
        current,
        limit,
        resetIn: ttl
      };
    }

    return {
      allowed: true,
      current,
      limit,
      remaining: limit - current
    };
  } catch (error) {
    logger.error('Rate limit check error:', error.message);
    // 失败时允许请求（fail-open）
    return { allowed: true };
  }
}

/**
 * 重置速率限制
 */
async function reset(key) {
  try {
    const redis = getClient();
    if (!redis) return false;

    const fullKey = `${NAMESPACE}:${key}`;
    await redis.del(fullKey);
    return true;
  } catch (error) {
    logger.error('Rate limit reset error:', error.message);
    return false;
  }
}

/**
 * 获取当前计数
 */
async function getCount(key) {
  try {
    const redis = getClient();
    if (!redis) return 0;

    const fullKey = `${NAMESPACE}:${key}`;
    const count = await redis.get(fullKey);
    return parseInt(count || '0', 10);
  } catch (error) {
    logger.error('Rate limit getCount error:', error.message);
    return 0;
  }
}

module.exports = {
  checkLimit,
  reset,
  getCount
};

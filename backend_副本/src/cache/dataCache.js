const { getClient } = require('./redis');
const logger = console;

const DEFAULT_TTL = 3600; // 1 小时
const NAMESPACE = 'data:query';

/**
 * 构建缓存 key
 */
function buildKey(metric, date, dimension = 'all') {
  return `${NAMESPACE}:${metric}:${date}:${dimension}`;
}

/**
 * 获取数据查询缓存
 */
async function get(metric, date, dimension) {
  try {
    const redis = getClient();
    if (!redis) return null;

    const key = buildKey(metric, date, dimension);

    const cached = await redis.get(key);

    if (cached) {
      logger.debug(`Data cache hit: ${key}`);
      return JSON.parse(cached);
    }

    return null;
  } catch (error) {
    logger.error('Data cache get error:', error.message);
    return null;
  }
}

/**
 * 设置数据查询缓存
 */
async function set(metric, date, dimension, data, ttl = DEFAULT_TTL) {
  try {
    const redis = getClient();
    if (!redis) return false;

    const key = buildKey(metric, date, dimension);

    const cacheData = {
      metric,
      date,
      dimension,
      data,
      computedAt: Date.now()
    };

    await redis.setex(key, ttl, JSON.stringify(cacheData));
    logger.debug(`Data cache set: ${key}`);

    return true;
  } catch (error) {
    logger.error('Data cache set error:', error.message);
    return false;
  }
}

/**
 * 使缓存失效
 */
async function invalidate(metric, date) {
  try {
    const redis = getClient();
    if (!redis) return 0;

    const pattern = `${NAMESPACE}:${metric}:${date}:*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Invalidated ${keys.length} data cache entries for ${metric}:${date}`);
    }

    return keys.length;
  } catch (error) {
    logger.error('Data cache invalidate error:', error.message);
    return 0;
  }
}

/**
 * 批量获取
 */
async function mget(queries) {
  try {
    const redis = getClient();
    if (!redis) return queries.map(() => null);

    const keys = queries.map(q => buildKey(q.metric, q.date, q.dimension));

    const values = await redis.mget(...keys);

    return values.map((val, idx) => {
      if (val) {
        logger.debug(`Data cache hit: ${keys[idx]}`);
        return JSON.parse(val);
      }
      return null;
    });
  } catch (error) {
    logger.error('Data cache mget error:', error.message);
    return queries.map(() => null);
  }
}

/**
 * 批量设置
 */
async function mset(items, ttl = DEFAULT_TTL) {
  try {
    const redis = getClient();
    if (!redis) return false;

    const pipeline = redis.pipeline();

    items.forEach(({ metric, date, dimension, data }) => {
      const key = buildKey(metric, date, dimension);
      const cacheData = {
        metric,
        date,
        dimension,
        data,
        computedAt: Date.now()
      };
      pipeline.setex(key, ttl, JSON.stringify(cacheData));
    });

    await pipeline.exec();
    logger.debug(`Data cache mset: ${items.length} items`);

    return true;
  } catch (error) {
    logger.error('Data cache mset error:', error.message);
    return false;
  }
}

module.exports = {
  get,
  set,
  invalidate,
  mget,
  mset
};

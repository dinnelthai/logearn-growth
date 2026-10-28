/**
 * Bull 队列 Redis 连接配置
 */

const { getClient } = require('../cache/redis');

/**
 * 获取 Bull 使用的 Redis 配置
 */
function getBullRedisConfig() {
  const redisUrl = process.env.BULL_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);
  if (!['redis:', 'rediss:'].includes(url.protocol)) {
    throw Object.assign(new Error('队列需要 redis:// 或 rediss:// 地址；HTTPS REST 地址不能用于 Bull'), {status:503});
  }

  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    ...(url.protocol === 'rediss:' ? {tls:{}} : {}),
    ...(url.username ? {username:decodeURIComponent(url.username)} : {}),
    password: url.password ? decodeURIComponent(url.password) : process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: null, // Bull 需要
    enableReadyCheck: false,    // Bull 需要
    connectTimeout: 10000,
    retryStrategy: (times) => {
      if (times > 3) return null; // 停止重试
      return Math.min(times * 1000, 5000);
    }
  };
}

/**
 * 获取共享的 Redis 客户端（用于 BullMQ）
 */
function getSharedConnection() {
  return getClient();
}

module.exports = {
  getBullRedisConfig,
  getSharedConnection
};

/**
 * Bull 队列 Redis 连接配置
 */

const { getClient } = require('../cache/redis');

/**
 * 获取 Bull 使用的 Redis 配置
 */
function getBullRedisConfig() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);

  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || process.env.REDIS_PASSWORD || undefined,
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

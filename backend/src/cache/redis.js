const Redis = require('ioredis');
const logger = console;

let client = null;
let isConnected = false;

/**
 * 初始化 Redis 客户端
 */
function createClient() {
  if (client) return client;

  const config = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    // 失败时不阻塞应用启动
    lazyConnect: true
  };

  // Sentinel 配置（生产环境高可用）
  if (process.env.REDIS_SENTINELS) {
    try {
      config.sentinels = JSON.parse(process.env.REDIS_SENTINELS);
      config.name = process.env.REDIS_MASTER_NAME || 'mymaster';
    } catch (error) {
      logger.error('Failed to parse REDIS_SENTINELS:', error);
    }
  }

  client = new Redis(config);

  client.on('connect', () => {
    logger.info('Redis connected');
    isConnected = true;
  });

  client.on('ready', () => {
    logger.info('Redis ready');
    isConnected = true;
  });

  client.on('error', (err) => {
    logger.error('Redis error:', err.message);
    isConnected = false;
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
    isConnected = false;
  });

  // 尝试连接
  client.connect().catch(err => {
    logger.error('Redis initial connection failed:', err.message);
  });

  return client;
}

/**
 * 检查 Redis 是否可用
 */
async function checkHealth() {
  if (!client || !isConnected) {
    return { status: 'disconnected' };
  }

  try {
    const pong = await client.ping();
    const info = await client.info('server');

    return {
      status: 'healthy',
      pong,
      serverInfo: parseRedisInfo(info)
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * 解析 Redis INFO 命令输出
 */
function parseRedisInfo(info) {
  const lines = info.split('\r\n');
  const result = {};

  lines.forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split(':');
      if (key && value) {
        result[key] = value;
      }
    }
  });

  return {
    version: result.redis_version,
    uptimeInDays: result.uptime_in_seconds
      ? Math.floor(result.uptime_in_seconds / 86400)
      : 0,
    connectedClients: result.connected_clients,
    usedMemory: result.used_memory_human
  };
}

/**
 * 关闭连接
 */
async function disconnect() {
  if (client) {
    await client.quit();
    client = null;
    isConnected = false;
    logger.info('Redis disconnected');
  }
}

/**
 * 获取客户端实例
 */
function getClient() {
  if (!client) {
    return createClient();
  }
  return client;
}

module.exports = {
  createClient,
  getClient,
  checkHealth,
  disconnect,
  isConnected: () => isConnected
};

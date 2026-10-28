const Redis = require('ioredis');
const logger = console;

let client = null;
let isConnected = false;

// No credentials are logged. URL credentials and TLS are supported while
// preserving legacy REDIS_HOST / REDIS_PORT only when no URL was supplied.
function cacheConnectionConfig(env=process.env){
 // Match getBullRedisConfig() exactly: a dedicated TCP Bull URL wins over
 // REDIS_URL (which some deployments use for an HTTPS REST cache endpoint).
 const raw=env.BULL_REDIS_URL||env.REDIS_URL||null;
 if(raw){
  const url=new URL(raw);
  if(!['redis:','rediss:'].includes(url.protocol))
   throw Error('缓存和 LLM 限流需要 redis:// 或 rediss:// 地址');
  const port=Number(url.port||6379),db=Number(env.REDIS_DB||0);
  if(!Number.isInteger(port)||port<1||port>65535||
    !Number.isInteger(db)||db<0)throw Error('Redis 端口或数据库编号无效');
  return {
   host:url.hostname,port,db,
   ...(url.protocol==='rediss:'?{tls:{}}:{}),
   ...(url.username?{username:decodeURIComponent(url.username)}:{}),
   password:url.password?decodeURIComponent(url.password):env.REDIS_PASSWORD||undefined
  };
 }
 const port=Number(env.REDIS_PORT||6379),db=Number(env.REDIS_DB||0);
 if(!Number.isInteger(port)||port<1||port>65535||
   !Number.isInteger(db)||db<0)throw Error('Redis 端口或数据库编号无效');
 return {host:env.REDIS_HOST||'localhost',port,db,
  password:env.REDIS_PASSWORD||undefined};
}


/**
 * 初始化 Redis 客户端
 */
function createClient() {
  if (client) return client;

  // Use the same Redis URL precedence as Bull's ai-analysis queue. The old
  // cache/LLM limiter silently ignored REDIS_URL and dialed localhost:6379,
  // even when Bull (correctly) used the configured SSH tunnel at :16379.
  const config = cacheConnectionConfig(process.env);
  Object.assign(config, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    // 失败时不阻塞应用启动
    lazyConnect: true
  });

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
  isConnected: () => isConnected,
  cacheConnectionConfig
};

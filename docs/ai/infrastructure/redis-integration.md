# Redis 集成实施文档

## 一、概述

Redis 在 AI Growth Agent 中扮演两个核心角色：
1. **缓存层** - 缓存 LLM 响应、数据查询结果，降低成本和延迟
2. **消息队列** - 作为 Bull 的底层存储，管理异步任务

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        应用层                                 │
│  Express API · LLM Client · Data Access · Analysis Jobs      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Redis 缓存层                             │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐  │
│  │ LLM 响应    │ 数据查询    │ 用户会话    │ 速率限制    │  │
│  │ 缓存        │ 缓存        │ 缓存        │ 计数器      │  │
│  └─────────────┴─────────────┴─────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Redis 队列层 (Bull)                        │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐  │
│  │ AI 分析     │ 报告生成    │ 数据同步    │ 定时任务    │  │
│  │ 队列        │ 队列        │ 队列        │ 队列        │  │
│  └─────────────┴─────────────┴─────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 三、数据结构设计

### 1. 缓存 Key 命名规范

```
{namespace}:{type}:{id}:{version}

namespace - 功能模块 (llm, data, user, session)
type      - 数据类型 (response, query, profile)
id        - 唯一标识 (hash, metric_name, user_id)
version   - 可选版本号 (v1, v2)

示例：
llm:response:a3f2c1b9:v1
data:metric:active_users:2026-10-26
user:session:user123:token
rate:limit:api:user456
```

### 2. 缓存数据结构

#### 2.1 LLM 响应缓存
```javascript
Key: llm:response:{hash}
Type: String (JSON)
TTL: 86400 (24 小时)

Value:
{
  "prompt": "问题原文",
  "response": "AI 回答",
  "model": "gpt-4o-mini",
  "tokens": 1234,
  "cost": 0.0012,
  "timestamp": 1698336000,
  "metadata": {
    "task": "anomaly_detection",
    "metric": "active_users"
  }
}
```

#### 2.2 数据查询缓存
```javascript
Key: data:query:{metric}:{date}:{dimension}
Type: String (JSON)
TTL: 3600 (1 小时)

Value:
{
  "metric": "active_users",
  "date": "2026-10-26",
  "dimension": "channel",
  "data": [...],
  "computedAt": 1698336000
}
```

#### 2.3 用户会话缓存
```javascript
Key: user:session:{userId}
Type: Hash
TTL: 7200 (2 小时)

Fields:
context: "用户当前关注的上下文"
preferences: {"preferredDimensions": ["channel", "userType"]}
lastQuery: "最后一次查询"
```

#### 2.4 速率限制
```javascript
Key: rate:limit:llm:{userId}
Type: String (counter)
TTL: 3600 (1 小时)

Value: "5" (调用次数)
```

## 四、实现方案

### 1. 文件结构

```
backend/src/cache/
├── redis.js               # Redis 客户端初始化
├── llmCache.js            # LLM 响应缓存
├── dataCache.js           # 数据查询缓存
├── sessionCache.js        # 用户会话缓存
├── rateLimit.js           # 速率限制
└── index.js               # 统一导出
```

### 2. Redis 客户端初始化

```javascript
// backend/src/cache/redis.js
const Redis = require('ioredis');
const logger = require('../utils/logger');

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
    maxRetriesPerRequest: 3
  };

  // Sentinel 配置（生产环境高可用）
  if (process.env.REDIS_SENTINELS) {
    config.sentinels = JSON.parse(process.env.REDIS_SENTINELS);
    config.name = process.env.REDIS_MASTER_NAME || 'mymaster';
  }

  client = new Redis(config);

  client.on('connect', () => {
    logger.info('Redis connected');
    isConnected = true;
  });

  client.on('error', (err) => {
    logger.error('Redis error:', err);
    isConnected = false;
  });

  client.on('close', () => {
    logger.warn('Redis connection closed');
    isConnected = false;
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
    uptimeInDays: Math.floor(result.uptime_in_seconds / 86400),
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
  }
}

module.exports = {
  createClient,
  getClient: () => client || createClient(),
  checkHealth,
  disconnect,
  isConnected: () => isConnected
};
```

### 3. LLM 响应缓存

```javascript
// backend/src/cache/llmCache.js
const crypto = require('crypto');
const { getClient } = require('./redis');
const logger = require('../utils/logger');

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
    logger.error('LLM cache get error:', error);
    return null; // 缓存失败不影响业务
  }
}

/**
 * 设置 LLM 响应缓存
 */
async function set(prompt, model, response, options = {}) {
  try {
    const redis = getClient();
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
    logger.error('LLM cache set error:', error);
    return false;
  }
}

/**
 * 删除缓存
 */
async function del(prompt, model, options = {}) {
  try {
    const redis = getClient();
    const hash = generateHash(prompt, model, options);
    const key = buildKey(hash);
    
    await redis.del(key);
    logger.debug(`LLM cache deleted: ${key}`);
    return true;
  } catch (error) {
    logger.error('LLM cache delete error:', error);
    return false;
  }
}

/**
 * 清空所有 LLM 缓存
 */
async function clear() {
  try {
    const redis = getClient();
    const keys = await redis.keys(`${NAMESPACE}:*`);
    
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Cleared ${keys.length} LLM cache entries`);
    }
    
    return keys.length;
  } catch (error) {
    logger.error('LLM cache clear error:', error);
    return 0;
  }
}

/**
 * 获取缓存统计
 */
async function getStats() {
  try {
    const redis = getClient();
    const keys = await redis.keys(`${NAMESPACE}:*`);
    
    let totalSize = 0;
    let totalHits = 0;
    
    for (const key of keys.slice(0, 100)) { // 只采样前 100 个
      const data = await redis.get(key);
      if (data) {
        totalSize += Buffer.byteLength(data, 'utf8');
      }
    }
    
    return {
      totalKeys: keys.length,
      estimatedSizeBytes: Math.round((totalSize / Math.min(keys.length, 100)) * keys.length),
      estimatedSizeMB: ((totalSize / Math.min(keys.length, 100)) * keys.length / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    logger.error('LLM cache stats error:', error);
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
    'claude-opus-4': { input: 0.015, output: 0.075 }
  };
  
  const cost = costs[model] || costs['gpt-4o-mini'];
  const inputCost = (usage.inputTokens / 1000) * cost.input;
  const outputCost = (usage.outputTokens / 1000) * cost.output;
  
  return inputCost + outputCost;
}

module.exports = {
  get,
  set,
  del,
  clear,
  getStats
};
```

### 4. 数据查询缓存

```javascript
// backend/src/cache/dataCache.js
const { getClient } = require('./redis');
const logger = require('../utils/logger');

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
    const key = buildKey(metric, date, dimension);
    
    const cached = await redis.get(key);
    
    if (cached) {
      logger.debug(`Data cache hit: ${key}`);
      return JSON.parse(cached);
    }
    
    return null;
  } catch (error) {
    logger.error('Data cache get error:', error);
    return null;
  }
}

/**
 * 设置数据查询缓存
 */
async function set(metric, date, dimension, data, ttl = DEFAULT_TTL) {
  try {
    const redis = getClient();
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
    logger.error('Data cache set error:', error);
    return false;
  }
}

/**
 * 使缓存失效
 */
async function invalidate(metric, date) {
  try {
    const redis = getClient();
    const pattern = `${NAMESPACE}:${metric}:${date}:*`;
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info(`Invalidated ${keys.length} data cache entries for ${metric}:${date}`);
    }
    
    return keys.length;
  } catch (error) {
    logger.error('Data cache invalidate error:', error);
    return 0;
  }
}

/**
 * 批量获取
 */
async function mget(queries) {
  try {
    const redis = getClient();
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
    logger.error('Data cache mget error:', error);
    return queries.map(() => null);
  }
}

/**
 * 批量设置
 */
async function mset(items, ttl = DEFAULT_TTL) {
  try {
    const redis = getClient();
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
    logger.error('Data cache mset error:', error);
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
```

### 5. 速率限制

```javascript
// backend/src/cache/rateLimit.js
const { getClient } = require('./redis');
const logger = require('../utils/logger');

const NAMESPACE = 'rate:limit';

/**
 * 检查速率限制
 */
async function checkLimit(key, limit, window = 3600) {
  try {
    const redis = getClient();
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
    logger.error('Rate limit check error:', error);
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
    const fullKey = `${NAMESPACE}:${key}`;
    await redis.del(fullKey);
    return true;
  } catch (error) {
    logger.error('Rate limit reset error:', error);
    return false;
  }
}

module.exports = {
  checkLimit,
  reset
};
```

## 五、配置

### 1. 环境变量

```bash
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# 生产环境 Sentinel 配置（高可用）
REDIS_SENTINELS=[{"host":"sentinel1","port":26379},{"host":"sentinel2","port":26379}]
REDIS_MASTER_NAME=mymaster

# 缓存配置
REDIS_LLM_CACHE_TTL=86400        # LLM 缓存 24 小时
REDIS_DATA_CACHE_TTL=3600        # 数据缓存 1 小时
REDIS_SESSION_TTL=7200           # 会话缓存 2 小时

# 速率限制
REDIS_RATE_LIMIT_LLM=100         # 每小时 100 次 LLM 调用
REDIS_RATE_LIMIT_API=1000        # 每小时 1000 次 API 调用
```

### 2. package.json 依赖

```json
{
  "dependencies": {
    "ioredis": "^5.4.1"
  }
}
```

## 六、集成到 LLM 客户端

```javascript
// backend/src/ai/llm/client.js (修改)
const llmCache = require('../../cache/llmCache');
const rateLimit = require('../../cache/rateLimit');

class LLMClient {
  async chat(messages, options = {}) {
    // 1. 检查速率限制
    const rateLimitKey = `llm:${options.userId || 'anonymous'}`;
    const rateCheck = await rateLimit.checkLimit(
      rateLimitKey, 
      100, // 每小时 100 次
      3600
    );
    
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Reset in ${rateCheck.resetIn}s`);
    }
    
    // 2. 检查缓存
    if (!options.skipCache) {
      const cached = await llmCache.get(messages, this.model, options);
      if (cached) {
        logger.info('LLM response from cache');
        return {
          ...cached.response,
          fromCache: true
        };
      }
    }
    
    // 3. 调用 LLM
    const response = await this.provider.chat({
      model: this.model,
      messages,
      ...options
    });
    
    // 4. 缓存响应
    if (!options.skipCache) {
      await llmCache.set(messages, this.model, response, {
        ttl: options.cacheTTL || 86400,
        metadata: options.metadata
      });
    }
    
    return response;
  }
}
```

## 七、监控和运维

### 1. 健康检查 API

```javascript
// backend/src/routes/system.js
const { checkHealth } = require('../cache/redis');
const llmCache = require('../cache/llmCache');

router.get('/health/redis', async (req, res) => {
  const health = await checkHealth();
  const stats = await llmCache.getStats();
  
  res.json({
    redis: health,
    cache: {
      llm: stats
    }
  });
});
```

### 2. 缓存管理 API

```javascript
// 清空 LLM 缓存
router.delete('/cache/llm', requireAuth, async (req, res) => {
  const count = await llmCache.clear();
  res.json({ cleared: count });
});

// 查看缓存统计
router.get('/cache/stats', requireAuth, async (req, res) => {
  const stats = await llmCache.getStats();
  res.json(stats);
});
```

## 八、最佳实践

### 1. 缓存失效策略

- **LLM 响应**：24 小时 TTL，相同问题 1 天内不重复调用
- **数据查询**：1 小时 TTL，T+1 数据可以缓存更久
- **实时数据**：不缓存或 TTL 很短（5 分钟）

### 2. 缓存预热

```javascript
// 每天早上预热热门查询
async function warmupCache() {
  const hotQueries = [
    { metric: 'active_users', date: 'yesterday' },
    { metric: 'new_users', date: 'yesterday' },
    { metric: 'conversion_rate', date: 'yesterday' }
  ];
  
  for (const query of hotQueries) {
    const data = await fetchData(query);
    await dataCache.set(query.metric, query.date, 'all', data);
  }
}
```

### 3. 成本节省估算

假设：
- 每天 100 次 LLM 调用
- 缓存命中率 60%
- 平均每次调用 $0.01

**不用缓存**：100 × $0.01 = $1.00/天  
**用缓存**：40 × $0.01 = $0.40/天  
**节省**：$0.60/天 × 30 天 = $18/月

## 九、测试

### 1. 单元测试

```javascript
// backend/test/cache.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const llmCache = require('../src/cache/llmCache');

describe('LLM Cache', () => {
  it('should cache and retrieve response', async () => {
    const prompt = 'test prompt';
    const model = 'gpt-4o-mini';
    const response = { content: 'test response', usage: { totalTokens: 100 } };
    
    await llmCache.set(prompt, model, response);
    const cached = await llmCache.get(prompt, model);
    
    assert.strictEqual(cached.response.content, response.content);
  });
  
  it('should return null for cache miss', async () => {
    const cached = await llmCache.get('nonexistent', 'gpt-4o-mini');
    assert.strictEqual(cached, null);
  });
});
```

### 2. 压力测试

```javascript
// 测试缓存性能
async function benchmarkCache() {
  const iterations = 1000;
  const start = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    await llmCache.get(`prompt-${i % 10}`, 'gpt-4o-mini');
  }
  
  const duration = Date.now() - start;
  console.log(`${iterations} cache reads in ${duration}ms`);
  console.log(`Avg: ${(duration / iterations).toFixed(2)}ms per read`);
}
```

## 十、故障处理

### 1. Redis 不可用时的降级策略

```javascript
async function chat(messages, options) {
  try {
    // 尝试从缓存获取
    const cached = await llmCache.get(messages, model);
    if (cached) return cached;
  } catch (error) {
    logger.warn('Cache unavailable, proceeding without cache:', error);
  }
  
  // 直接调用 LLM
  return await this.provider.chat({ messages, ...options });
}
```

### 2. 连接池耗尽

```javascript
// ioredis 自动管理连接池，但可以配置：
const redis = new Redis({
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true
});
```

## 十一、下一步

完成 Redis 集成后，可以：
1. 实现 Bull 任务队列（基于 Redis）
2. 添加更多缓存策略（如 LRU、LFU）
3. 实现分布式锁（用于并发控制）
4. 添加 Redis Cluster 支持（水平扩展）

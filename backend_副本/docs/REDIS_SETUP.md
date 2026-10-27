# Redis 缓存集成 - 快速开始

## 🎯 目标

为 AI Growth Agent 添加 Redis 缓存层，实现：
- ✅ LLM 响应缓存（降低成本 40-60%）
- ✅ 数据查询缓存（提升性能）
- ✅ 速率限制（防止滥用）

---

## 📦 安装 Redis

### 方式 1: Docker（推荐）

```bash
# 启动 Redis
docker run -d \
  --name logearn-redis \
  -p 6379:6379 \
  redis:alpine

# 验证运行
docker ps | grep redis

# 查看日志
docker logs logearn-redis
```

### 方式 2: 本地安装

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis-server
```

**验证安装:**
```bash
redis-cli ping
# 应该返回: PONG
```

### 方式 3: 云托管（生产环境推荐）

**免费选项:**
- [Upstash](https://upstash.com) - 免费 10K 请求/天
- [Redis Cloud](https://redis.com/try-free/) - 免费 30MB

**配置环境变量:**
```bash
REDIS_URL=redis://default:password@your-host:6379
```

---

## ⚙️ 配置

### 1. 环境变量

复制 `.env.example` 到 `.env`，添加：

```bash
# Redis 连接
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_KEY_PREFIX=logearn:
REDIS_CONNECT_TIMEOUT=5000

# 缓存 TTL
CACHE_LLM_TTL=86400      # LLM 缓存 24 小时
CACHE_DATA_TTL=3600      # 数据缓存 1 小时

# 速率限制
AI_RATE_LIMIT_PER_HOUR=100
```

### 2. 依赖已安装

```bash
cd backend
npm install
# ioredis 已在 package.json 中
```

---

## 🚀 测试

### 1. 基础测试

```bash
cd backend

# 运行完整测试套件
node test/test-cache.js
```

**期望输出:**
```
=== 测试 Redis 连接 ===
✅ Redis 连接成功

=== 测试 LLM 缓存 ===
1. 第一次调用（无缓存）...
   耗时: 1500ms
   缓存: 未命中
2. 第二次调用（应该命中缓存）...
   耗时: 50ms
   缓存: ✅ 命中
   🚀 加速: 30.0x
   💰 节省: $0.000150

✅ 所有测试通过！
```

### 2. API 测试

启动服务器：
```bash
npm run dev
```

**测试缓存健康状态:**
```bash
curl http://localhost:3000/api/cache/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**测试 LLM 缓存统计:**
```bash
curl http://localhost:3000/api/cache/llm/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**运行性能基准测试:**
```bash
curl -X POST http://localhost:3000/api/cache/benchmark \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 验证效果

### 1. 查看缓存命中率

```bash
# 进入 Redis CLI
redis-cli

# 查看所有 key
127.0.0.1:6379> KEYS logearn:*

# 查看缓存统计
127.0.0.1:6379> GET logearn:llm:stats

# 查看内存使用
127.0.0.1:6379> INFO memory
```

### 2. 监控 LLM 成本

```bash
# 查看今日成本
curl http://localhost:3000/api/ai/usage/today \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**对比缓存前后:**
- 缓存前：每次查询 $0.0003
- 缓存后：命中缓存 $0（节省 100%）

---

## 🔧 集成到业务代码

### 示例 1: LLM 调用自动缓存

```javascript
const { createClient } = require('./ai/llm');

const client = createClient();

// 自动使用缓存
const response = await client.chat([
  { role: 'user', content: '分析活跃用户下降原因' }
]);

console.log('从缓存:', response.fromCache);
```

### 示例 2: 数据查询缓存

```javascript
const { dataCache } = require('./cache');

async function getActiveUsers(date) {
  // 1. 尝试从缓存读取
  const cached = await dataCache.get('active_users', date, 'all');
  if (cached) {
    return cached.data;
  }

  // 2. 缓存未命中，查询数据库
  const data = await db.query('SELECT ...');

  // 3. 写入缓存
  await dataCache.set('active_users', date, 'all', data);

  return data;
}
```

### 示例 3: 速率限制

```javascript
const { rateLimit } = require('./cache');

router.post('/api/ai/analysis', async (req, res) => {
  const userId = req.user.user_id;

  // 检查速率限制
  const check = await rateLimit.checkLimit(
    `analysis:${userId}`,
    10,  // 每小时 10 次
    3600
  );

  if (!check.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      resetIn: check.resetIn
    });
  }

  // 执行分析...
});
```

---

## 📈 性能指标

### 预期收益

| 指标 | 无缓存 | 有缓存 | 提升 |
|------|--------|--------|------|
| 响应时间 | 1500ms | 50ms | **30x** |
| LLM 成本 | $0.0003 | $0 | **100%** |
| 缓存命中率 | - | 40-60% | - |
| 月成本节省 | - | $60-120 | - |

### 监控指标

```javascript
// 缓存统计 API
GET /api/cache/llm/stats

{
  "entries": 245,
  "hits": 1520,
  "misses": 245,
  "hitRate": 0.861,
  "totalSavings": 0.456,
  "avgResponseTime": 45
}
```

---

## 🛠️ 故障排查

### 问题 1: Redis 连接失败

**症状:**
```
Redis connection error: connect ECONNREFUSED 127.0.0.1:6379
```

**解决:**
```bash
# 检查 Redis 是否运行
redis-cli ping

# 如果未运行
docker start logearn-redis
# 或
brew services start redis
```

### 问题 2: 缓存未命中

**检查:**
```javascript
// 查看缓存 key
const { redis } = require('./cache');
const keys = await redis.getClient().keys('logearn:llm:*');
console.log('缓存 keys:', keys);
```

### 问题 3: Redis 内存不足

**解决:**
```bash
# 进入 Redis CLI
redis-cli

# 设置最大内存和淘汰策略
127.0.0.1:6379> CONFIG SET maxmemory 256mb
127.0.0.1:6379> CONFIG SET maxmemory-policy allkeys-lru
```

---

## 🎯 下一步

✅ **完成 Phase 1: Redis 缓存**

现在可以继续：
- [ ] Phase 2: Bull 任务队列（见 `docs/ai/infrastructure/bull-queue.md`）
- [ ] Phase 3: WebSocket 实时推送
- [ ] Phase 4: RAG 向量数据库

---

## 📚 参考

- [ioredis 文档](https://github.com/redis/ioredis)
- [Redis 最佳实践](https://redis.io/topics/lru-cache)
- [缓存设计模式](https://docs.microsoft.com/en-us/azure/architecture/patterns/cache-aside)

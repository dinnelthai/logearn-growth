> 历史说明：本文的接口、完成标记和启动方式可能过时。当前实现与限制请以 [docs/ai/README.md](README.md) 为准。

# AI 业务分析系统部署指南

## 架构概览

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Frontend  │─────▶│   Backend   │─────▶│  PostgreSQL │
│   (React)   │      │   (Node.js) │      │   (AI表)    │
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                            ├─────▶ Redis (任务队列)
                            │
                            ├─────▶ Anthropic API (LLM)
                            │
                            └─────▶ SQLite (业务数据)
```

## 必需依赖

### 1. 数据库
- **PostgreSQL**: 存储 AI 分析记录、建议、复盘等
  - 版本: 12+
  - 需要写权限（不能只用只读副本）
- **SQLite**: 现有业务数据（无需修改）

### 2. 消息队列
- **Redis**: 任务队列（Bull）
  - 版本: 5+
  - 可选但强烈推荐（不用则任务在内存中，重启丢失）

### 3. AI 模型
- **Anthropic Claude API**
  - 需要 API Key
  - 推荐模型: claude-3-sonnet（平衡速度和成本）

## 部署步骤

### Step 1: 环境变量配置

在 `backend/.env` 中添加或确认以下配置:

```bash
# PostgreSQL 主库（AI 表写入）
PGHOST=your-postgres-host
PGPORT=5432
PGDATABASE=logearn
PGUSER=your-user
PGPASSWORD=your-password
PGSSL=true  # 如果使用云数据库

# PostgreSQL 只读副本（可选，用于读操作）
ENABLE_READ_REPLICA=true
PGHOST_REPLICA=your-replica-host
PGPORT_REPLICA=5432

# Redis（任务队列）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # 如果有密码
REDIS_DB=0

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-xxx

# 时区（重要：数据分析需要统一时区）
TZ=Asia/Bangkok

# 可选：成本控制
AI_MAX_COST_PER_ANALYSIS=0.10  # 单次分析最大成本（美元）
AI_MONTHLY_BUDGET=50.00  # 每月预算
```

### Step 2: 数据库迁移

**2.1 创建 AI 表**

```bash
cd backend
npm run migrate:ai
```

**预期输出：**
```
Starting AI tables migration...
✅ AI tables created successfully

📊 Created tables:
  - ai_analysis_records
  - ai_suggestions
  - ai_retrospectives
  - ai_usage_logs
  - ai_experience_index

👁️  Created views:
  - ai_analysis_summary

✅ Migration completed successfully
```

**2.2 验证表结构**

连接到 PostgreSQL 并运行:

```sql
-- 检查表是否创建成功
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'ai_%';

-- 检查索引
SELECT tablename, indexname FROM pg_indexes
WHERE tablename LIKE 'ai_%';
```

### Step 3: 启动服务

**3.1 启动后端 API**

```bash
cd backend
npm start
```

**3.2 启动 Worker（必需）**

Worker 负责处理后台任务（分析、复盘）。

```bash
cd backend
npm run worker:ai
```

**推荐使用 PM2 管理进程：**

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start src/index.js --name logearn-api
pm2 start src/queues/workers/aiAnalysisWorker.js --name ai-worker

# 查看日志
pm2 logs

# 设置开机自启
pm2 startup
pm2 save
```

**3.3 健康检查**

```bash
# API 健康检查
curl http://localhost:3001/health

# 队列统计
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/queue/stats/aiAnalysis
```

### Step 4: 验证部署

**4.1 运行集成测试**

```bash
cd backend

# 设置测试环境变量
export API_BASE_URL=http://localhost:3001
export TEST_USER_EMAIL=admin@logearn.com
export TEST_USER_PASSWORD=admin123

# 运行测试
node test/test-ai-analysis.js
```

**预期输出：**
- 登录成功
- 创建分析任务
- 任务状态更新（pending → active → completed）
- 返回建议列表
- 更新建议状态
- 获取成本统计

**4.2 手动测试**

使用 Postman 或 curl 测试关键接口:

```bash
# 1. 登录
TOKEN=$(curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@logearn.com","password":"admin123"}' \
  | jq -r '.token')

# 2. 创建分析
ANALYSIS=$(curl -X POST http://localhost:3001/api/ai-analysis/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "测试分析",
    "analysisType": "optimization",
    "dateRangeStart": 1696089600000,
    "dateRangeEnd": 1698681600000,
    "businessScope": {"source": "all"},
    "focusGoal": "activation"
  }')

echo $ANALYSIS | jq

# 3. 查询任务状态
JOB_ID=$(echo $ANALYSIS | jq -r '.jobId')
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/ai-analysis/jobs/$JOB_ID/status" | jq

# 4. 获取分析结果（任务完成后）
ANALYSIS_ID=$(echo $ANALYSIS | jq -r '.analysisId')
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/ai-analysis/$ANALYSIS_ID" | jq
```

## 监控和运维

### 1. 日志监控

**Worker 日志：**
```bash
pm2 logs ai-worker --lines 100
```

**关键日志：**
- `[BusinessAnalysis] Starting analysis`: 分析开始
- `[BusinessAnalysis] Completed`: 分析完成
- `[BusinessAnalysis] Failed`: 分析失败（查看错误栈）

### 2. 队列监控

**查看队列统计：**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/queue/stats/aiAnalysis | jq
```

**关键指标：**
- `waiting`: 等待执行的任务数
- `active`: 正在执行的任务数
- `failed`: 失败的任务数

**处理失败任务：**
```bash
# 查看失败任务
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/queue/aiAnalysis/jobs?state=failed&limit=10" | jq

# 清理失败任务（谨慎）
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/queue/aiAnalysis/clean?grace=0"
```

### 3. 成本监控

**查询成本统计：**
```sql
-- 每日成本
SELECT
  DATE(TO_TIMESTAMP(created_at / 1000)) as date,
  COUNT(*) as calls,
  SUM(cost_usd) as daily_cost,
  SUM(total_tokens) as tokens
FROM ai_usage_logs
GROUP BY DATE(TO_TIMESTAMP(created_at / 1000))
ORDER BY date DESC
LIMIT 30;

-- 用户成本排名
SELECT
  owner_id,
  COUNT(*) as analyses,
  SUM(cost_usd) as total_cost
FROM ai_usage_logs
WHERE created_at >= EXTRACT(EPOCH FROM NOW() - INTERVAL '30 days') * 1000
GROUP BY owner_id
ORDER BY total_cost DESC
LIMIT 10;

-- 缓存命中率
SELECT
  COUNT(*) as total_calls,
  SUM(CASE WHEN from_cache THEN 1 ELSE 0 END) as cache_hits,
  ROUND(SUM(CASE WHEN from_cache THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100, 2) as hit_rate
FROM ai_usage_logs;
```

### 4. 性能优化

**数据库索引：**
迁移脚本已创建必要索引，定期检查索引使用情况：

```sql
-- 检查未使用的索引
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'ai_%'
  AND idx_scan = 0;

-- 检查缺失的索引（慢查询）
SELECT * FROM pg_stat_statements
WHERE query LIKE '%ai_%'
ORDER BY total_time DESC
LIMIT 10;
```

**Worker 并发：**
在 `backend/src/queues/workers/aiAnalysisWorker.js` 中调整并发数：

```javascript
const CONCURRENCY = parseInt(process.env.AI_WORKER_CONCURRENCY || '5', 10);
```

推荐配置：
- 单机：3-5
- 多核：5-10
- 分布式：每台机器 3-5

### 5. 故障排查

**问题 1: 任务一直 pending**
- 检查 Worker 是否运行：`pm2 list`
- 检查 Redis 连接：`redis-cli ping`
- 查看 Worker 日志：`pm2 logs ai-worker`

**问题 2: 分析失败**
- 检查 Anthropic API Key 是否有效
- 检查 API 配额是否用尽
- 查看错误日志中的详细错误信息

**问题 3: 数据写入失败**
- 检查 PostgreSQL 连接（不能只连只读副本）
- 检查用户是否有写权限
- 查看数据库日志

**问题 4: 性能慢**
- 检查数据库查询性能（`EXPLAIN ANALYZE`）
- 检查 Redis 延迟
- 检查 Anthropic API 响应时间（通常 3-10 秒）

## 扩展性

### 水平扩展

**多 Worker 部署：**
```bash
# 机器 1
pm2 start src/queues/workers/aiAnalysisWorker.js --name ai-worker-1 -i 1

# 机器 2
pm2 start src/queues/workers/aiAnalysisWorker.js --name ai-worker-2 -i 1
```

所有 Worker 共享同一个 Redis 队列，自动负载均衡。

### 成本控制

**1. 设置单次分析成本上限**

在任务处理器中添加成本检查（已在 `businessAnalysis.js` 中预留位置）。

**2. 设置每日/月度预算**

在 API 层添加预算检查：

```javascript
router.post('/analyze', async (req, res) => {
  // 检查用户本月已用成本
  const stats = await getUserCostStats(userId, monthStart, monthEnd);
  if (stats.total_cost >= MONTHLY_BUDGET) {
    return res.status(429).json({ error: 'Monthly budget exceeded' });
  }
  // ...
});
```

## 回滚方案

如果部署出现问题，按以下步骤回滚：

**1. 停止新功能**
```bash
pm2 stop ai-worker
```

**2. 保留数据库表**
AI 表不影响现有业务，可以保留。

**3. 删除 API 路由**
注释掉 `src/index.js` 中的路由注册：

```javascript
// app.use('/api/ai-analysis', requireAuth, require('./routes/aiAnalysis'))
```

**4. 重启 API**
```bash
pm2 restart logearn-api
```

现有业务不受影响。

## 安全建议

1. **API Key 保护**
   - 不要在代码中硬编码 API Key
   - 使用环境变量或密钥管理服务
   - 定期轮换 API Key

2. **用户隔离**
   - 所有接口已实现用户隔离（通过 `owner_id`）
   - 定期审计访问日志

3. **成本预警**
   - 设置成本告警（如 Datadog、CloudWatch）
   - 异常成本立即通知

4. **敏感数据**
   - 分析结果中可能包含业务敏感信息
   - 确保数据库加密（at rest & in transit）
   - 限制日志中的敏感信息

## 联系支持

如遇问题，提供以下信息：
- 错误日志（`pm2 logs ai-worker --lines 100`）
- 队列状态（`/api/queue/stats/aiAnalysis`）
- 任务详情（`/api/ai-analysis/jobs/:jobId/status`）
- 数据库表结构验证（`\d ai_analysis_records`）

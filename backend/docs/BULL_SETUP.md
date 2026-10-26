# Bull 队列快速启动指南

## 概述

Bull 队列让 AI 分析任务在后台异步运行，不阻塞用户请求。支持：

- ✅ 异步任务处理
- ✅ 任务重试（失败自动重试）
- ✅ 定时任务（每日简报、每周分析）
- ✅ 任务优先级
- ✅ 进度追踪
- ✅ 任务监控

---

## 前置条件

### 1. Redis 必须运行

Bull 依赖 Redis 存储任务队列。

```bash
# Docker（推荐）
docker run -d -p 6379:6379 --name logearn-redis redis:alpine

# 或本地安装
brew install redis
brew services start redis

# 测试连接
redis-cli ping
# 应返回: PONG
```

### 2. 配置环境变量

```bash
# backend/.env
REDIS_URL=redis://localhost:6379

# Worker 并发数（同时处理几个任务）
AI_WORKER_CONCURRENCY=5

# 时区（用于定时任务）
TZ=Asia/Shanghai
```

---

## 启动方式

### 方式 1: 分别启动（推荐生产环境）

**终端 1：启动 API 服务器**
```bash
cd backend
npm run dev
```

**终端 2：启动 AI Worker**
```bash
cd backend
npm run worker:ai
```

**终端 3：启动定时任务调度器**
```bash
cd backend
npm run scheduler
```

### 方式 2: 一键启动（开发环境）

需要先安装 `concurrently`:

```bash
npm install --save-dev concurrently
```

然后：

```bash
npm run queue:dev
```

这会同时启动：
- API 服务器（`:3000`）
- AI Worker
- 定时调度器

---

## 测试队列

### 1. 运行测试脚本

```bash
# 确保 Redis 和 Worker 都在运行
npm run test:queue
```

应看到：

```
Testing Bull Queues...

1. Creating anomaly detection job...
✅ Job created: 1

2. Creating daily report job...
✅ Job created: 2

3. Checking job status...
✅ Job status retrieved

4. Getting queue stats...
✅ Queue stats retrieved

5. Waiting for jobs to complete...
✅ All jobs completed after 3 seconds

✅ All tests passed!
```

### 2. 使用 API 创建任务

```bash
# 创建异常检测任务
curl -X POST http://localhost:3000/api/queue/ai-analysis \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "type": "anomaly-detection",
    "data": {
      "date": "2026-10-25",
      "metrics": ["active_users", "new_signups"]
    },
    "priority": 1
  }'

# 返回:
{
  "jobId": "123",
  "type": "anomaly-detection",
  "status": "queued",
  "message": "AI analysis job created successfully"
}
```

### 3. 查询任务状态

```bash
curl http://localhost:3000/api/queue/jobs/aiAnalysis/123 \
  -H "Authorization: Bearer YOUR_TOKEN"

# 返回:
{
  "exists": true,
  "id": "123",
  "name": "anomaly-detection",
  "state": "completed",
  "progress": 100,
  "attempts": 1,
  "returnvalue": {
    "date": "2026-10-25",
    "anomalyCount": 2,
    "anomalies": [...]
  }
}
```

### 4. 查看队列统计

```bash
curl http://localhost:3000/api/queue/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

# 返回:
{
  "queues": [
    {
      "name": "aiAnalysis",
      "waiting": 0,
      "active": 1,
      "completed": 45,
      "failed": 2,
      "delayed": 0,
      "total": 48
    },
    ...
  ]
}
```

---

## 任务类型

### 1. 异常检测 (`anomaly-detection`)

检测指标异常并用 AI 分析原因。

```javascript
{
  "type": "anomaly-detection",
  "data": {
    "date": "2026-10-25",
    "metrics": ["active_users", "new_signups", "engagement_rate"]
  }
}
```

### 2. 维度分析 (`dimension-analysis`)

对异常进行多维度拆解。

```javascript
{
  "type": "dimension-analysis",
  "data": {
    "anomaly": {
      "metric": "active_users",
      "change": -15,
      "date": "2026-10-25"
    },
    "dimensions": ["channel", "device", "region"]
  }
}
```

### 3. 每日简报 (`daily-report`)

生成每日增长数据简报。

```javascript
{
  "type": "daily-report",
  "data": {
    "date": "2026-10-25"
  }
}
```

### 4. 假设验证 (`hypothesis-validation`)

验证增长假设。

```javascript
{
  "type": "hypothesis-validation",
  "data": {
    "hypothesis": "Twitter 渠道的转化率比 Facebook 高 20%",
    "data": {
      "twitter_cvr": 0.12,
      "facebook_cvr": 0.10
    }
  }
}
```

---

## 定时任务

调度器会自动运行以下任务：

| 任务 | 时间 | 描述 |
|------|------|------|
| **每日异常检测** | 每天 9:00 AM | 检测前一天的指标异常 |
| **每日简报** | 每天 8:00 AM | 生成前一天的数据简报 |
| **每周趋势** | 每周一 10:00 AM | 分析过去一周的趋势 |

修改定时任务：编辑 `src/queues/scheduler.js`

---

## 架构图

```
┌─────────────┐
│   用户请求   │
└──────┬──────┘
       │
       ↓
┌─────────────────────┐
│   Express API       │  创建任务
│  POST /api/queue    │────┐
└─────────────────────┘    │
                           ↓
                    ┌──────────────┐
                    │     Bull     │
                    │  任务队列     │  (Redis)
                    └──────┬───────┘
                           │
                           ↓
                    ┌──────────────┐
                    │  AI Worker   │  处理任务
                    │  (5 并发)    │
                    └──────┬───────┘
                           │
                           ↓
                    ┌──────────────┐
                    │  LLM Client  │  调用 AI
                    │ (with cache) │
                    └──────────────┘
```

---

## 监控和管理

### 查看所有队列状态

```bash
curl http://localhost:3000/api/queue/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 查看失败的任务

```bash
curl "http://localhost:3000/api/queue/aiAnalysis/jobs?state=failed&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 暂停队列

```bash
curl -X POST http://localhost:3000/api/queue/aiAnalysis/pause \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 恢复队列

```bash
curl -X POST http://localhost:3000/api/queue/aiAnalysis/resume \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 清理已完成的任务

```bash
curl -X DELETE "http://localhost:3000/api/queue/aiAnalysis/clean?grace=3600" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 生产部署

### 使用 PM2 管理进程

```bash
# 安装 PM2
npm install -g pm2

# 启动 API 服务器
pm2 start src/index.js --name logearn-api

# 启动 AI Worker
pm2 start src/queues/workers/aiAnalysisWorker.js --name ai-worker

# 启动调度器
pm2 start src/queues/scheduler.js --name scheduler

# 查看状态
pm2 status

# 查看日志
pm2 logs ai-worker

# 保存配置
pm2 save
pm2 startup
```

### 使用 ecosystem.config.js

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'logearn-api',
      script: 'src/index.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'ai-worker',
      script: 'src/queues/workers/aiAnalysisWorker.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        AI_WORKER_CONCURRENCY: 5
      }
    },
    {
      name: 'scheduler',
      script: 'src/queues/scheduler.js',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Shanghai'
      }
    }
  ]
};
```

启动：

```bash
pm2 start ecosystem.config.js
```

---

## 故障排查

### Redis 连接失败

```bash
# 检查 Redis 是否运行
redis-cli ping

# 检查 Redis 连接配置
echo $REDIS_URL

# 查看 Redis 日志
docker logs logearn-redis
```

### Worker 不处理任务

```bash
# 检查 Worker 是否运行
ps aux | grep aiAnalysisWorker

# 查看 Worker 日志
# 如果用 PM2:
pm2 logs ai-worker

# 检查队列统计
curl http://localhost:3000/api/queue/stats/aiAnalysis
```

### 任务一直在 waiting 状态

可能原因：
1. Worker 没运行 → 启动 Worker
2. Redis 连接问题 → 检查 Redis
3. Worker 崩溃 → 查看日志

### LLM API 调用失败

```bash
# 检查 API Key
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY

# 测试 LLM
npm run test:llm

# 查看失败的任务
curl "http://localhost:3000/api/queue/aiAnalysis/jobs?state=failed&limit=5"
```

---

## 性能优化

### 调整 Worker 并发

根据你的 LLM API 限流和服务器性能调整：

```bash
# .env
AI_WORKER_CONCURRENCY=5  # 同时处理 5 个任务
```

建议：
- **小规模**（< 100 任务/天）：1-2 并发
- **中等规模**（100-1000 任务/天）：3-5 并发
- **大规模**（> 1000 任务/天）：5-10 并发

### 调整任务重试

编辑 `src/queues/queues.js`:

```javascript
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,           // 重试 3 次
  backoff: {
    type: 'exponential',
    delay: 2000          // 初始延迟 2 秒
  }
};
```

### Redis 内存优化

```bash
# 设置 Redis maxmemory
redis-cli CONFIG SET maxmemory 512mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

---

## 下一步

- [ ] 测试队列：`npm run test:queue`
- [ ] 创建第一个异常检测任务
- [ ] 配置定时任务时间
- [ ] 部署 Worker 到生产环境
- [ ] 添加任务监控告警

---

## 支持

**问题？**

1. 查看日志：`pm2 logs` 或 `docker logs`
2. 检查 Redis：`redis-cli ping`
3. 测试队列：`npm run test:queue`
4. 查看队列统计：`GET /api/queue/stats`

**下一步：Phase 3 - WebSocket 实时推送**

让用户实时看到任务进度！

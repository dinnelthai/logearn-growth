# 🚀 AI 数据对接 - 快速开始

## 1️⃣ 启动服务 (5 分钟)

```bash
cd backend

# 1. 确保 Redis 运行
docker ps | grep redis
# 如果没运行：
# docker run -d -p 6379:6379 --name logearn-redis redis:alpine

# 2. 确保环境变量配置
cat .env | grep -E "(REDIS|OPENAI|ANTHROPIC|DATABASE)"

# 3. 启动 API 服务器
npm run dev

# 4. 新开终端，启动 AI Worker
npm run worker:ai

# 5. 新开终端，启动调度器（可选，用于定时任务）
npm run scheduler
```

---

## 2️⃣ 测试数据对接 (2 分钟)

```bash
# 运行完整测试
npm run test:ai-data

# 预期输出：
# Total: 3
# Passed: 3 ✓
# Failed: 0
# Success Rate: 100.0%
```

---

## 3️⃣ 手动触发任务 (1 分钟)

### 异常检测

```bash
curl -X POST http://localhost:3000/api/queue/ai-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "type": "anomaly-detection",
    "data": {
      "date": "2026-10-25",
      "metrics": ["active_users", "new_users"],
      "threshold": 15
    }
  }'

# 返回 jobId，例如：
# { "jobId": "1", "type": "anomaly-detection", "status": "queued" }
```

### 查询结果

```bash
# 查询任务状态
curl http://localhost:3000/api/queue/jobs/aiAnalysis/1

# 返回：
# {
#   "date": "2026-10-25",
#   "anomalyCount": 1,
#   "anomalies": [
#     {
#       "metric": "active_users",
#       "current": 1245,
#       "previous": 1112,
#       "change": 11.96,
#       "aiAnalysis": "..."
#     }
#   ]
# }
```

---

## 4️⃣ 配置定时任务 (3 分钟)

编辑 `backend/src/queues/scheduler.js`：

```javascript
// 每天早上 8:00 生成每日简报
cron.schedule('0 8 * * *', async () => {
  const yesterday = Date.now() - 86400000;
  await addAIAnalysisJob('daily-report', {
    date: yesterday,
    source: 'all'
  });
  logger.info('Daily report job scheduled');
}, {
  timezone: 'Asia/Shanghai'
});

// 每天早上 9:00 运行异常检测
cron.schedule('0 9 * * *', async () => {
  const yesterday = Date.now() - 86400000;
  await addAIAnalysisJob('anomaly-detection', {
    date: yesterday,
    metrics: ['active_users', 'new_users', 'returning_users'],
    threshold: 15
  });
  logger.info('Anomaly detection job scheduled');
}, {
  timezone: 'Asia/Shanghai'
});
```

重启调度器：
```bash
pm2 restart scheduler
```

---

## 5️⃣ 验证数据正确性 (5 分钟)

### 方法 1: 查看任务结果

```bash
# 获取队列统计
curl http://localhost:3000/api/queue/stats

# 返回：
# {
#   "queues": [
#     {
#       "name": "aiAnalysis",
#       "waiting": 0,
#       "active": 1,
#       "completed": 5,
#       "failed": 0
#     }
#   ]
# }
```

### 方法 2: 检查 Worker 日志

```bash
# 如果用 pm2
pm2 logs ai-worker

# 或直接查看终端输出
# 应该看到：
# [INFO] Starting anomaly detection for 2026-10-25
# [INFO] Detected 1 anomalies
# [INFO] AI analysis completed for active_users
```

### 方法 3: 对比数据源

```bash
# 手动查询数据库验证
psql -d your_database -c "
  SELECT date, COUNT(DISTINCT user_key) as active_users
  FROM growth_events
  WHERE date = '2026-10-25'
  GROUP BY date;
"

# 对比 AI 任务返回的数据是否一致
```

---

## 📊 常见场景

### 场景 1: 每天自动收到简报

```bash
# 1. 启动调度器
npm run scheduler

# 2. 等待每天早上 8:00 自动运行

# 3. 查询最近的简报
curl http://localhost:3000/api/queue/aiAnalysis/jobs \
  | jq '.jobs[] | select(.name == "daily-report") | .returnvalue'
```

### 场景 2: 手动分析某天的异常

```bash
# 分析 10 月 20 日的数据
curl -X POST http://localhost:3000/api/queue/ai-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "type": "anomaly-detection",
    "data": {
      "date": "2026-10-20",
      "metrics": ["active_users", "new_users", "returning_users"],
      "threshold": 10,
      "source": "all"
    }
  }'

# 等待 10-30 秒

# 查询结果
curl http://localhost:3000/api/queue/jobs/aiAnalysis/{jobId}
```

### 场景 3: 验证某个增长假设

```bash
# 验证：改善落地页是否提升了转化率
curl -X POST http://localhost:3000/api/queue/ai-analysis \
  -H "Content-Type: application/json" \
  -d '{
    "type": "hypothesis-validation",
    "data": {
      "hypothesis": "改善落地页加载速度会提升新用户转化率",
      "dateRange": {
        "start": "2026-10-18",
        "end": "2026-10-25"
      },
      "metrics": ["active_users", "new_users"],
      "source": "all"
    }
  }'
```

---

## 🔧 故障排查

### 问题 1: 任务一直 pending

```bash
# 检查 Worker 是否运行
ps aux | grep aiAnalysisWorker

# 如果没运行：
npm run worker:ai
```

### 问题 2: 数据为空或错误

```bash
# 1. 检查数据库连接
npm run test:llm

# 2. 手动查询数据
curl http://localhost:3000/api/metrics/north-star?start=1729814400000&end=1729900800000

# 3. 检查 Hologres/PostgreSQL 状态
npm run start:remote
```

### 问题 3: AI 分析失败

```bash
# 检查 LLM API 配置
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY

# 测试 LLM 连接
npm run test:llm

# 查看详细错误
pm2 logs ai-worker --lines 50
```

### 问题 4: 缓存未命中

```bash
# 检查 Redis 连接
redis-cli ping

# 查看缓存统计
curl http://localhost:3000/api/cache/stats

# 清空缓存（如需重新测试）
redis-cli FLUSHDB
```

---

## 📈 监控和优化

### 查看队列性能

```bash
# 实时监控队列
watch -n 2 'curl -s http://localhost:3000/api/queue/stats | jq'

# 查看任务列表
curl http://localhost:3000/api/queue/aiAnalysis/jobs | jq '.jobs[] | {id, name, state, progress}'
```

### LLM 成本追踪

```bash
# 查看今日 LLM 使用
curl http://localhost:3000/api/ai/usage/today

# 返回：
# {
#   "date": "2026-10-26",
#   "totalCalls": 45,
#   "totalCost": 2.34,
#   "cacheHitRate": 0.52,
#   "costSaved": 1.87
# }
```

### 缓存优化

```javascript
// 调整缓存 TTL
// backend/src/ai/llm/client.js

// LLM 响应缓存（默认 24 小时）
await llmCache.set(messages, this.model, response, {
  ttl: 86400, // 可以调整
  metadata: options.metadata
});
```

---

## ✅ 验收清单

在生产环境部署前，确保：

- [ ] Redis 正常运行并可连接
- [ ] Worker 正常启动（`npm run worker:ai`）
- [ ] 调度器配置正确（`npm run scheduler`）
- [ ] 数据查询正常（`npm run test:ai-data` 全部通过）
- [ ] LLM API 配置正确（有 API Key）
- [ ] 缓存正常工作（查看 `/api/cache/stats`）
- [ ] 日志输出正常（`pm2 logs` 可查看）
- [ ] 任务可以成功完成（手动触发并验证）
- [ ] 定时任务按时运行（查看 scheduler 日志）

---

## 🎉 完成！

现在你的 AI 分析系统已经完全对接真实业务数据，可以：

✅ 每天自动生成简报  
✅ 自动检测指标异常  
✅ AI 分析原因和建议  
✅ 验证增长假设  
✅ 维度拆解分析  

**下一步**: 
- [前端集成](./FRONTEND_INTEGRATION.md)
- [Phase 4: RAG 向量检索](./infrastructure/rag-vector-db.md)
- [生产部署指南](./PRODUCTION_DEPLOYMENT.md)

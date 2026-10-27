# AI 业务分析系统 - 快速参考

## 一句话总结
用户主动触发的业务分析与复盘系统，基于真实数据提供建议，记录行动并评估效果，下次分析使用历史经验。

## 核心流程
```
选择范围 → 触发分析 → 查看建议 → 记录行动 → 主动复盘 → 历史学习
```

## 快速启动

### 1. 部署 (3 分钟)
```bash
# 配置环境变量
export PGHOST=your-postgres-host
export ANTHROPIC_API_KEY=sk-ant-xxx
export REDIS_HOST=localhost

# 数据库迁移
cd backend
npm run migrate:ai

# 启动服务
npm start &              # API (端口 3001)
npm run worker:ai &      # Worker

# 验证
curl http://localhost:3001/health
```

### 2. 测试 (2 分钟)
```bash
# 运行集成测试
node test/test-ai-analysis.js

# 预期：创建分析 → 轮询状态 → 获取建议 → 更新状态 → 成本统计
```

### 3. 集成 (示例代码)
```javascript
// 前端：创建分析
const { analysisId, jobId } = await fetch('/api/ai-analysis/analyze', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: "十月激活分析",
    dateRangeStart: Date.now() - 30 * 86400000,
    dateRangeEnd: Date.now(),
    businessScope: { source: "all" },
    focusGoal: "activation"
  })
}).then(r => r.json());

// 轮询状态
while (true) {
  const status = await fetch(`/api/ai-analysis/jobs/${jobId}/status`, {
    headers: { 'Authorization': `Bearer ${token}` }
  }).then(r => r.json());

  if (status.state === 'completed') break;
  await new Promise(r => setTimeout(r, 2000));
}

// 获取结果
const analysis = await fetch(`/api/ai-analysis/${analysisId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());

console.log(`建议数量: ${analysis.suggestions.length}`);
```

## 关键 API

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/ai-analysis/analyze` | POST | 创建分析 |
| `/api/ai-analysis/jobs/:jobId/status` | GET | 查询任务状态 |
| `/api/ai-analysis/:id` | GET | 获取分析详情 |
| `/api/ai-analysis/list` | GET | 分析列表 |
| `/api/ai-analysis/suggestions/:id/status` | PUT | 更新建议状态 |
| `/api/ai-analysis/suggestions/:id/retrospective` | POST | 触发复盘 |
| `/api/ai-analysis/retrospectives/list` | GET | 复盘列表 |
| `/api/ai-analysis/cost-stats` | GET | 成本统计 |

## 数据库表

| 表名 | 用途 |
|------|------|
| `ai_analysis_records` | 分析记录（范围、结果、成本） |
| `ai_suggestions` | 建议（问题、证据、行动、状态） |
| `ai_retrospectives` | 复盘（基线、效果、结论） |
| `ai_usage_logs` | 成本追踪（token、费用） |
| `ai_experience_index` | 历史经验（有效性） |

## 常用命令

```bash
# 查看 Worker 日志
pm2 logs ai-worker

# 查看队列统计
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/queue/stats/aiAnalysis

# 查看失败任务
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/queue/aiAnalysis/jobs?state=failed"

# 清理队列（谨慎）
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/queue/aiAnalysis/clean"

# 数据库查询：每日成本
psql -c "
SELECT DATE(TO_TIMESTAMP(created_at / 1000)) as date,
       COUNT(*) as calls,
       SUM(cost_usd) as cost
FROM ai_usage_logs
GROUP BY 1 ORDER BY 1 DESC LIMIT 7;
"

# 数据库查询：用户分析次数
psql -c "
SELECT owner_id, COUNT(*) as analyses,
       SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed
FROM ai_analysis_records
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
"
```

## 故障排查

| 症状 | 可能原因 | 解决方案 |
|------|---------|----------|
| 任务一直 pending | Worker 未运行 | `pm2 start src/queues/workers/aiAnalysisWorker.js` |
| 分析失败 | API Key 无效 | 检查 `ANTHROPIC_API_KEY` |
| 数据写入失败 | PostgreSQL 只读 | 确保连接到主库（写权限） |
| 性能慢 | 数据量大 | 检查索引、缩短时间范围 |
| 成本高 | 频繁分析 | 设置预算上限、用户限流 |

## 成本参考

| 操作 | 成本 | Token | 耗时 |
|------|------|-------|------|
| 单次分析 | $0.03-0.10 | 4k-7k | 5-15s |
| 单次复盘 | $0.02-0.05 | 2.5k-4k | 3-8s |
| 月度预估 (100 用户) | ~$200 | 3M | - |

## 限制

- ❌ 不自动运行（无每日简报、定时巡检）
- ❌ 不自动执行运营动作
- ✅ 复盘需要执行后至少 3 天观察期
- ✅ Worker 默认并发 5（可调整）
- ✅ 数据截止到昨天（非实时）

## 核心文件

```
backend/
├── src/
│   ├── db/
│   │   ├── migrations/001_ai_tables.sql      # 数据库表结构
│   │   ├── migrateAI.js                      # 迁移脚本
│   │   └── aiRecords.js                      # 数据访问层
│   ├── queues/
│   │   ├── jobs/
│   │   │   ├── businessAnalysis.js           # 分析任务处理器
│   │   │   └── retrospective.js              # 复盘任务处理器
│   │   └── workers/
│   │       └── aiAnalysisWorker.js           # Worker 进程
│   └── routes/
│       └── aiAnalysis.js                     # API 路由
├── test/
│   └── test-ai-analysis.js                   # 集成测试
└── docs/
    └── ai/
        ├── README.md                         # 系统文档
        ├── API_GUIDE.md                      # API 文档
        ├── DEPLOYMENT_GUIDE.md               # 部署指南
        └── IMPROVEMENT_NOTE.md               # 设计说明
```

## 后续扩展

- [ ] 深入调查（按需查询更多维度）
- [ ] 向量检索历史经验
- [ ] 成本预算控制
- [ ] 实时进度推送（WebSocket）
- [ ] 分析报告导出

## 获取帮助

- 📖 完整文档: `docs/ai/README.md`
- 🚀 API 文档: `docs/ai/API_GUIDE.md`
- 🔧 部署指南: `docs/ai/DEPLOYMENT_GUIDE.md`
- 🧪 测试脚本: `backend/test/test-ai-analysis.js`

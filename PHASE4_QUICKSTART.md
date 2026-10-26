# Phase 4: RAG 向量检索 - 快速开始 🚀

## 概述

Phase 4 为 AI Growth Agent 添加了**记忆和学习能力**:
- ✅ 记住历史异常和解决方案
- ✅ 检索相似的分析案例
- ✅ 学习人工标注的反馈
- ✅ 避免重复分析,降低成本

---

## 🚀 5 分钟快速开始

### 1. 安装依赖 (30 秒)

```bash
cd backend
npm install @qdrant/js-client-rest
```

### 2. 启动 Qdrant (1 分钟)

```bash
# Docker (推荐)
docker run -d -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  --name logearn-qdrant \
  qdrant/qdrant

# 验证 Qdrant
curl http://localhost:6333/
# 返回: {"title":"qdrant - vector search engine",...}
```

### 3. 配置环境变量 (30 秒)

```bash
# 编辑 .env,添加 RAG 配置
nano .env
```

```bash
# RAG 向量检索配置
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=logearn_knowledge
```

### 4. 初始化 RAG 系统 (1 分钟)

```bash
# 方式 A: CLI 工具
node src/ai/rag/cli.js init

# 方式 B: API (服务需已启动)
curl http://localhost:3000/api/rag/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. 索引知识库 (2 分钟)

```bash
# 索引历史分析 (最近 1000 条)
node src/ai/rag/cli.js index findings

# 索引人工标注 (最近 500 条)
node src/ai/rag/cli.js index annotations

# 或一键索引所有
node src/ai/rag/cli.js index all
```

### 6. 测试检索 (30 秒)

```bash
# CLI 搜索
node src/ai/rag/cli.js search "用户留存率下降"

# 运行测试套件
npm run test:rag
```

**完成! Phase 4 已就绪! ✅**

---

## 📊 验证安装

### 测试 1: 健康检查

```bash
curl http://localhost:3000/api/rag/health
```

期望输出:
```json
{
  "ok": true,
  "initialized": true,
  "healthy": true,
  "pointsCount": 1234
}
```

### 测试 2: 搜索测试

```bash
curl -X POST http://localhost:3000/api/rag/search/findings \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "用户活跃度下降",
    "limit": 3
  }'
```

### 测试 3: 运行测试套件

```bash
npm run test:rag
```

应该看到:
```
✓ embeddings
✓ vectordb
✓ indexer
✓ retriever
✓ system

Passed: 5/5
```

---

## 🎯 使用场景

### 场景 1: 历史经验查询

```bash
# 查询类似问题的解决方案
node src/ai/rag/cli.js search "用户留存率下降 20%"
```

**返回:**
```
=== Search Results ===

Findings:
  1. [2026-09-15] retention_rate
     变化: -18%
     相似度: 92.1%
     结论: 新手引导流程过长导致流失

  2. [2026-08-20] day7_retention
     变化: -22%
     相似度: 88.7%
     结论: Push 通知权限请求时机不当
```

### 场景 2: API 检索集成

```javascript
// backend/src/ai/analysis/anomalyDetection.js

const { KnowledgeRetriever } = require('../rag');

async function analyzeAnomaly(metric, date, changePercent) {
  // 1. 检索历史相似案例
  const retriever = new KnowledgeRetriever();
  const context = await retriever.retrieveContext(
    `${metric} 在 ${date} 下降 ${changePercent}%`,
    { maxFindings: 3, maxAnnotations: 2 }
  );

  // 2. 构建 LLM prompt context
  const promptContext = retriever.buildPromptContext(context);

  // 3. 基于历史经验进行分析
  const llmClient = createClient();
  const analysis = await llmClient.chat([
    {
      role: 'system',
      content: `你是增长分析专家。参考以下历史经验:\n\n${promptContext}`
    },
    {
      role: 'user',
      content: `分析: ${metric} 在 ${date} 下降了 ${changePercent}%`
    }
  ]);

  return {
    analysis: analysis.content,
    historicalContext: context,
    usedRAG: context.totalResults > 0
  };
}
```

### 场景 3: 避免重复分析

```javascript
async function shouldAnalyze(metric, date, changePercent) {
  const retriever = new KnowledgeRetriever();
  
  // 检查是否有非常相似的历史分析
  const similar = await retriever.retrieveSimilarFindings(
    `${metric} ${date} ${changePercent}%`,
    { limit: 1, scoreThreshold: 0.95 }
  );

  if (similar.length > 0 && similar[0].score > 0.95) {
    // 直接使用历史结论,节省 LLM 成本
    return {
      shouldAnalyze: false,
      reason: 'Highly similar analysis exists',
      existingAnalysis: similar[0],
      similarity: similar[0].score
    };
  }

  return { shouldAnalyze: true };
}
```

---

## 🛠️ CLI 工具

### 初始化

```bash
node src/ai/rag/cli.js init
```

### 索引

```bash
# 索引 findings (默认 1000 条)
node src/ai/rag/cli.js index findings

# 指定数量
node src/ai/rag/cli.js index findings 500

# 索引 annotations
node src/ai/rag/cli.js index annotations

# 索引所有
node src/ai/rag/cli.js index all
```

### 搜索

```bash
# 基本搜索
node src/ai/rag/cli.js search "用户留存率下降"

# 多词查询
node src/ai/rag/cli.js search "新用户 7日留存 下降"
```

### 统计

```bash
node src/ai/rag/cli.js stats
```

**输出:**
```
=== RAG System Statistics ===

Initialized: Yes
Healthy: Yes
Points Count: 1234
Vectors Count: 1234
Status: green
```

### 帮助

```bash
node src/ai/rag/cli.js help
```

---

## 🌐 API 端点

### 健康检查

```bash
GET /api/rag/health
```

### 统计信息

```bash
GET /api/rag/stats
Authorization: Bearer YOUR_TOKEN
```

### 索引 Findings

```bash
POST /api/rag/index/findings
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "limit": 1000
}
```

### 搜索 Findings

```bash
POST /api/rag/search/findings
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "query": "用户留存率下降",
  "limit": 5,
  "metric": "retention_rate",
  "scoreThreshold": 0.7
}
```

### 聚合检索

```bash
POST /api/rag/retrieve
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "query": "新用户留存率下降",
  "maxFindings": 3,
  "maxAnnotations": 2,
  "maxDocuments": 2
}
```

### 构建 Prompt Context

```bash
POST /api/rag/prompt-context
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "query": "用户活跃度异常"
}
```

**返回:**
```json
{
  "query": "用户活跃度异常",
  "context": "## 相关历史分析\n\n1. [2026-10-15] active_users\n   变化: -15.2%\n   结论: 推送通知失效导致\n   相似度: 89.3%\n\n...",
  "totalResults": 5
}
```

---

## 💰 成本估算

### Embedding 成本

| 操作 | 数量 | Token | 成本 |
|------|------|-------|------|
| 索引 1000 条 findings | 1000 | ~200K | ~$0.004 |
| 索引 500 条 annotations | 500 | ~100K | ~$0.002 |
| 单次检索 | 1 | ~200 | ~$0.000004 |

**月度成本估算:**
- 初始索引 (一次性): $0.01
- 增量索引 (每日 100 条): $0.12/月
- 检索 (1000 次/天): $0.12/月
- **总计: ~$0.25/月**

### 向量数据库成本

**Qdrant (自建):**
- 本地/自建: $0
- 云服务器 (1 CPU, 2GB RAM): ~$10/月

**Pinecone (云托管):**
- Starter: $0 (100K 向量)
- Standard: $70/月 (500万 向量)

**推荐:** 自建 Qdrant (~$10/月)

---

## 🚀 生产部署

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./qdrant_storage:/qdrant/storage
    restart: unless-stopped

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    restart: unless-stopped

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      - QDRANT_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - qdrant
      - redis
    restart: unless-stopped
```

```bash
docker-compose up -d
```

### 定时索引 (Cron)

```javascript
// backend/src/queues/scheduler.js

const { KnowledgeIndexer } = require('../ai/rag');
const cron = require('node-cron');

// 每天凌晨 2:00 重新索引
cron.schedule('0 2 * * *', async () => {
  try {
    logger.info('Starting scheduled RAG re-index...');
    const indexer = new KnowledgeIndexer();
    await indexer.reindexAll();
    logger.info('RAG re-index complete');
  } catch (error) {
    logger.error('RAG re-index failed:', error);
  }
});
```

---

## 🐛 故障排查

### Q1: Qdrant 连接失败

```bash
Error: connect ECONNREFUSED 127.0.0.1:6333
```

**解决:**
```bash
# 检查 Qdrant
curl http://localhost:6333/

# 启动 Qdrant
docker start logearn-qdrant

# 或重新运行
docker run -d -p 6333:6333 qdrant/qdrant
```

### Q2: OpenAI API 错误

```bash
Error: Invalid API key
```

**解决:**
```bash
# 检查环境变量
echo $OPENAI_API_KEY

# 或在 .env 中设置
OPENAI_API_KEY=sk-your-real-key-here
```

### Q3: 索引失败 (表不存在)

```bash
Error: relation "ai_findings" does not exist
```

**解决:**
```bash
# 运行数据库迁移
npm run migrate

# 或创建测试数据
node src/ai/rag/cli.js index documents
```

### Q4: 搜索结果为空

**可能原因:**
1. 知识库未索引
2. 相似度阈值过高

**解决:**
```bash
# 检查统计
node src/ai/rag/cli.js stats

# 重新索引
node src/ai/rag/cli.js index all

# 降低阈值
{
  "scoreThreshold": 0.5  // 默认 0.7
}
```

---

## 📚 相关文档

- [Phase 4 完成总结](./docs/ai/PHASE4_COMPLETE.md)
- [RAG 基础设施设计](./docs/ai/infrastructure/rag-vector-db.md)
- [AI Growth Agent 总览](./docs/ai/README.md)
- [快速开始指南](./AI_GROWTH_AGENT_QUICKSTART.md)

---

## 🎉 完成!

你现在拥有完整的 RAG 向量检索系统:

✅ **历史经验学习**
- 自动索引历史分析结果
- 人工标注反馈学习

✅ **智能检索**
- 向量相似度搜索
- 混合搜索 (向量 + 过滤)

✅ **成本优化**
- 避免重复分析
- 智能推荐解决方案

✅ **生产就绪**
- 完整的 API 和 CLI
- 测试套件
- Docker 部署

---

**开始使用 Phase 4! 🚀**

```bash
# 初始化
node src/ai/rag/cli.js init

# 索引
node src/ai/rag/cli.js index all

# 搜索
node src/ai/rag/cli.js search "你的查询"
```

**Phase 4 (RAG 向量检索) 完成!** ✅

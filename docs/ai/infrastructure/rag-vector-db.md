# RAG 向量检索实施文档

## 一、概述

RAG (Retrieval-Augmented Generation) 让 AI 能够检索和利用历史知识：
- ✅ 记住历史异常和解决方案
- ✅ 检索相似的分析案例
- ✅ 学习人工标注的反馈
- ✅ 避免重复犯错

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Growth Agent                            │
│  遇到新问题 → 检索相关历史 → 基于经验回答                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   RAG 检索层                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Embedding API                                        │  │
│  │  文本 → 向量 (OpenAI / Cohere / Local)               │  │
│  └──────────────────────────────────────────────────────┘  │
│                     ↓                    ↑                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Vector Database (Qdrant / Pinecone)                 │  │
│  │  存储向量 · 相似度搜索 · 过滤 · 排序                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│                    知识源                                     │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │ 历史分析结果 │ 人工标注     │ 产品文档     │             │
│  │ (ai_findings)│ (annotations)│ (changelog)  │             │
│  └──────────────┴──────────────┴──────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

## 三、技术选型

### 1. 向量数据库对比

| 特性 | Qdrant | Pinecone | Weaviate | Milvus |
|------|--------|----------|----------|--------|
| 开源 | ✅ | ❌ | ✅ | ✅ |
| 部署 | 自建/云 | 云托管 | 自建/云 | 自建 |
| 性能 | 优秀 | 优秀 | 良好 | 优秀 |
| 成本 | 低 | 中 | 低 | 低 |
| 过滤能力 | ✅✅✅ | ✅✅ | ✅✅ | ✅ |
| 易用性 | ✅✅ | ✅✅✅ | ✅✅ | ✅ |

**推荐**：
- **快速验证**：Pinecone（云托管，无需运维）
- **生产环境**：Qdrant（开源，性能好，成本低）

### 2. Embedding 模型对比

| 模型 | 维度 | 成本 | 质量 | 适用场景 |
|------|------|------|------|----------|
| text-embedding-3-small | 1536 | $0.02/1M tokens | 良好 | 通用，性价比高 |
| text-embedding-3-large | 3072 | $0.13/1M tokens | 优秀 | 高精度需求 |
| text-embedding-ada-002 | 1536 | $0.10/1M tokens | 良好 | OpenAI 经典 |
| Cohere embed-v3 | 1024 | $0.10/1M tokens | 优秀 | 多语言支持 |
| Local (BAAI/bge-large-zh) | 1024 | 免费 | 良好 | 中文，本地部署 |

**推荐**：`text-embedding-3-small` 性价比最高

## 四、实现方案

### 1. 文件结构

```
backend/src/ai/rag/
├── embeddings/
│   ├── openai.js          # OpenAI embeddings
│   ├── local.js           # 本地模型 embeddings
│   └── index.js
├── vectordb/
│   ├── qdrant.js          # Qdrant 客户端
│   ├── pinecone.js        # Pinecone 客户端
│   └── index.js
├── knowledge/
│   ├── indexer.js         # 索引构建器（将数据写入向量库）
│   ├── retriever.js       # 检索器（从向量库搜索）
│   └── reranker.js        # 重排序器（优化搜索结果）
├── sources/
│   ├── findings.js        # 历史分析结果
│   ├── annotations.js     # 人工标注
│   └── documents.js       # 产品文档
└── index.js
```

### 2. Embedding 生成

```javascript
// backend/src/ai/rag/embeddings/openai.js
const OpenAI = require('openai');
const logger = require('../../../utils/logger');

class OpenAIEmbeddings {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    this.model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
    this.dimensions = 1536; // 可降维到 256-1536
  }

  /**
   * 生成单个文本的 embedding
   */
  async embed(text) {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Embedding generation error:', error);
      throw error;
    }
  }

  /**
   * 批量生成 embeddings
   */
  async embedBatch(texts) {
    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: texts, // 最多 2048 个
        encoding_format: 'float'
      });

      return response.data.map(item => item.embedding);
    } catch (error) {
      logger.error('Batch embedding error:', error);
      throw error;
    }
  }

  /**
   * 计算成本
   */
  calculateCost(tokenCount) {
    const costs = {
      'text-embedding-3-small': 0.02,  // $0.02 / 1M tokens
      'text-embedding-3-large': 0.13,
      'text-embedding-ada-002': 0.10
    };

    const costPer1M = costs[this.model] || 0.02;
    return (tokenCount / 1000000) * costPer1M;
  }
}

module.exports = OpenAIEmbeddings;
```

### 3. Qdrant 向量数据库

```javascript
// backend/src/ai/rag/vectordb/qdrant.js
const { QdrantClient } = require('@qdrant/js-client-rest');
const logger = require('../../../utils/logger');

class QdrantVectorDB {
  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY
    });
    this.collectionName = 'logearn_knowledge';
    this.vectorSize = 1536;
  }

  /**
   * 初始化 collection
   */
  async initialize() {
    try {
      // 检查 collection 是否存在
      const exists = await this.client.collectionExists(this.collectionName);

      if (!exists) {
        // 创建 collection
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine' // 余弦相似度
          },
          optimizers_config: {
            default_segment_number: 2
          },
          replication_factor: 2 // 副本数
        });

        logger.info(`Created collection: ${this.collectionName}`);
      }

      // 创建索引（提升搜索性能）
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'type',
        field_schema: 'keyword'
      });

      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'date',
        field_schema: 'datetime'
      });

      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'metric',
        field_schema: 'keyword'
      });

      logger.info('Qdrant initialized');
    } catch (error) {
      logger.error('Qdrant initialization error:', error);
      throw error;
    }
  }

  /**
   * 插入向量
   */
  async upsert(points) {
    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: points.map((point, idx) => ({
          id: point.id || `${Date.now()}-${idx}`,
          vector: point.vector,
          payload: point.payload
        }))
      });

      logger.info(`Upserted ${points.length} points to Qdrant`);
    } catch (error) {
      logger.error('Qdrant upsert error:', error);
      throw error;
    }
  }

  /**
   * 向量搜索
   */
  async search(queryVector, options = {}) {
    try {
      const {
        limit = 5,
        filter = null,
        scoreThreshold = 0.7
      } = options;

      const searchParams = {
        vector: queryVector,
        limit,
        score_threshold: scoreThreshold
      };

      if (filter) {
        searchParams.filter = filter;
      }

      const results = await this.client.search(
        this.collectionName,
        searchParams
      );

      return results.map(result => ({
        id: result.id,
        score: result.score,
        payload: result.payload
      }));
    } catch (error) {
      logger.error('Qdrant search error:', error);
      throw error;
    }
  }

  /**
   * 混合搜索（向量 + 过滤）
   */
  async hybridSearch(queryVector, filters = {}, limit = 5) {
    const qdrantFilter = this.buildFilter(filters);

    return await this.search(queryVector, {
      limit,
      filter: qdrantFilter,
      scoreThreshold: 0.6
    });
  }

  /**
   * 构建 Qdrant 过滤器
   */
  buildFilter(filters) {
    const must = [];

    if (filters.type) {
      must.push({
        key: 'type',
        match: { value: filters.type }
      });
    }

    if (filters.metric) {
      must.push({
        key: 'metric',
        match: { value: filters.metric }
      });
    }

    if (filters.dateFrom || filters.dateTo) {
      const range = {};
      if (filters.dateFrom) range.gte = filters.dateFrom;
      if (filters.dateTo) range.lte = filters.dateTo;

      must.push({
        key: 'date',
        range
      });
    }

    return must.length > 0 ? { must } : null;
  }

  /**
   * 删除指定条件的点
   */
  async delete(filters) {
    try {
      const qdrantFilter = this.buildFilter(filters);

      await this.client.delete(this.collectionName, {
        wait: true,
        filter: qdrantFilter
      });

      logger.info('Deleted points from Qdrant');
    } catch (error) {
      logger.error('Qdrant delete error:', error);
      throw error;
    }
  }

  /**
   * 获取 collection 统计
   */
  async getStats() {
    try {
      const info = await this.client.getCollection(this.collectionName);

      return {
        pointsCount: info.points_count,
        vectorsCount: info.vectors_count,
        indexedVectorsCount: info.indexed_vectors_count,
        status: info.status
      };
    } catch (error) {
      logger.error('Qdrant stats error:', error);
      return null;
    }
  }
}

module.exports = QdrantVectorDB;
```

### 4. 知识索引器

```javascript
// backend/src/ai/rag/knowledge/indexer.js
const OpenAIEmbeddings = require('../embeddings/openai');
const QdrantVectorDB = require('../vectordb/qdrant');
const pool = require('../../../db/pool');
const logger = require('../../../utils/logger');

class KnowledgeIndexer {
  constructor() {
    this.embeddings = new OpenAIEmbeddings();
    this.vectordb = new QdrantVectorDB();
  }

  /**
   * 索引历史分析结果
   */
  async indexFindings(limit = 1000) {
    try {
      logger.info('Indexing findings...');

      // 从数据库获取历史分析
      const result = await pool.query(
        `SELECT 
          id, date, metric, change_percent, 
          current_value, previous_value, evidence, status
        FROM ai_findings
        WHERE status IN ('resolved', 'confirmed')
        ORDER BY date DESC
        LIMIT $1`,
        [limit]
      );

      const findings = result.rows;
      const points = [];

      // 批量生成 embeddings
      const texts = findings.map(f => this.buildFindingText(f));
      const embeddings = await this.embeddings.embedBatch(texts);

      // 构建点
      findings.forEach((finding, idx) => {
        points.push({
          id: `finding-${finding.id}`,
          vector: embeddings[idx],
          payload: {
            type: 'finding',
            findingId: finding.id,
            date: finding.date,
            metric: finding.metric,
            changePercent: finding.change_percent,
            text: texts[idx],
            ...finding.evidence
          }
        });
      });

      // 写入向量库
      await this.vectordb.upsert(points);

      logger.info(`Indexed ${points.length} findings`);
      return points.length;
    } catch (error) {
      logger.error('Index findings error:', error);
      throw error;
    }
  }

  /**
   * 构建 finding 的文本表示（用于 embedding）
   */
  buildFindingText(finding) {
    const { metric, date, change_percent, evidence } = finding;

    return `
日期: ${date}
指标: ${metric}
变化: ${change_percent}%
描述: ${evidence?.description || '无'}
结论: ${evidence?.conclusion || '无'}
    `.trim();
  }

  /**
   * 索引人工标注
   */
  async indexAnnotations(limit = 500) {
    try {
      logger.info('Indexing annotations...');

      const result = await pool.query(
        `SELECT 
          f.id, f.metric, f.date, f.evidence,
          a.annotation, a.correctness, a.created_at
        FROM ai_findings f
        JOIN human_annotations a ON f.id = a.finding_id
        ORDER BY a.created_at DESC
        LIMIT $1`,
        [limit]
      );

      const annotations = result.rows;
      const points = [];

      const texts = annotations.map(a => this.buildAnnotationText(a));
      const embeddings = await this.embeddings.embedBatch(texts);

      annotations.forEach((annotation, idx) => {
        points.push({
          id: `annotation-${annotation.id}`,
          vector: embeddings[idx],
          payload: {
            type: 'annotation',
            findingId: annotation.id,
            metric: annotation.metric,
            date: annotation.date,
            annotation: annotation.annotation,
            correctness: annotation.correctness,
            text: texts[idx]
          }
        });
      });

      await this.vectordb.upsert(points);

      logger.info(`Indexed ${points.length} annotations`);
      return points.length;
    } catch (error) {
      logger.error('Index annotations error:', error);
      throw error;
    }
  }

  /**
   * 构建 annotation 的文本表示
   */
  buildAnnotationText(annotation) {
    return `
指标: ${annotation.metric}
日期: ${annotation.date}
AI 分析: ${annotation.evidence?.description || ''}
人工标注: ${annotation.annotation}
准确性: ${annotation.correctness}
    `.trim();
  }

  /**
   * 增量索引（只索引新数据）
   */
  async incrementalIndex() {
    try {
      // 获取上次索引时间
      const lastIndexTime = await this.getLastIndexTime();

      // 索引新的 findings
      const newFindings = await pool.query(
        `SELECT * FROM ai_findings 
        WHERE created_at > $1 AND status IN ('resolved', 'confirmed')`,
        [lastIndexTime]
      );

      if (newFindings.rows.length > 0) {
        const texts = newFindings.rows.map(f => this.buildFindingText(f));
        const embeddings = await this.embeddings.embedBatch(texts);

        const points = newFindings.rows.map((f, idx) => ({
          id: `finding-${f.id}`,
          vector: embeddings[idx],
          payload: {
            type: 'finding',
            findingId: f.id,
            date: f.date,
            metric: f.metric,
            text: texts[idx]
          }
        }));

        await this.vectordb.upsert(points);
        logger.info(`Incremental indexed ${points.length} new findings`);
      }

      // 更新索引时间
      await this.updateLastIndexTime();
    } catch (error) {
      logger.error('Incremental index error:', error);
      throw error;
    }
  }

  /**
   * 获取上次索引时间
   */
  async getLastIndexTime() {
    const result = await pool.query(
      `SELECT value FROM system_config WHERE key = 'last_index_time'`
    );

    return result.rows[0]?.value || '2000-01-01';
  }

  /**
   * 更新索引时间
   */
  async updateLastIndexTime() {
    await pool.query(
      `INSERT INTO system_config (key, value)
      VALUES ('last_index_time', NOW()::text)
      ON CONFLICT (key) DO UPDATE SET value = NOW()::text`
    );
  }
}

module.exports = KnowledgeIndexer;
```

### 5. 知识检索器

```javascript
// backend/src/ai/rag/knowledge/retriever.js
const OpenAIEmbeddings = require('../embeddings/openai');
const QdrantVectorDB = require('../vectordb/qdrant');
const logger = require('../../../utils/logger');

class KnowledgeRetriever {
  constructor() {
    this.embeddings = new OpenAIEmbeddings();
    this.vectordb = new QdrantVectorDB();
  }

  /**
   * 检索相关知识
   */
  async retrieve(query, options = {}) {
    try {
      const {
        limit = 5,
        type = null,      // 'finding' | 'annotation' | null (all)
        metric = null,
        dateFrom = null,
        dateTo = null
      } = options;

      // 生成查询向量
      const queryVector = await this.embeddings.embed(query);

      // 构建过滤器
      const filters = {};
      if (type) filters.type = type;
      if (metric) filters.metric = metric;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;

      // 检索
      const results = await this.vectordb.hybridSearch(
        queryVector,
        filters,
        limit
      );

      logger.info(`Retrieved ${results.length} results for query: "${query.substring(0, 50)}..."`);

      return results.map(r => ({
        score: r.score,
        type: r.payload.type,
        content: r.payload.text,
        metadata: r.payload
      }));
    } catch (error) {
      logger.error('Knowledge retrieval error:', error);
      throw error;
    }
  }

  /**
   * 检索相似的历史案例
   */
  async retrieveSimilarCases(anomaly, limit = 3) {
    const query = `
指标 ${anomaly.metric} 在 ${anomaly.date} 变化了 ${anomaly.changePercent}%
    `.trim();

    return await this.retrieve(query, {
      limit,
      type: 'finding',
      metric: anomaly.metric
    });
  }

  /**
   * 检索人工反馈
   */
  async retrieveFeedback(query, limit = 5) {
    return await this.retrieve(query, {
      limit,
      type: 'annotation'
    });
  }

  /**
   * 混合检索（向量 + 关键词）
   */
  async hybridRetrieve(query, keywords = [], limit = 5) {
    // 先用向量检索
    const vectorResults = await this.retrieve(query, { limit: limit * 2 });

    // 再用关键词过滤
    if (keywords.length > 0) {
      return vectorResults.filter(result => {
        const text = result.content.toLowerCase();
        return keywords.some(kw => text.includes(kw.toLowerCase()));
      }).slice(0, limit);
    }

    return vectorResults.slice(0, limit);
  }
}

module.exports = KnowledgeRetriever;
```

### 6. 集成到 AI 分析

```javascript
// backend/src/ai/agent/investigationAgent.js
const KnowledgeRetriever = require('../rag/knowledge/retriever');
const { createClient } = require('../llm');

class InvestigationAgent {
  constructor() {
    this.retriever = new KnowledgeRetriever();
    this.llm = createClient();
  }

  /**
   * 分析异常（基于历史经验）
   */
  async analyze(anomaly) {
    // 1. 检索相似的历史案例
    const similarCases = await this.retriever.retrieveSimilarCases(anomaly, 3);

    // 2. 构建 prompt（包含历史经验）
    const contextText = similarCases.map((c, idx) => `
案例 ${idx + 1} (相似度: ${(c.score * 100).toFixed(1)}%):
${c.content}
    `).join('\n\n');

    const prompt = `你是一个增长分析专家。参考以下历史案例分析当前问题。

## 历史案例
${contextText}

## 当前问题
指标: ${anomaly.metric}
日期: ${anomaly.date}
变化: ${anomaly.changePercent}%
当前值: ${anomaly.currentValue}
前值: ${anomaly.previousValue}

请分析：
1. 可能的原因（参考历史案例）
2. 建议的调查方向
3. 预期的影响

用中文回答，简洁明了。`;

    // 3. 调用 LLM
    const response = await this.llm.chat([
      { role: 'system', content: '你是增长分析专家，善于从历史经验中学习。' },
      { role: 'user', content: prompt }
    ], {
      metadata: {
        task: 'investigation',
        anomalyId: anomaly.id
      }
    });

    return {
      analysis: response.content,
      sources: similarCases.map(c => ({
        score: c.score,
        date: c.metadata.date,
        metric: c.metadata.metric
      }))
    };
  }
}

module.exports = InvestigationAgent;
```

## 五、配置

### 1. 环境变量

```bash
# Embedding 配置
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536

# Qdrant 配置
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_COLLECTION=logearn_knowledge

# 或 Pinecone 配置
PINECONE_API_KEY=
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX=logearn-knowledge
```

### 2. package.json 依赖

```json
{
  "dependencies": {
    "@qdrant/js-client-rest": "^1.12.0",
    "@pinecone-database/pinecone": "^3.0.3"
  }
}
```

### 3. Docker Compose (Qdrant)

```yaml
# docker-compose.yml
services:
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - ./qdrant_storage:/qdrant/storage
    environment:
      - QDRANT__SERVICE__GRPC_PORT=6334
```

```bash
docker-compose up -d qdrant
```

## 六、API 集成

### 1. 索引管理 API

```javascript
// backend/src/routes/knowledge.js
const express = require('express');
const KnowledgeIndexer = require('../ai/rag/knowledge/indexer');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
const indexer = new KnowledgeIndexer();

/**
 * 全量索引
 */
router.post('/index/full', requireAuth, async (req, res) => {
  try {
    const findingsCount = await indexer.indexFindings();
    const annotationsCount = await indexer.indexAnnotations();

    res.json({
      success: true,
      indexed: {
        findings: findingsCount,
        annotations: annotationsCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 增量索引
 */
router.post('/index/incremental', requireAuth, async (req, res) => {
  try {
    await indexer.incrementalIndex();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 搜索知识库
 */
router.post('/search', requireAuth, async (req, res) => {
  try {
    const { query, limit, type, metric } = req.body;
    const retriever = new KnowledgeRetriever();

    const results = await retriever.retrieve(query, {
      limit,
      type,
      metric
    });

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### 2. 定时增量索引

```javascript
// backend/src/queues/scheduler.js (添加)
const { addSyncJob } = require('./queues');

// 每小时增量索引
scheduledTasks.push(
  cron.schedule('0 * * * *', async () => {
    logger.info('Running incremental knowledge indexing...');

    await addSyncJob('incremental-index', {});
  })
);
```

## 七、最佳实践

### 1. 文本预处理

```javascript
function preprocessText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 8000); // OpenAI 限制 8191 tokens
}
```

### 2. 成本优化

```javascript
// 缓存 embeddings（相同文本不重复生成）
const embeddingCache = new Map();

async function getCachedEmbedding(text) {
  const hash = crypto.createHash('md5').update(text).digest('hex');

  if (embeddingCache.has(hash)) {
    return embeddingCache.get(hash);
  }

  const embedding = await embeddings.embed(text);
  embeddingCache.set(hash, embedding);

  return embedding;
}
```

### 3. 分批索引（大数据量）

```javascript
async function indexInBatches(items, batchSize = 100) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await indexBatch(batch);

    logger.info(`Indexed ${i + batch.length} / ${items.length}`);
  }
}
```

## 八、监控和运维

### 1. 向量库统计

```javascript
router.get('/stats', requireAuth, async (req, res) => {
  const vectordb = new QdrantVectorDB();
  const stats = await vectordb.getStats();

  res.json({ stats });
});
```

### 2. 搜索质量监控

```javascript
// 记录搜索结果的点击率
async function trackSearchClick(queryId, resultId) {
  await pool.query(
    `INSERT INTO search_clicks (query_id, result_id, clicked_at)
    VALUES ($1, $2, NOW())`,
    [queryId, resultId]
  );
}

// 计算搜索质量指标
async function getSearchQuality() {
  const result = await pool.query(`
    SELECT 
      AVG(CASE WHEN clicked THEN 1 ELSE 0 END) as click_through_rate,
      AVG(rank) as avg_clicked_rank
    FROM search_results
  `);

  return result.rows[0];
}
```

## 九、下一步

完成 RAG 集成后：
1. 实现 Reranker（重排序模型）提升搜索精度
2. 添加多模态检索（图表截图）
3. 实现持续学习（从人工反馈中优化）
4. 添加知识图谱（结构化关系）

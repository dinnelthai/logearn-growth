# Bull 任务队列实施文档

## 一、概述

Bull 是基于 Redis 的高级任务队列，用于处理 AI Growth Agent 中的异步任务：
- ✅ AI 分析任务（耗时 30 秒 - 几分钟）
- ✅ 定时任务（每日简报、周报）
- ✅ 数据同步任务
- ✅ 报告生成任务

## 二、架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                      任务生产者                               │
│  Express API Endpoints · Scheduled Jobs · Webhooks           │
└─────────────────────────────────────────────────────────────┘
                            ↓ (添加任务)
┌─────────────────────────────────────────────────────────────┐
│                       Bull 队列                              │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │ AI 分析队列  │ 报告生成队列 │ 数据同步队列 │             │
│  │ Priority: 高 │ Priority: 中 │ Priority: 低 │             │
│  │ Concurrency:2│ Concurrency:1│ Concurrency:3│             │
│  └──────────────┴──────────────┴──────────────┘             │
│                    ↓ (Redis 持久化)                          │
│               ┌─────────────┐                                │
│               │ Redis Queue │                                │
│               │   Storage   │                                │
│               └─────────────┘                                │
└─────────────────────────────────────────────────────────────┘
                            ↓ (任务分发)
┌─────────────────────────────────────────────────────────────┐
│                      Worker 进程                              │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │  Worker 1    │  Worker 2    │  Worker 3    │             │
│  │  (AI 分析)   │  (报告生成)  │  (数据同步)  │             │
│  └──────────────┴──────────────┴──────────────┘             │
└─────────────────────────────────────────────────────────────┘
                            ↓ (结果通知)
┌─────────────────────────────────────────────────────────────┐
│                      通知系统                                 │
│  WebSocket · Slack · Email · Webhook                         │
└─────────────────────────────────────────────────────────────┘
```

## 三、队列设计

### 1. AI 分析队列 (ai-analysis)

**用途**：处理所有 AI 分析任务

**任务类型**：
- `anomaly-detection` - 异常检测
- `dimension-analysis` - 维度拆解
- `hypothesis-generation` - 假设生成
- `suggestion-ranking` - 建议排序

**配置**：
```javascript
{
  priority: 'high',
  concurrency: 2,           // 最多 2 个任务并行
  limiter: {
    max: 10,                // 每秒最多 10 个任务
    duration: 1000
  },
  defaultJobOptions: {
    attempts: 3,            // 失败重试 3 次
    backoff: {
      type: 'exponential',
      delay: 2000           // 2s, 4s, 8s
    },
    removeOnComplete: 100,  // 保留最近 100 个完成任务
    removeOnFail: 500       // 保留最近 500 个失败任务
  }
}
```

### 2. 报告生成队列 (report-generation)

**用途**：生成各类报告

**任务类型**：
- `daily-report` - 每日简报
- `weekly-report` - 周报
- `monthly-report` - 月报
- `custom-report` - 自定义报告

**配置**：
```javascript
{
  priority: 'medium',
  concurrency: 1,           // 串行执行（避免资源竞争）
  defaultJobOptions: {
    attempts: 2,
    timeout: 300000,        // 5 分钟超时
    removeOnComplete: 50
  }
}
```

### 3. 数据同步队列 (data-sync)

**用途**：后台数据同步

**任务类型**：
- `hologres-sync` - 从 Hologres 同步数据
- `cache-warmup` - 缓存预热
- `metrics-rollup` - 指标汇总

**配置**：
```javascript
{
  priority: 'low',
  concurrency: 3,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'fixed',
      delay: 10000          // 固定 10 秒重试
    }
  }
}
```

## 四、实现方案

### 1. 文件结构

```
backend/src/queues/
├── connection.js          # Redis 连接配置
├── queues.js              # 队列定义和创建
├── workers/
│   ├── aiAnalysisWorker.js    # AI 分析 worker
│   ├── reportWorker.js        # 报告生成 worker
│   └── dataSyncWorker.js      # 数据同步 worker
├── jobs/
│   ├── anomalyDetection.js    # 异常检测任务
│   ├── dimensionAnalysis.js   # 维度分析任务
│   ├── dailyReport.js         # 每日报告任务
│   └── cacheWarmup.js         # 缓存预热任务
├── scheduler.js           # 定时任务调度器
├── monitoring.js          # 队列监控
└── index.js               # 统一导出
```

### 2. Redis 连接配置

```javascript
// backend/src/queues/connection.js
const { createClient } = require('../cache/redis');

/**
 * 获取 Bull 使用的 Redis 配置
 */
function getRedisConfig() {
  return {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.BULL_REDIS_DB || '1', 10), // 使用独立 DB
      maxRetriesPerRequest: null, // Bull 需要这个设置
      enableReadyCheck: false
    }
  };
}

module.exports = {
  getRedisConfig
};
```

### 3. 队列定义

```javascript
// backend/src/queues/queues.js
const Queue = require('bull');
const { getRedisConfig } = require('./connection');
const logger = require('../utils/logger');

const queues = {};

/**
 * 创建或获取队列
 */
function getQueue(name) {
  if (queues[name]) {
    return queues[name];
  }

  const queue = new Queue(name, getRedisConfig());

  // 全局事件监听
  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  queue.on('waiting', (jobId) => {
    logger.debug(`Job ${jobId} is waiting in ${name}`);
  });

  queue.on('active', (job) => {
    logger.info(`Job ${job.id} (${job.name}) started in ${name}`);
  });

  queue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} (${job.name}) completed in ${name}`);
  });

  queue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} (${job.name}) failed in ${name}:`, err);
  });

  queue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} stalled in ${name}`);
  });

  queues[name] = queue;
  return queue;
}

/**
 * AI 分析队列
 */
const aiAnalysisQueue = getQueue('ai-analysis');
aiAnalysisQueue.setMaxListeners(20); // 避免内存泄漏警告

/**
 * 报告生成队列
 */
const reportQueue = getQueue('report-generation');

/**
 * 数据同步队列
 */
const dataSyncQueue = getQueue('data-sync');

/**
 * 添加 AI 分析任务
 */
async function addAnalysisJob(name, data, options = {}) {
  return await aiAnalysisQueue.add(name, data, {
    priority: options.priority || 5,
    attempts: options.attempts || 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    timeout: options.timeout || 120000, // 2 分钟
    ...options
  });
}

/**
 * 添加报告生成任务
 */
async function addReportJob(name, data, options = {}) {
  return await reportQueue.add(name, data, {
    attempts: 2,
    timeout: 300000, // 5 分钟
    ...options
  });
}

/**
 * 添加数据同步任务
 */
async function addSyncJob(name, data, options = {}) {
  return await dataSyncQueue.add(name, data, {
    attempts: 5,
    backoff: {
      type: 'fixed',
      delay: 10000
    },
    ...options
  });
}

/**
 * 获取队列状态
 */
async function getQueueStats(queueName) {
  const queue = queues[queueName];
  if (!queue) return null;

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return {
    name: queueName,
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  };
}

/**
 * 获取所有队列状态
 */
async function getAllQueueStats() {
  const stats = await Promise.all(
    Object.keys(queues).map(name => getQueueStats(name))
  );
  return stats.filter(Boolean);
}

/**
 * 清空队列
 */
async function clearQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) return false;

  await queue.empty();
  logger.info(`Queue ${queueName} cleared`);
  return true;
}

/**
 * 暂停队列
 */
async function pauseQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) return false;

  await queue.pause();
  logger.info(`Queue ${queueName} paused`);
  return true;
}

/**
 * 恢复队列
 */
async function resumeQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) return false;

  await queue.resume();
  logger.info(`Queue ${queueName} resumed`);
  return true;
}

/**
 * 关闭所有队列
 */
async function closeAll() {
  await Promise.all(
    Object.values(queues).map(queue => queue.close())
  );
  logger.info('All queues closed');
}

module.exports = {
  getQueue,
  aiAnalysisQueue,
  reportQueue,
  dataSyncQueue,
  addAnalysisJob,
  addReportJob,
  addSyncJob,
  getQueueStats,
  getAllQueueStats,
  clearQueue,
  pauseQueue,
  resumeQueue,
  closeAll
};
```

### 4. AI 分析 Worker

```javascript
// backend/src/queues/workers/aiAnalysisWorker.js
const { Worker } = require('bullmq');
const { getRedisConfig } = require('../connection');
const logger = require('../../utils/logger');

// 导入任务处理器
const anomalyDetection = require('../jobs/anomalyDetection');
const dimensionAnalysis = require('../jobs/dimensionAnalysis');
const hypothesisGeneration = require('../jobs/hypothesisGeneration');

/**
 * 任务处理器映射
 */
const jobHandlers = {
  'anomaly-detection': anomalyDetection,
  'dimension-analysis': dimensionAnalysis,
  'hypothesis-generation': hypothesisGeneration
};

/**
 * AI 分析 Worker
 */
const aiAnalysisWorker = new Worker(
  'ai-analysis',
  async (job) => {
    const { name, data, id } = job;
    
    logger.info(`Processing AI analysis job ${id}: ${name}`);
    
    // 更新进度
    await job.updateProgress(10);
    
    // 获取对应的处理器
    const handler = jobHandlers[name];
    if (!handler) {
      throw new Error(`Unknown job type: ${name}`);
    }
    
    // 执行任务
    try {
      await job.updateProgress(20);
      const result = await handler.process(data, job);
      await job.updateProgress(100);
      
      logger.info(`AI analysis job ${id} completed`);
      return result;
    } catch (error) {
      logger.error(`AI analysis job ${id} failed:`, error);
      throw error;
    }
  },
  {
    ...getRedisConfig(),
    concurrency: parseInt(process.env.AI_WORKER_CONCURRENCY || '2', 10),
    limiter: {
      max: 10,      // 每秒最多 10 个任务
      duration: 1000
    }
  }
);

/**
 * Worker 事件监听
 */
aiAnalysisWorker.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed:`, { result });
  
  // 可以在这里发送通知
  // notifyCompletion(job, result);
});

aiAnalysisWorker.on('failed', (job, err) => {
  logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts:`, err);
  
  // 如果是最后一次重试失败，发送告警
  if (job.attemptsMade >= job.opts.attempts) {
    // sendAlert(job, err);
  }
});

aiAnalysisWorker.on('progress', (job, progress) => {
  logger.debug(`Job ${job.id} progress: ${progress}%`);
});

aiAnalysisWorker.on('error', (err) => {
  logger.error('Worker error:', err);
});

module.exports = aiAnalysisWorker;
```

### 5. 异常检测任务

```javascript
// backend/src/queues/jobs/anomalyDetection.js
const { createClient } = require('../../ai/llm');
const anomalyDetector = require('../../ai/tools/anomalyDetector');
const dataAccess = require('../../ai/tools/dataAccess');
const pool = require('../../db/pool');
const logger = require('../../utils/logger');

/**
 * 异常检测任务处理器
 */
async function process(data, job) {
  const { date, metrics } = data;
  
  logger.info(`Starting anomaly detection for ${date}`);
  
  // Step 1: 获取指标数据
  await job.updateProgress(30);
  const metricsData = await dataAccess.getMetrics(metrics, date);
  
  // Step 2: 统计检测异常（不用 LLM）
  await job.updateProgress(50);
  const anomalies = await anomalyDetector.detect(metricsData);
  
  if (anomalies.length === 0) {
    logger.info(`No anomalies detected for ${date}`);
    return { date, anomaliesCount: 0 };
  }
  
  // Step 3: 用 LLM 生成文字描述
  await job.updateProgress(70);
  const llm = createClient();
  const descriptions = [];
  
  for (const anomaly of anomalies) {
    const response = await llm.chat([
      {
        role: 'system',
        content: 'You are a concise data analyst. Describe anomalies in 1-2 sentences.'
      },
      {
        role: 'user',
        content: `Metric: ${anomaly.metric}
Current: ${anomaly.currentValue}
Previous: ${anomaly.previousValue}
Change: ${anomaly.changePercent}%

Describe this anomaly concisely in Chinese.`
      }
    ], {
      metadata: { task: 'anomaly-description' },
      cacheTTL: 86400
    });
    
    descriptions.push({
      ...anomaly,
      description: response.content
    });
  }
  
  // Step 4: 保存到数据库
  await job.updateProgress(90);
  const savedFindings = [];
  
  for (const desc of descriptions) {
    const result = await pool.query(
      `INSERT INTO ai_findings (
        date, metric, change_percent, current_value, previous_value,
        anomaly_score, evidence, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        date,
        desc.metric,
        desc.changePercent,
        desc.currentValue,
        desc.previousValue,
        desc.anomalyScore,
        JSON.stringify({ description: desc.description }),
        'new'
      ]
    );
    
    savedFindings.push({
      id: result.rows[0].id,
      ...desc
    });
  }
  
  logger.info(`Detected ${anomalies.length} anomalies for ${date}`);
  
  return {
    date,
    anomaliesCount: anomalies.length,
    findings: savedFindings
  };
}

module.exports = {
  process
};
```

### 6. 定时任务调度器

```javascript
// backend/src/queues/scheduler.js
const cron = require('node-cron');
const { addAnalysisJob, addReportJob, addSyncJob } = require('./queues');
const logger = require('../utils/logger');

const scheduledTasks = [];

/**
 * 启动所有定时任务
 */
function startScheduler() {
  // 每天早上 9 点：异常检测
  scheduledTasks.push(
    cron.schedule('0 9 * * *', async () => {
      logger.info('Running daily anomaly detection...');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const date = yesterday.toISOString().split('T')[0];
      
      await addAnalysisJob('anomaly-detection', {
        date,
        metrics: ['active_users', 'new_users', 'conversion_rate', 'revenue']
      }, {
        priority: 1 // 高优先级
      });
    }, {
      timezone: 'Asia/Shanghai'
    })
  );
  
  // 每天早上 9:30：生成每日报告
  scheduledTasks.push(
    cron.schedule('30 9 * * *', async () => {
      logger.info('Generating daily report...');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const date = yesterday.toISOString().split('T')[0];
      
      await addReportJob('daily-report', { date });
    }, {
      timezone: 'Asia/Shanghai'
    })
  );
  
  // 每周一早上 10 点：生成周报
  scheduledTasks.push(
    cron.schedule('0 10 * * 1', async () => {
      logger.info('Generating weekly report...');
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      await addReportJob('weekly-report', {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      });
    }, {
      timezone: 'Asia/Shanghai'
    })
  );
  
  // 每小时：缓存预热
  scheduledTasks.push(
    cron.schedule('0 * * * *', async () => {
      logger.debug('Running cache warmup...');
      
      await addSyncJob('cache-warmup', {
        metrics: ['active_users', 'new_users']
      });
    })
  );
  
  // 每 5 分钟：数据同步（如果需要）
  if (process.env.ENABLE_DATA_SYNC === 'true') {
    scheduledTasks.push(
      cron.schedule('*/5 * * * *', async () => {
        logger.debug('Running data sync...');
        
        await addSyncJob('hologres-sync', {});
      })
    );
  }
  
  logger.info(`Started ${scheduledTasks.length} scheduled tasks`);
}

/**
 * 停止所有定时任务
 */
function stopScheduler() {
  scheduledTasks.forEach(task => task.stop());
  logger.info('All scheduled tasks stopped');
}

module.exports = {
  startScheduler,
  stopScheduler
};
```

### 7. 队列监控

```javascript
// backend/src/queues/monitoring.js
const { getAllQueueStats } = require('./queues');
const logger = require('../utils/logger');

/**
 * 监控队列健康状态
 */
async function monitorQueues() {
  const stats = await getAllQueueStats();
  
  for (const stat of stats) {
    // 检查失败任务过多
    if (stat.failed > 100) {
      logger.warn(`Queue ${stat.name} has ${stat.failed} failed jobs`);
      // 发送告警
    }
    
    // 检查等待任务堆积
    if (stat.waiting > 1000) {
      logger.warn(`Queue ${stat.name} has ${stat.waiting} waiting jobs`);
      // 发送告警
    }
    
    // 检查延迟任务过多
    if (stat.delayed > 500) {
      logger.warn(`Queue ${stat.name} has ${stat.delayed} delayed jobs`);
    }
  }
  
  return stats;
}

/**
 * 启动监控（每分钟检查一次）
 */
function startMonitoring() {
  setInterval(async () => {
    try {
      await monitorQueues();
    } catch (error) {
      logger.error('Queue monitoring error:', error);
    }
  }, 60000); // 1 分钟
  
  logger.info('Queue monitoring started');
}

module.exports = {
  monitorQueues,
  startMonitoring
};
```

## 五、API 集成

### 1. 添加任务 API

```javascript
// backend/src/routes/aiJobs.js
const express = require('express');
const { addAnalysisJob, addReportJob } = require('../queues/queues');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

/**
 * 创建 AI 分析任务
 */
router.post('/analysis', requireAuth, async (req, res) => {
  try {
    const { type, data } = req.body;
    
    const job = await addAnalysisJob(type, data, {
      priority: req.body.priority || 5
    });
    
    res.json({
      jobId: job.id,
      status: 'queued',
      message: 'Analysis job created'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取任务状态
 */
router.get('/jobs/:jobId', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { getQueue } = require('../queues/queues');
    
    // 查找任务（可能在多个队列中）
    const queueNames = ['ai-analysis', 'report-generation', 'data-sync'];
    
    for (const queueName of queueNames) {
      const queue = getQueue(queueName);
      const job = await queue.getJob(jobId);
      
      if (job) {
        const state = await job.getState();
        const progress = job.progress();
        
        return res.json({
          jobId: job.id,
          name: job.name,
          state,
          progress,
          data: job.data,
          result: job.returnvalue,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn
        });
      }
    }
    
    res.status(404).json({ error: 'Job not found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 重试失败任务
 */
router.post('/jobs/:jobId/retry', requireAuth, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { getQueue } = require('../queues/queues');
    
    const queueNames = ['ai-analysis', 'report-generation', 'data-sync'];
    
    for (const queueName of queueNames) {
      const queue = getQueue(queueName);
      const job = await queue.getJob(jobId);
      
      if (job) {
        await job.retry();
        return res.json({ message: 'Job retried', jobId });
      }
    }
    
    res.status(404).json({ error: 'Job not found' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### 2. 队列监控 API

```javascript
// backend/src/routes/aiJobs.js (继续)

/**
 * 获取队列统计
 */
router.get('/queues/stats', requireAuth, async (req, res) => {
  try {
    const { getAllQueueStats } = require('../queues/queues');
    const stats = await getAllQueueStats();
    
    res.json({ queues: stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 暂停/恢复队列
 */
router.post('/queues/:name/pause', requireAuth, async (req, res) => {
  try {
    const { pauseQueue } = require('../queues/queues');
    await pauseQueue(req.params.name);
    
    res.json({ message: `Queue ${req.params.name} paused` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/queues/:name/resume', requireAuth, async (req, res) => {
  try {
    const { resumeQueue } = require('../queues/queues');
    await resumeQueue(req.params.name);
    
    res.json({ message: `Queue ${req.params.name} resumed` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## 六、配置

### 1. 环境变量

```bash
# Bull 队列配置
BULL_REDIS_DB=1                    # 使用独立的 Redis DB
AI_WORKER_CONCURRENCY=2            # AI Worker 并发数
REPORT_WORKER_CONCURRENCY=1        # 报告 Worker 并发数
SYNC_WORKER_CONCURRENCY=3          # 同步 Worker 并发数

# 定时任务
ENABLE_DAILY_REPORT=true
ENABLE_WEEKLY_REPORT=true
ENABLE_DATA_SYNC=false

# 监控
ENABLE_QUEUE_MONITORING=true
QUEUE_ALERT_THRESHOLD=1000         # 等待任务超过此数量告警
```

### 2. package.json 依赖

```json
{
  "dependencies": {
    "bull": "^4.16.3",
    "bullmq": "^5.31.3",
    "node-cron": "^3.0.3"
  }
}
```

## 七、启动和部署

### 1. 单进程模式（开发环境）

```javascript
// backend/src/index.js
const { startScheduler } = require('./queues/scheduler');
const { startMonitoring } = require('./queues/monitoring');

// 启动 workers
require('./queues/workers/aiAnalysisWorker');
require('./queues/workers/reportWorker');
require('./queues/workers/dataSyncWorker');

// 启动定时任务
startScheduler();

// 启动监控
if (process.env.ENABLE_QUEUE_MONITORING === 'true') {
  startMonitoring();
}
```

### 2. 多进程模式（生产环境）

```bash
# 使用 PM2 管理多个 worker 进程

# ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api',
      script: './src/index.js',
      instances: 2,
      exec_mode: 'cluster'
    },
    {
      name: 'ai-worker',
      script: './src/queues/workers/aiAnalysisWorker.js',
      instances: 2,
      exec_mode: 'fork'
    },
    {
      name: 'report-worker',
      script: './src/queues/workers/reportWorker.js',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'sync-worker',
      script: './src/queues/workers/dataSyncWorker.js',
      instances: 3,
      exec_mode: 'fork'
    }
  ]
};

# 启动
pm2 start ecosystem.config.js
```

## 八、监控和运维

### 1. Bull Board（可视化监控）

```javascript
// backend/src/monitoring/bullBoard.js
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const { 
  aiAnalysisQueue, 
  reportQueue, 
  dataSyncQueue 
} = require('../queues/queues');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullAdapter(aiAnalysisQueue),
    new BullAdapter(reportQueue),
    new BullAdapter(dataSyncQueue)
  ],
  serverAdapter
});

module.exports = serverAdapter.getRouter();
```

```javascript
// backend/src/index.js
const bullBoardRouter = require('./monitoring/bullBoard');
app.use('/admin/queues', requireAuth, bullBoardRouter);
```

访问 `http://localhost:3000/admin/queues` 查看队列状态。

### 2. Prometheus 指标

```javascript
// backend/src/monitoring/prometheus.js
const { register, Counter, Gauge } = require('prom-client');
const { getAllQueueStats } = require('../queues/queues');

const jobsProcessed = new Counter({
  name: 'bull_jobs_processed_total',
  help: 'Total number of jobs processed',
  labelNames: ['queue', 'status']
});

const queueSize = new Gauge({
  name: 'bull_queue_size',
  help: 'Number of jobs in queue',
  labelNames: ['queue', 'state']
});

async function updateMetrics() {
  const stats = await getAllQueueStats();
  
  stats.forEach(stat => {
    queueSize.set({ queue: stat.name, state: 'waiting' }, stat.waiting);
    queueSize.set({ queue: stat.name, state: 'active' }, stat.active);
    queueSize.set({ queue: stat.name, state: 'failed' }, stat.failed);
  });
}

// 每 15 秒更新一次
setInterval(updateMetrics, 15000);
```

## 九、最佳实践

### 1. 任务幂等性

```javascript
// 使用唯一 ID 避免重复处理
await addAnalysisJob('anomaly-detection', data, {
  jobId: `anomaly-${date}`, // 相同日期不会重复创建任务
  removeOnComplete: true
});
```

### 2. 错误处理

```javascript
async function process(data, job) {
  try {
    // 处理任务
  } catch (error) {
    // 记录详细错误信息
    logger.error('Job failed:', {
      jobId: job.id,
      data: job.data,
      error: error.message,
      stack: error.stack
    });
    
    // 重新抛出，让 Bull 处理重试
    throw error;
  }
}
```

### 3. 长任务进度更新

```javascript
async function process(data, job) {
  const steps = 10;
  
  for (let i = 0; i < steps; i++) {
    await doStep(i);
    await job.updateProgress((i + 1) * 10);
  }
}
```

## 十、测试

### 1. 手动测试

```javascript
// 测试添加任务
const { addAnalysisJob } = require('./src/queues/queues');

async function test() {
  const job = await addAnalysisJob('anomaly-detection', {
    date: '2026-10-26',
    metrics: ['active_users']
  });
  
  console.log('Job created:', job.id);
  
  // 等待完成
  await job.finished();
  console.log('Job result:', job.returnvalue);
}

test().catch(console.error);
```

### 2. 单元测试

```javascript
// backend/test/queues.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { addAnalysisJob, getQueue } = require('../src/queues/queues');

describe('Bull Queues', () => {
  it('should add job to queue', async () => {
    const job = await addAnalysisJob('test-job', { test: true });
    assert.ok(job.id);
    
    const queue = getQueue('ai-analysis');
    const retrieved = await queue.getJob(job.id);
    assert.strictEqual(retrieved.data.test, true);
  });
});
```

## 十一、下一步

完成 Bull 集成后：
1. 实现 WebSocket 实时推送任务进度
2. 添加更多任务类型（L1/L2/L3 分析）
3. 集成告警系统（Slack/Email）
4. 优化任务调度策略

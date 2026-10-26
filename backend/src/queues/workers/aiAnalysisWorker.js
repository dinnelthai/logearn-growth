#!/usr/bin/env node
/**
 * AI 分析任务 Worker
 *
 * 使用方式：
 * node src/queues/workers/aiAnalysisWorker.js
 *
 * 或后台运行：
 * pm2 start src/queues/workers/aiAnalysisWorker.js --name ai-worker
 */

require('dotenv').config();
const { queues } = require('../queues');
const aiAnalysisJobs = require('../jobs/aiAnalysis');
const logger = console;

// WebSocket handlers for real-time updates
let jobProgress;
try {
  const websocket = require('../../websocket');
  jobProgress = websocket.jobProgress;
} catch (error) {
  logger.warn('WebSocket not initialized in worker (running standalone)');
  // Create no-op handlers for standalone mode
  jobProgress = {
    emitStarted: () => {},
    emitProgress: () => {},
    emitCompleted: () => {},
    emitFailed: () => {}
  };
}

const CONCURRENCY = parseInt(process.env.AI_WORKER_CONCURRENCY || '5', 10);

logger.info('Starting AI Analysis Worker...', {
  concurrency: CONCURRENCY,
  pid: process.pid
});

/**
 * 处理 AI 分析任务
 */
queues.aiAnalysis.process(CONCURRENCY, async (job) => {
  logger.info(`Processing job ${job.id}:`, {
    type: job.name,
    attempts: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts
  });

  // Emit job started event
  jobProgress.emitStarted(job.id, {
    type: job.name,
    data: job.data
  });

  const handler = aiAnalysisJobs[job.name];

  if (!handler) {
    const error = new Error(`Unknown job type: ${job.name}`);
    jobProgress.emitFailed(job.id, error);
    throw error;
  }

  try {
    // Update progress at job start
    await job.progress(5);
    jobProgress.emitProgress(job.id, 5, { step: 'initialized' });

    const result = await handler(job);

    logger.info(`Job ${job.id} completed successfully`);

    // Emit completion event
    await job.progress(100);
    jobProgress.emitCompleted(job.id, result);

    return result;
  } catch (error) {
    logger.error(`Job ${job.id} failed:`, error);

    // Emit failure event
    jobProgress.emitFailed(job.id, error);

    // 记录错误,让 Bull 处理重试
    throw error;
  }
});

/**
 * Worker 事件监听
 */
queues.aiAnalysis.on('error', (error) => {
  logger.error('Queue error:', error);
});

queues.aiAnalysis.on('waiting', (jobId) => {
  logger.debug(`Job ${jobId} is waiting`);
});

queues.aiAnalysis.on('active', (job) => {
  logger.info(`Job ${job.id} started:`, job.name);
});

queues.aiAnalysis.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed:`, {
    duration: Date.now() - job.processedOn,
    resultSize: JSON.stringify(result).length
  });
});

queues.aiAnalysis.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed:`, {
    attempts: job.attemptsMade,
    error: error.message,
    stack: error.stack
  });
});

queues.aiAnalysis.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`);
});

/**
 * 优雅关闭
 */
async function gracefulShutdown() {
  logger.info('Shutting down AI Analysis Worker...');

  try {
    await queues.aiAnalysis.close();
    logger.info('Worker closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

logger.info('AI Analysis Worker ready', {
  concurrency: CONCURRENCY,
  pid: process.pid
});

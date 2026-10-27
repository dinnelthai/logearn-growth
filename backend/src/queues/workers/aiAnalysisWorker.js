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
const { businessAnalysis } = require('../jobs/businessAnalysis');
const { retrospectiveAnalysis } = require('../jobs/retrospective');
const logger = console;

// 任务处理器映射
const taskHandlers = {
  'business-analysis': businessAnalysis,
  'retrospective': retrospectiveAnalysis
};

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
 * 处理 AI 分析任务 - 注册所有任务类型的处理器
 */
// 为每个任务类型注册独立的处理器
Object.entries(taskHandlers).forEach(([taskName, handler]) => {
  queues.aiAnalysis.process(taskName, CONCURRENCY, async (job) => {
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

    try {
      const result = await handler(job);

      // Emit completion
      jobProgress.emitCompleted(job.id, result);

      logger.info(`Job ${job.id} completed successfully`);
      return result;
    } catch (error) {
      logger.error(`Job ${job.id} failed:`, error);
      jobProgress.emitFailed(job.id, error);
      throw error;
    }
  });
});

logger.info('Registered task handlers:', Object.keys(taskHandlers));
// Optional read-only lease watchdog. It never steals work or issues LLM calls.
let leaseWatchdog=null,leaseWatchdogBusy=false;
if(process.env.AI_LEASE_MONITOR_ENABLED==='1'){
  leaseWatchdog=setInterval(async()=>{
    if(leaseWatchdogBusy)return;
    leaseWatchdogBusy=true;
    try{
      const expired=await require('../../db/aiRecords').listExpiredAnalysisLeases(100);
      if(expired.length)logger.warn('[AI recovery] expired processing leases require review',{
        count:expired.length,oldestLeaseExpiredAt:expired[0].lease_expires_at
      });
    }catch(error){logger.error('[AI recovery] lease monitor unavailable',error.message);}
    finally{leaseWatchdogBusy=false;}
  },60000);
  leaseWatchdog.unref?.();
}


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
  if(leaseWatchdog)clearInterval(leaseWatchdog);

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

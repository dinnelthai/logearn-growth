/**
 * Bull 任务队列定义
 */

const Bull = require('bull');
const { getBullRedisConfig } = require('./connection');
const logger = console;

// 队列配置
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,                    // 失败重试 3 次
  backoff: {
    type: 'exponential',
    delay: 2000                   // 初始延迟 2 秒
  },
  removeOnComplete: 100,          // 保留最近 100 个完成任务
  removeOnFail: 500               // 保留最近 500 个失败任务
};

const QUEUE_OPTIONS = {
  redis: getBullRedisConfig(),
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
  settings: {
    lockDuration: 300000,         // 任务锁定 5 分钟
    stalledInterval: 60000,       // 检测卡住的任务
    maxStalledCount: 2            // 最多认为卡住 2 次
  }
};

// 创建队列
const queues = {};

/**
 * AI 分析队列
 */
queues.aiAnalysis = new Bull('ai-analysis', {...QUEUE_OPTIONS,settings:{...QUEUE_OPTIONS.settings,maxStalledCount:0}});

/**
 * 数据处理队列
 */
queues.dataProcessing = new Bull('data-processing', QUEUE_OPTIONS);

/**
 * 定时任务队列
 */
queues.scheduled = new Bull('scheduled', QUEUE_OPTIONS);

// 监听队列事件
Object.entries(queues).forEach(([name, queue]) => {
  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  queue.on('waiting', (jobId) => {
    logger.debug(`Job ${jobId} waiting in ${name}`);
  });

  queue.on('active', (job) => {
    logger.info(`Job ${job.id} active in ${name}:`, job.name);
  });

  queue.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed in ${name}`, {
      duration: Date.now() - job.processedOn,
      result: typeof result === 'object' ? JSON.stringify(result).slice(0, 100) : result
    });
  });

  queue.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed in ${name}:`, {
      attempts: job.attemptsMade,
      error: error.message
    });
  });

  queue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} stalled in ${name}`);
  });
});

/**
 * 添加 AI 分析任务
 */
async function addAIAnalysisJob(type, data, options = {}) {
  return queues.aiAnalysis.add(type, data, {
    ...options,
    priority: options.priority || 1,
    attempts: options.attempts || 3
  });
}

/**
 * 添加数据处理任务
 */
async function addDataProcessingJob(type, data, options = {}) {
  return queues.dataProcessing.add(type, data, options);
}

/**
 * 添加定时任务
 */
async function addScheduledJob(type, data, schedule, options = {}) {
  return queues.scheduled.add(type, data, {
    ...options,
    repeat: {
      cron: schedule,
      tz: process.env.TZ || 'Asia/Shanghai'
    }
  });
}

/**
 * 获取任务状态
 */
async function getJobStatus(queueName, jobId) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const job = await queue.getJob(jobId);
  if (!job) {
    return { exists: false };
  }

  const state = await job.getState();
  const progress = job.progress();
  const reason = job.failedReason;

  return {
    exists: true,
    id: job.id,
    name: job.name,
    data: job.data,
    state,
    progress,
    attempts: job.attemptsMade,
    maxAttempts: job.opts.attempts,
    failedReason: reason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    timestamp: job.timestamp,
    returnvalue: job.returnvalue
  };
}

/**
 * 获取队列统计
 */
async function getQueueStats(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  };
}

/**
 * 暂停队列
 */
async function pauseQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }
  await queue.pause();
  logger.info(`Queue ${queueName} paused`);
}

/**
 * 恢复队列
 */
async function resumeQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }
  await queue.resume();
  logger.info(`Queue ${queueName} resumed`);
}

/**
 * 清空队列
 */
async function cleanQueue(queueName, grace = 0) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  await queue.clean(grace, 'completed');
  await queue.clean(grace, 'failed');
  logger.info(`Queue ${queueName} cleaned`);
}

/**
 * 关闭所有队列
 */
async function closeQueues() {
  await Promise.all(
    Object.values(queues).map(queue => queue.close())
  );
  logger.info('All queues closed');
}

module.exports = {
  queues,
  addAIAnalysisJob,
  addDataProcessingJob,
  addScheduledJob,
  getJobStatus,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  closeQueues
};

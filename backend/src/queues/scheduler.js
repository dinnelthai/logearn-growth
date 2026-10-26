#!/usr/bin/env node
/**
 * 定时任务调度器
 *
 * 使用方式：
 * node src/queues/scheduler.js
 *
 * 或后台运行：
 * pm2 start src/queues/scheduler.js --name scheduler
 */

require('dotenv').config();
const cron = require('node-cron');
const { addAIAnalysisJob, addScheduledJob } = require('./queues');
const logger = console;

logger.info('Starting Task Scheduler...', { pid: process.pid });

/**
 * 每日异常检测 - 每天早上 9 点
 */
cron.schedule('0 9 * * *', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  logger.info('Running daily anomaly detection...', { date });

  try {
    const job = await addAIAnalysisJob('anomaly-detection', {
      date,
      metrics: [
        'active_users',
        'new_signups',
        'engagement_rate',
        'revenue'
      ]
    }, {
      priority: 1
    });

    logger.info('Daily anomaly detection scheduled:', { jobId: job.id });
  } catch (error) {
    logger.error('Failed to schedule anomaly detection:', error);
  }
}, {
  timezone: process.env.TZ || 'Asia/Shanghai'
});

/**
 * 每日简报 - 每天早上 8 点
 */
cron.schedule('0 8 * * *', async () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  logger.info('Generating daily report...', { date });

  try {
    const job = await addAIAnalysisJob('daily-report', {
      date
    }, {
      priority: 2 // 高优先级
    });

    logger.info('Daily report scheduled:', { jobId: job.id });
  } catch (error) {
    logger.error('Failed to schedule daily report:', error);
  }
}, {
  timezone: process.env.TZ || 'Asia/Shanghai'
});

/**
 * 每周趋势分析 - 每周一早上 10 点
 */
cron.schedule('0 10 * * 1', async () => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  logger.info('Running weekly trend analysis...', {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  });

  try {
    const job = await addAIAnalysisJob('weekly-trends', {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      metrics: [
        'active_users',
        'new_signups',
        'engagement_rate',
        'retention_rate'
      ]
    }, {
      priority: 2
    });

    logger.info('Weekly trend analysis scheduled:', { jobId: job.id });
  } catch (error) {
    logger.error('Failed to schedule weekly trends:', error);
  }
}, {
  timezone: process.env.TZ || 'Asia/Shanghai'
});

/**
 * 健康检查 - 每 5 分钟
 */
cron.schedule('*/5 * * * *', () => {
  logger.debug('Scheduler health check', {
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

/**
 * 优雅关闭
 */
async function gracefulShutdown() {
  logger.info('Shutting down scheduler...');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

logger.info('Task Scheduler ready', {
  timezone: process.env.TZ || 'Asia/Shanghai',
  schedules: [
    'Daily anomaly detection: 9:00 AM',
    'Daily report: 8:00 AM',
    'Weekly trends: Monday 10:00 AM'
  ]
});

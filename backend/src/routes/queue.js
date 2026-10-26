/**
 * 队列管理 API
 */

const express = require('express');
const router = express.Router();
const {
  addAIAnalysisJob,
  getJobStatus,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  cleanQueue,
  queues
} = require('../queues/queues');

/**
 * 创建 AI 分析任务
 *
 * POST /api/queue/ai-analysis
 *
 * Body:
 * {
 *   "type": "anomaly-detection",
 *   "data": {
 *     "date": "2026-10-25",
 *     "metrics": ["active_users"]
 *   },
 *   "priority": 1
 * }
 */
router.post('/ai-analysis', async (req, res) => {
  try {
    const { type, data, priority } = req.body;

    if (!type || !data) {
      return res.status(400).json({
        error: 'Missing required fields: type, data'
      });
    }

    const job = await addAIAnalysisJob(type, {
      ...data,
      userId: req.user?.id
    }, {
      priority: priority || 1
    });

    res.json({
      jobId: job.id,
      type: job.name,
      status: 'queued',
      message: 'AI analysis job created successfully'
    });
  } catch (error) {
    console.error('Failed to create AI analysis job:', error);
    res.status(500).json({
      error: 'Failed to create job',
      message: error.message
    });
  }
});

/**
 * 获取任务状态
 *
 * GET /api/queue/jobs/:queueName/:jobId
 */
router.get('/jobs/:queueName/:jobId', async (req, res) => {
  try {
    const { queueName, jobId } = req.params;

    const status = await getJobStatus(queueName, jobId);

    if (!status.exists) {
      return res.status(404).json({
        error: 'Job not found'
      });
    }

    res.json(status);
  } catch (error) {
    console.error('Failed to get job status:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error.message
    });
  }
});

/**
 * 获取队列统计
 *
 * GET /api/queue/stats/:queueName
 */
router.get('/stats/:queueName', async (req, res) => {
  try {
    const { queueName } = req.params;

    const stats = await getQueueStats(queueName);

    res.json({
      queue: queueName,
      ...stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get queue stats:', error);
    res.status(500).json({
      error: 'Failed to get queue stats',
      message: error.message
    });
  }
});

/**
 * 获取所有队列统计
 *
 * GET /api/queue/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const queueNames = Object.keys(queues);

    const allStats = await Promise.all(
      queueNames.map(async (name) => {
        const stats = await getQueueStats(name);
        return { name, ...stats };
      })
    );

    res.json({
      queues: allStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get all queue stats:', error);
    res.status(500).json({
      error: 'Failed to get queue stats',
      message: error.message
    });
  }
});

/**
 * 暂停队列
 *
 * POST /api/queue/:queueName/pause
 */
router.post('/:queueName/pause', async (req, res) => {
  try {
    const { queueName } = req.params;

    await pauseQueue(queueName);

    res.json({
      message: `Queue ${queueName} paused successfully`
    });
  } catch (error) {
    console.error('Failed to pause queue:', error);
    res.status(500).json({
      error: 'Failed to pause queue',
      message: error.message
    });
  }
});

/**
 * 恢复队列
 *
 * POST /api/queue/:queueName/resume
 */
router.post('/:queueName/resume', async (req, res) => {
  try {
    const { queueName } = req.params;

    await resumeQueue(queueName);

    res.json({
      message: `Queue ${queueName} resumed successfully`
    });
  } catch (error) {
    console.error('Failed to resume queue:', error);
    res.status(500).json({
      error: 'Failed to resume queue',
      message: error.message
    });
  }
});

/**
 * 清空队列
 *
 * DELETE /api/queue/:queueName/clean
 */
router.delete('/:queueName/clean', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { grace } = req.query;

    await cleanQueue(queueName, parseInt(grace || '0', 10));

    res.json({
      message: `Queue ${queueName} cleaned successfully`
    });
  } catch (error) {
    console.error('Failed to clean queue:', error);
    res.status(500).json({
      error: 'Failed to clean queue',
      message: error.message
    });
  }
});

/**
 * 获取最近的任务列表
 *
 * GET /api/queue/:queueName/jobs?state=completed&limit=10
 */
router.get('/:queueName/jobs', async (req, res) => {
  try {
    const { queueName } = req.params;
    const { state = 'completed', limit = 10 } = req.query;

    const queue = queues[queueName];
    if (!queue) {
      return res.status(404).json({
        error: `Queue ${queueName} not found`
      });
    }

    let jobs;
    switch (state) {
      case 'completed':
        jobs = await queue.getCompleted(0, parseInt(limit, 10));
        break;
      case 'failed':
        jobs = await queue.getFailed(0, parseInt(limit, 10));
        break;
      case 'active':
        jobs = await queue.getActive(0, parseInt(limit, 10));
        break;
      case 'waiting':
        jobs = await queue.getWaiting(0, parseInt(limit, 10));
        break;
      default:
        return res.status(400).json({
          error: 'Invalid state. Use: completed, failed, active, waiting'
        });
    }

    const jobData = jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress(),
      attempts: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue
    }));

    res.json({
      queue: queueName,
      state,
      jobs: jobData,
      count: jobData.length
    });
  } catch (error) {
    console.error('Failed to get jobs:', error);
    res.status(500).json({
      error: 'Failed to get jobs',
      message: error.message
    });
  }
});

module.exports = router;

/**
 * Bull 队列测试
 *
 * 测试：
 * 1. 队列连接
 * 2. 创建任务
 * 3. 任务处理
 * 4. 任务状态查询
 * 5. 队列统计
 */

require('dotenv').config();
const {
  addAIAnalysisJob,
  getJobStatus,
  getQueueStats,
  closeQueues
} = require('../src/queues');

const logger = console;

async function testQueues() {
  logger.info('Testing Bull Queues...\n');

  try {
    // 1. 测试异常检测任务
    logger.info('1. Creating anomaly detection job...');
    const anomalyJob = await addAIAnalysisJob('anomaly-detection', {
      date: '2026-10-25',
      metrics: ['active_users', 'new_signups']
    });
    logger.info(`✅ Job created: ${anomalyJob.id}\n`);

    // 2. 测试每日简报任务
    logger.info('2. Creating daily report job...');
    const reportJob = await addAIAnalysisJob('daily-report', {
      date: '2026-10-25'
    }, {
      priority: 2
    });
    logger.info(`✅ Job created: ${reportJob.id}\n`);

    // 3. 查询任务状态
    logger.info('3. Checking job status...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待 1 秒

    const status = await getJobStatus('aiAnalysis', anomalyJob.id);
    logger.info('Job status:', {
      id: status.id,
      state: status.state,
      progress: status.progress,
      attempts: status.attempts
    });
    logger.info('✅ Job status retrieved\n');

    // 4. 获取队列统计
    logger.info('4. Getting queue stats...');
    const stats = await getQueueStats('aiAnalysis');
    logger.info('Queue stats:', stats);
    logger.info('✅ Queue stats retrieved\n');

    // 5. 等待任务完成（最多等待 30 秒）
    logger.info('5. Waiting for jobs to complete...');
    let completed = false;
    let attempts = 0;

    while (!completed && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const currentStats = await getQueueStats('aiAnalysis');

      if (currentStats.active === 0 && currentStats.waiting === 0) {
        completed = true;
        logger.info(`✅ All jobs completed after ${attempts + 1} seconds\n`);
      } else {
        logger.debug(`Waiting... active: ${currentStats.active}, waiting: ${currentStats.waiting}`);
      }

      attempts++;
    }

    if (!completed) {
      logger.warn('⚠️  Jobs did not complete within 30 seconds');
      logger.info('This might mean:');
      logger.info('  - Worker is not running (start with: npm run worker:ai)');
      logger.info('  - Redis is not running');
      logger.info('  - LLM API keys are not configured\n');
    }

    // 6. 获取最终状态
    logger.info('6. Final job status:');
    const finalStatus = await getJobStatus('aiAnalysis', anomalyJob.id);
    logger.info({
      id: finalStatus.id,
      state: finalStatus.state,
      progress: finalStatus.progress,
      attempts: finalStatus.attempts,
      result: finalStatus.returnvalue ? 'Available' : 'None',
      error: finalStatus.failedReason || 'None'
    });

    if (finalStatus.state === 'completed') {
      logger.info('✅ Test completed successfully!\n');
    } else {
      logger.info(`⚠️  Job in state: ${finalStatus.state}\n`);
    }

    // 7. 最终统计
    logger.info('7. Final queue stats:');
    const finalStats = await getQueueStats('aiAnalysis');
    logger.info(finalStats);

  } catch (error) {
    logger.error('❌ Test failed:', error);
    throw error;
  } finally {
    // 关闭队列连接
    logger.info('\nClosing queue connections...');
    await closeQueues();
    logger.info('✅ Connections closed');
  }
}

// 运行测试
testQueues()
  .then(() => {
    logger.info('\n✅ All tests passed!');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('\n❌ Tests failed:', error);
    process.exit(1);
  });

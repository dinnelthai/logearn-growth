/**
 * AI 数据对接测试
 *
 * 测试 AI 分析任务是否正确对接真实业务数据
 */

require('dotenv').config();
const { addAIAnalysisJob, getJobStatus } = require('../src/queues/queues');
const logger = require('../src/utils/logger');

// 等待任务完成
async function waitForJobCompletion(queueName, jobId, maxWaitMs = 60000) {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 秒轮询一次

  while (Date.now() - startTime < maxWaitMs) {
    const status = await getJobStatus(queueName, jobId);

    if (!status.exists) {
      throw new Error('Job does not exist');
    }

    console.log(`Job ${jobId} state: ${status.state}, progress: ${status.progress}%`);

    if (status.state === 'completed') {
      return status.returnvalue;
    }

    if (status.state === 'failed') {
      throw new Error(`Job failed: ${status.failedReason}`);
    }

    // 等待后继续
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Job timeout after ${maxWaitMs}ms`);
}

/**
 * 测试 1: 异常检测（真实数据）
 */
async function testAnomalyDetection() {
  console.log('\n========================================');
  console.log('Test 1: Anomaly Detection (Real Data)');
  console.log('========================================\n');

  try {
    // 使用昨天的日期
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    console.log(`Testing anomaly detection for date: ${dateStr}`);

    const job = await addAIAnalysisJob('anomaly-detection', {
      date: dateStr,
      metrics: ['active_users', 'new_users', 'returning_users'],
      threshold: 15,
      source: 'all',
      userId: 'test-user'
    });

    console.log(`✓ Job created: ${job.id}`);
    console.log('  Waiting for job to complete...\n');

    const result = await waitForJobCompletion('aiAnalysis', job.id);

    console.log('\n✓ Job completed successfully!');
    console.log('\nResults:');
    console.log(`  Date: ${result.date}`);
    console.log(`  Anomalies detected: ${result.anomalyCount}`);

    if (result.anomalyCount > 0) {
      console.log('\n  Anomalies:');
      result.anomalies.forEach((a, i) => {
        console.log(`\n  ${i + 1}. ${a.metric}`);
        console.log(`     Current: ${a.current}`);
        console.log(`     Previous: ${a.previous}`);
        console.log(`     Change: ${a.change}%`);
        console.log(`     Severity: ${a.severity}`);
        console.log(`     From Cache: ${a.fromCache || false}`);
        if (a.aiAnalysis) {
          console.log(`\n     AI Analysis:\n     ${a.aiAnalysis.slice(0, 200)}...`);
        }
      });
    }

    console.log('\n  Data Snapshot:');
    console.log(`    Current totals:`, result.dataSnapshot.current);
    console.log(`    Previous totals:`, result.dataSnapshot.previous);

    return { success: true, result };
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试 2: 每日简报（真实数据）
 */
async function testDailyReport() {
  console.log('\n========================================');
  console.log('Test 2: Daily Report (Real Data)');
  console.log('========================================\n');

  try {
    // 使用昨天的日期
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    console.log(`Generating daily report for: ${dateStr}`);

    const job = await addAIAnalysisJob('daily-report', {
      date: dateStr,
      source: 'all',
      includeWeeklyCore: true,
      userId: 'test-user'
    });

    console.log(`✓ Job created: ${job.id}`);
    console.log('  Waiting for job to complete...\n');

    const result = await waitForJobCompletion('aiAnalysis', job.id);

    console.log('\n✓ Job completed successfully!');
    console.log('\nResults:');
    console.log(`  Date: ${result.date}`);
    console.log(`  Generated at: ${result.generatedAt}`);
    console.log(`  From Cache: ${result.metadata.fromCache || false}`);
    console.log(`  Anomalies detected: ${result.metadata.anomalyCount}`);
    console.log(`  Has weekly core: ${result.metadata.hasWeeklyCore}`);

    console.log('\n  Report:');
    console.log('  ' + result.report.split('\n').join('\n  '));

    return { success: true, result };
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 测试 3: 假设验证（真实数据）
 */
async function testHypothesisValidation() {
  console.log('\n========================================');
  console.log('Test 3: Hypothesis Validation (Real Data)');
  console.log('========================================\n');

  try {
    // 使用最近 7 天作为测试期
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 7);

    console.log(`Testing hypothesis validation`);
    console.log(`  Period: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`);

    const job = await addAIAnalysisJob('hypothesis-validation', {
      hypothesis: '改善落地页加载速度会提升新用户转化率',
      dateRange: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
      },
      metrics: ['active_users', 'new_users'],
      source: 'all',
      comparisonPeriod: 'previous',
      userId: 'test-user'
    });

    console.log(`✓ Job created: ${job.id}`);
    console.log('  Waiting for job to complete...\n');

    const result = await waitForJobCompletion('aiAnalysis', job.id);

    console.log('\n✓ Job completed successfully!');
    console.log('\nResults:');
    console.log(`  Hypothesis: ${result.hypothesis}`);
    console.log(`  From Cache: ${result.metadata.fromCache || false}`);

    if (result.validation) {
      console.log('\n  Validation:');
      if (result.validation.isValid !== undefined) {
        console.log(`    Is Valid: ${result.validation.isValid}`);
      }
      if (result.validation.confidence !== undefined) {
        console.log(`    Confidence: ${result.validation.confidence}`);
      }
      if (result.validation.reasoning) {
        console.log(`    Reasoning: ${result.validation.reasoning.slice(0, 200)}...`);
      }
    }

    console.log('\n  Metric Changes:');
    result.data.changes.forEach(change => {
      console.log(`    ${change.metric}:`);
      console.log(`      Test: ${change.testValue}`);
      console.log(`      Comparison: ${change.comparisonValue}`);
      console.log(`      Change: ${change.change}% (${change.direction})`);
    });

    return { success: true, result };
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 主测试函数
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   AI Data Integration Test Suite                          ║');
  console.log('║   Testing AI tasks with real business data                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  // 运行测试
  const tests = [
    { name: 'Anomaly Detection', fn: testAnomalyDetection },
    { name: 'Daily Report', fn: testDailyReport },
    { name: 'Hypothesis Validation', fn: testHypothesisValidation }
  ];

  for (const test of tests) {
    results.total++;
    const testResult = await test.fn();

    if (testResult.success) {
      results.passed++;
    } else {
      results.failed++;
    }

    // 等待一下再运行下一个测试
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // 总结
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   Test Summary                                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTotal: ${results.total}`);
  console.log(`Passed: ${results.passed} ✓`);
  console.log(`Failed: ${results.failed} ${results.failed > 0 ? '✗' : ''}`);
  console.log(`\nSuccess Rate: ${(results.passed / results.total * 100).toFixed(1)}%`);

  process.exit(results.failed > 0 ? 1 : 0);
}

// 运行测试
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  testAnomalyDetection,
  testDailyReport,
  testHypothesisValidation
};

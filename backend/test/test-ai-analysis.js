#!/usr/bin/env node
/**
 * AI 业务分析完整流程测试
 *
 * 测试场景：
 * 1. 创建分析任务
 * 2. 轮询任务状态
 * 3. 获取分析结果和建议
 * 4. 更新建议状态为已执行
 * 5. 触发复盘分析
 * 6. 查看复盘结果
 *
 * 使用方式:
 * node test/test-ai-analysis.js
 *
 * 环境变量:
 * API_BASE_URL=http://localhost:3001
 * TEST_USER_EMAIL=admin@logearn.com
 * TEST_USER_PASSWORD=admin123
 */

require('dotenv').config();
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'admin@logearn.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'admin123';

let authToken = null;

/**
 * HTTP 请求封装
 */
async function request(method, path, body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`HTTP ${response.status}: ${error.error || error.message}`);
  }

  return response.json();
}

/**
 * 1. 登录获取 token
 */
async function login() {
  console.log('🔐 Logging in...');
  const result = await request('POST', '/api/auth/login', {
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD
  });

  authToken = result.token;
  console.log('✅ Logged in successfully\n');
}

/**
 * 2. 创建分析任务
 */
async function createAnalysis() {
  console.log('📊 Creating analysis task...');

  const now = Date.now();
  const dayMs = 86400000;
  const dateRangeEnd = now - dayMs; // 昨天
  const dateRangeStart = dateRangeEnd - 7 * dayMs; // 7天前

  const params = {
    title: `测试分析 - ${new Date().toISOString()}`,
    analysisType: 'optimization',
    dateRangeStart,
    dateRangeEnd,
    businessScope: {
      source: 'all'
    },
    userQuestion: '如何提升新用户的激活率？',
    focusGoal: 'activation'
  };

  const result = await request('POST', '/api/ai-analysis/analyze', params);

  console.log(`✅ Analysis created:`);
  console.log(`   - Analysis ID: ${result.analysisId}`);
  console.log(`   - Job ID: ${result.jobId}`);
  console.log(`   - Status: ${result.status}\n`);

  return result;
}

/**
 * 3. 轮询任务状态
 */
async function pollJobStatus(jobId, maxAttempts = 60, interval = 2000) {
  console.log(`⏳ Polling job status (max ${maxAttempts} attempts, interval ${interval}ms)...`);

  for (let i = 0; i < maxAttempts; i++) {
    const status = await request('GET', `/api/ai-analysis/jobs/${jobId}/status`);

    process.stdout.write(`   [${i + 1}/${maxAttempts}] State: ${status.state}, Progress: ${status.progress}%\r`);

    if (status.state === 'completed') {
      console.log('\n✅ Job completed!');
      console.log(`   Duration: ~${i * interval / 1000}s`);
      console.log(`   Result:`, JSON.stringify(status.result, null, 2), '\n');
      return status.result;
    }

    if (status.state === 'failed') {
      console.error('\n❌ Job failed:', status.error);
      throw new Error(status.error);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Job timeout');
}

/**
 * 4. 获取分析详情
 */
async function getAnalysisDetails(analysisId) {
  console.log('📋 Fetching analysis details...');

  const analysis = await request('GET', `/api/ai-analysis/${analysisId}`);

  console.log(`✅ Analysis details:`);
  console.log(`   - Title: ${analysis.title}`);
  console.log(`   - Status: ${analysis.status}`);
  console.log(`   - Suggestions: ${analysis.suggestions?.length || 0}`);
  console.log(`   - Cost: $${analysis.cost_usd || 0}\n`);

  if (analysis.suggestions && analysis.suggestions.length > 0) {
    console.log('💡 Suggestions:');
    analysis.suggestions.forEach((s, i) => {
      console.log(`   ${i + 1}. [${s.priority}] ${s.business_problem}`);
      console.log(`      Action: ${s.action.substring(0, 80)}...`);
      console.log(`      Status: ${s.user_status}`);
    });
    console.log('');
  }

  return analysis;
}

/**
 * 5. 更新建议状态为已执行
 */
async function markSuggestionAsExecuted(suggestionId) {
  console.log('✏️  Marking suggestion as executed...');

  const result = await request('PUT', `/api/ai-analysis/suggestions/${suggestionId}/status`, {
    userStatus: 'executed',
    actualAction: '已实施：在新用户首次登录后增加3步引导任务',
    actionScope: {
      targetUsers: 'new_users',
      startDate: Date.now()
    },
    executedAt: Date.now()
  });

  console.log(`✅ Suggestion marked as executed`);
  console.log(`   - Status: ${result.user_status}`);
  console.log(`   - Executed at: ${new Date(result.executed_at).toISOString()}\n`);

  return result;
}

/**
 * 6. 触发复盘分析
 */
async function createRetrospective(suggestionId) {
  console.log('🔍 Creating retrospective analysis...');

  const result = await request('POST', `/api/ai-analysis/suggestions/${suggestionId}/retrospective`);

  console.log(`✅ Retrospective created:`);
  console.log(`   - Retrospective ID: ${result.retrospectiveId}`);
  console.log(`   - Job ID: ${result.jobId}\n`);

  return result;
}

/**
 * 7. 获取分析列表
 */
async function listAnalyses() {
  console.log('📚 Fetching analysis list...');

  const result = await request('GET', '/api/ai-analysis/list?limit=5');

  console.log(`✅ Found ${result.count} analyses:`);
  result.records.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.title} (${r.status})`);
    console.log(`      Created: ${new Date(r.created_at).toISOString()}`);
    console.log(`      Suggestions: ${r.suggestion_count}, Executed: ${r.executed_count}`);
  });
  console.log('');
}

/**
 * 8. 获取成本统计
 */
async function getCostStats() {
  console.log('💰 Fetching cost statistics...');

  const stats = await request('GET', '/api/ai-analysis/cost-stats');

  console.log(`✅ Cost statistics:`);
  console.log(`   - Total calls: ${stats.total_calls}`);
  console.log(`   - Total cost: $${stats.total_cost}`);
  console.log(`   - Total tokens: ${stats.total_tokens}`);
  console.log(`   - Avg duration: ${stats.avg_duration_ms}ms`);
  console.log(`   - Cache hits: ${stats.cache_hits}\n`);
}

/**
 * 主测试流程
 */
async function main() {
  console.log('🚀 Starting AI Analysis Integration Test\n');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 登录
    await login();

    // 2. 创建分析
    const { analysisId, jobId } = await createAnalysis();

    // 3. 轮询任务状态
    await pollJobStatus(jobId);

    // 4. 获取分析详情
    const analysis = await getAnalysisDetails(analysisId);

    // 5. 如果有建议，测试更新状态
    if (analysis.suggestions && analysis.suggestions.length > 0) {
      const firstSuggestion = analysis.suggestions[0];

      // 标记为已执行
      await markSuggestionAsExecuted(firstSuggestion.id);

      // 注意：复盘需要执行后至少观察3天，这里仅演示 API 调用
      // 实际测试中会因为观察期不足而失败
      console.log('⚠️  Note: Retrospective requires at least 3 days of observation.');
      console.log('   Skipping retrospective test in this quick demo.\n');

      // 如果要测试复盘，取消下面的注释（需要等待3天）
      // try {
      //   const { jobId: retroJobId } = await createRetrospective(firstSuggestion.id);
      //   await pollJobStatus(retroJobId);
      // } catch (error) {
      //   console.error('   Expected error:', error.message, '\n');
      // }
    }

    // 6. 获取分析列表
    await listAnalyses();

    // 7. 获取成本统计
    await getCostStats();

    console.log('='.repeat(60));
    console.log('✅ All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  main();
}

module.exports = { main };

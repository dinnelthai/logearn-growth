#!/usr/bin/env node
/**
 * Redis 缓存测试脚本
 *
 * 使用方式：
 * 1. 启动 Redis: docker run -d -p 6379:6379 redis:alpine
 *    或本地: redis-server
 * 2. 运行测试: node test-cache.js
 */

require('dotenv').config();
const { llmCache, dataCache, rateLimit, redis } = require('../src/cache');
const { createClient } = require('../src/ai/llm');

async function testRedisConnection() {
  console.log('\n=== 测试 Redis 连接 ===');

  const health = await redis.checkHealth();
  console.log('Redis 健康状态:', health);

  if (!health.connected) {
    console.error('❌ Redis 未连接！');
    console.error('请先启动 Redis:');
    console.error('  - Docker: docker run -d -p 6379:6379 redis:alpine');
    console.error('  - 本地: redis-server');
    process.exit(1);
  }

  console.log('✅ Redis 连接成功');
}

async function testLLMCache() {
  console.log('\n=== 测试 LLM 缓存 ===');

  const messages = [
    { role: 'user', content: '什么是增长分析？' }
  ];

  console.log('1. 清空缓存...');
  await llmCache.clear();

  console.log('2. 第一次调用（无缓存）...');
  const start1 = Date.now();
  const client = createClient({ model: 'gpt-4o-mini' });

  const response1 = await client.chat(messages);
  const duration1 = Date.now() - start1;

  console.log(`   耗时: ${duration1}ms`);
  console.log(`   Tokens: ${response1.usage.totalTokens}`);
  console.log(`   成本: $${client.calculateCost(response1.usage).toFixed(6)}`);
  console.log(`   缓存: ${response1.fromCache ? '命中' : '未命中'}`);

  console.log('3. 第二次调用（应该命中缓存）...');
  const start2 = Date.now();
  const response2 = await client.chat(messages);
  const duration2 = Date.now() - start2;

  console.log(`   耗时: ${duration2}ms`);
  console.log(`   Tokens: ${response2.usage.totalTokens}`);
  console.log(`   缓存: ${response2.fromCache ? '✅ 命中' : '❌ 未命中'}`);

  if (response2.fromCache) {
    console.log(`   🚀 加速: ${(duration1 / duration2).toFixed(1)}x`);
    console.log(`   💰 节省: $${client.calculateCost(response1.usage).toFixed(6)}`);
  }

  console.log('4. 获取缓存统计...');
  const stats = await llmCache.getStats();
  console.log('   缓存条目:', stats.entries);
  console.log('   总成本节省:', `$${stats.totalSavings.toFixed(6)}`);
}

async function testDataCache() {
  console.log('\n=== 测试数据缓存 ===');

  const metric = 'active_users';
  const date = '2026-10-26';
  const testData = {
    total: 1234,
    change: -15,
    breakdown: {
      new: 456,
      returning: 778
    }
  };

  console.log('1. 设置缓存...');
  await dataCache.set(metric, date, 'all', testData);
  console.log('   ✅ 已缓存');

  console.log('2. 读取缓存...');
  const cached = await dataCache.get(metric, date, 'all');
  console.log('   缓存命中:', cached ? '✅' : '❌');
  console.log('   数据:', cached.data);

  console.log('3. 批量操作...');
  await dataCache.mset([
    { metric, date, dimension: 'channel_twitter', data: { value: 100 } },
    { metric, date, dimension: 'channel_facebook', data: { value: 200 } }
  ]);

  const results = await dataCache.mget([
    { metric, date, dimension: 'channel_twitter' },
    { metric, date, dimension: 'channel_facebook' }
  ]);
  console.log('   批量读取:', results.filter(Boolean).length, '条命中');

  console.log('4. 使缓存失效...');
  const invalidated = await dataCache.invalidate(metric, date);
  console.log('   ✅ 已清除', invalidated, '条');
}

async function testRateLimit() {
  console.log('\n=== 测试速率限制 ===');

  const key = 'test-user';
  const limit = 5;

  console.log('1. 重置计数...');
  await rateLimit.reset(key);

  console.log(`2. 模拟 ${limit + 2} 次请求（限制 ${limit}/小时）...`);

  for (let i = 1; i <= limit + 2; i++) {
    const result = await rateLimit.checkLimit(key, limit, 60); // 1 分钟窗口

    if (result.allowed) {
      console.log(`   请求 ${i}: ✅ 允许 (剩余: ${result.remaining})`);
    } else {
      console.log(`   请求 ${i}: ❌ 限流 (${result.resetIn}s 后重置)`);
    }
  }

  console.log('3. 重置限制...');
  await rateLimit.reset(key);
  console.log('   ✅ 已重置');
}

async function testBenchmark() {
  console.log('\n=== 性能基准测试 ===');

  const messages = [
    { role: 'user', content: '简短回答：今天星期几？' }
  ];

  const client = createClient({ model: 'gpt-4o-mini' });

  // 清空缓存
  await llmCache.clear();

  // 无缓存
  console.log('1. 无缓存调用（5 次）...');
  const noCacheTimes = [];
  for (let i = 0; i < 5; i++) {
    const testMsg = [{ role: 'user', content: `测试${i}: 1+1=?` }];
    const start = Date.now();
    await client.chat(testMsg);
    noCacheTimes.push(Date.now() - start);
  }
  const avgNoCache = noCacheTimes.reduce((a, b) => a + b) / noCacheTimes.length;
  console.log(`   平均耗时: ${avgNoCache.toFixed(0)}ms`);

  // 有缓存
  console.log('2. 有缓存调用（5 次）...');
  const cacheTimes = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    await client.chat([{ role: 'user', content: '测试0: 1+1=?' }]); // 复用第一个
    cacheTimes.push(Date.now() - start);
  }
  const avgCache = cacheTimes.reduce((a, b) => a + b) / cacheTimes.length;
  console.log(`   平均耗时: ${avgCache.toFixed(0)}ms`);

  console.log('3. 加速比:', `${(avgNoCache / avgCache).toFixed(1)}x`);
}

async function main() {
  console.log('🚀 Redis 缓存测试开始');
  console.log('='.repeat(50));

  try {
    await testRedisConnection();
    await testLLMCache();
    await testDataCache();
    await testRateLimit();
    await testBenchmark();

    console.log('\n' + '='.repeat(50));
    console.log('✅ 所有测试通过！');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    redis.disconnect();
    process.exit(0);
  }
}

main();

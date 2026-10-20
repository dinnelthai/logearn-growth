/**
 * 批量查询接口手动测试
 *
 * 运行方式:
 * TOKEN=your_jwt_token node test/batchAnalytics.manual.test.js
 *
 * 或使用已登录的 cookie:
 * node test/batchAnalytics.manual.test.js
 */

const http = require('http')

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const TOKEN = process.env.TOKEN || ''

// 测试时间范围 (最近 14 天)
const end = Date.now()
const start = end - 14 * 24 * 3600 * 1000

/**
 * 发送 HTTP 请求
 */
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE)
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    }

    if (TOKEN) {
      options.headers['Authorization'] = `Bearer ${TOKEN}`
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(data)
          })
        } catch (err) {
          reject(new Error(`Failed to parse response: ${data}`))
        }
      })
    })

    req.on('error', reject)

    if (body) {
      req.write(JSON.stringify(body))
    }

    req.end()
  })
}

/**
 * 测试 1: 单个查询
 */
async function testSingleQuery() {
  console.log('\n=== 测试 1: 单个查询 (home-overview) ===')

  const startTime = Date.now()

  const response = await request('POST', '/api/batch-analytics', {
    queries: [
      { type: 'home-overview', params: { start, end } }
    ]
  })

  const duration = Date.now() - startTime

  console.log(`状态码: ${response.status}`)
  console.log(`耗时: ${duration}ms`)
  console.log(`Snapshot ID: ${response.body.snapshot_id}`)
  console.log(`Results: ${response.body.results.length}`)

  if (response.body.results[0].status === 'fulfilled') {
    console.log('✓ home-overview 成功')
  } else {
    console.error('✗ home-overview 失败:', response.body.results[0].error)
  }
}

/**
 * 测试 2: 批量查询 (首页看板)
 */
async function testBatchQueries() {
  console.log('\n=== 测试 2: 批量查询 (首页看板 3 个指标) ===')

  const startTime = Date.now()

  const response = await request('POST', '/api/batch-analytics', {
    queries: [
      { type: 'home-overview', params: { start, end } },
      { type: 'growth-insights', params: { start, end, source: 'all' } },
      { type: 'channels', params: { start, end, source: 'all' } },
    ]
  })

  const duration = Date.now() - startTime

  console.log(`状态码: ${response.status}`)
  console.log(`总耗时: ${duration}ms`)
  console.log(`平均耗时: ${Math.round(duration / 3)}ms/query`)
  console.log(`Snapshot ID: ${response.body.snapshot_id}`)

  response.body.results.forEach((result, i) => {
    const status = result.status === 'fulfilled' ? '✓' : '✗'
    console.log(`${status} ${result.type}: ${result.status}`)
    if (result.error) {
      console.error(`  Error: ${result.error.message}`)
    }
  })
}

/**
 * 测试 3: 错误处理
 */
async function testErrorHandling() {
  console.log('\n=== 测试 3: 错误处理 ===')

  // 3.1 不支持的查询类型
  console.log('\n3.1 不支持的查询类型')
  const res1 = await request('POST', '/api/batch-analytics', {
    queries: [
      { type: 'invalid-type', params: {} }
    ]
  })
  console.log(`状态码: ${res1.status}`)
  console.log(`结果: ${res1.body.results[0].status}`)
  console.log(`错误: ${res1.body.results[0].error?.message}`)

  // 3.2 查询数量超限
  console.log('\n3.2 查询数量超限 (> 10)')
  const res2 = await request('POST', '/api/batch-analytics', {
    queries: Array(11).fill({ type: 'status', params: {} })
  })
  console.log(`状态码: ${res2.status}`)
  console.log(`错误: ${res2.body.error}`)

  // 3.3 部分失败 + 部分成功
  console.log('\n3.3 部分失败 + 部分成功')
  const res3 = await request('POST', '/api/batch-analytics', {
    queries: [
      { type: 'status', params: {} },  // 成功
      { type: 'invalid', params: {} }, // 失败
      { type: 'home-overview', params: { start, end } }, // 成功
    ]
  })
  console.log(`状态码: ${res3.status}`)
  res3.body.results.forEach((result, i) => {
    const status = result.status === 'fulfilled' ? '✓' : '✗'
    console.log(`${status} Query ${i + 1} (${result.type}): ${result.status}`)
  })
}

/**
 * 测试 4: 性能对比 (批量 vs 单独)
 */
async function testPerformance() {
  console.log('\n=== 测试 4: 性能对比 (批量 vs 单独) ===')

  const queries = [
    { type: 'home-overview', params: { start, end } },
    { type: 'channels', params: { start, end } },
  ]

  // 单独请求
  console.log('\n4.1 单独请求 (串行)')
  const startSingle = Date.now()
  for (const query of queries) {
    await request('POST', '/api/batch-analytics', { queries: [query] })
  }
  const durationSingle = Date.now() - startSingle
  console.log(`总耗时: ${durationSingle}ms`)

  // 批量请求
  console.log('\n4.2 批量请求 (并行)')
  const startBatch = Date.now()
  await request('POST', '/api/batch-analytics', { queries })
  const durationBatch = Date.now() - startBatch
  console.log(`总耗时: ${durationBatch}ms`)

  // 对比
  const improvement = ((1 - durationBatch / durationSingle) * 100).toFixed(1)
  console.log(`\n性能提升: ${improvement}% (${durationSingle}ms → ${durationBatch}ms)`)
}

/**
 * 主测试流程
 */
async function main() {
  console.log('=================================================')
  console.log('批量查询接口测试')
  console.log('=================================================')
  console.log(`API Base: ${API_BASE}`)
  console.log(`Token: ${TOKEN ? '✓ 已设置' : '✗ 未设置 (可能需要登录)'}`)
  console.log(`时间范围: ${new Date(start).toISOString()} ~ ${new Date(end).toISOString()}`)

  try {
    await testSingleQuery()
    await testBatchQueries()
    await testErrorHandling()
    await testPerformance()

    console.log('\n=================================================')
    console.log('✓ 所有测试完成')
    console.log('=================================================')
  } catch (err) {
    console.error('\n✗ 测试失败:', err.message)
    if (err.message.includes('ECONNREFUSED')) {
      console.error('\n请确保后端服务已启动: cd backend && npm start')
    } else if (err.code === 401 || err.code === 403) {
      console.error('\n请设置有效的 TOKEN: TOKEN=your_jwt_token node test/batchAnalytics.manual.test.js')
    }
    process.exit(1)
  }
}

// 运行测试
if (require.main === module) {
  main()
}

module.exports = { request, testSingleQuery, testBatchQueries }

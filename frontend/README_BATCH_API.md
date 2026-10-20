# 批量查询 API 使用指南

## 概述

批量查询接口允许在单次 HTTP 请求中并行获取多个分析指标，大幅减少网络往返延迟。

**优势:**
- 3 个串行请求 (3 RTT) → 1 个并行请求 (1 RTT)
- 错误隔离：部分查询失败不影响其他查询
- 共享快照：所有查询基于同一数据快照，保证一致性

---

## 快速开始

### 方式 1: 使用预设方法 (推荐)

```javascript
import { fetchHomeDashboard } from './api/batchAnalytics.js'

// 获取首页看板数据 (总览 + 增长诊断 + 来源质量)
async function loadHomePage() {
  const start = Date.now() - 14 * 24 * 3600 * 1000  // 14 天前
  const end = Date.now()

  try {
    const result = await fetchHomeDashboard(start, end, 'all')

    // 检查错误
    if (result.errors.length > 0) {
      console.warn('部分查询失败:', result.errors)
    }

    // 使用数据
    renderOverview(result.overview)
    renderGrowthInsights(result.growthInsights)
    renderChannels(result.channels)

    console.log('快照 ID:', result.snapshot_id)
    console.log('数据截至:', result.as_of)
  } catch (err) {
    console.error('批量查询失败:', err)
  }
}
```

### 方式 2: 自定义查询组合

```javascript
import { batchQuery } from './api/batchAnalytics.js'

async function loadCustomDashboard() {
  const start = Date.now() - 7 * 24 * 3600 * 1000
  const end = Date.now()

  const result = await batchQuery([
    { type: 'funnel', params: {
      steps: ['daily_visit', 'chip', 'chip_detail'],
      start, end,
      hours: 24,
      association: 'user'
    }},
    { type: 'retention', params: {
      initial: 'chip',
      returning: 'chip',
      start, end
    }},
    { type: 'trade-monitor', params: {
      start, end,
      chain: 'all'
    }}
  ])

  // 处理结果
  result.results.forEach(r => {
    if (r.status === 'fulfilled') {
      console.log(`✓ ${r.type}:`, r.data)
    } else {
      console.error(`✗ ${r.type}:`, r.error)
    }
  })
}
```

---

## 支持的查询类型

| 类型 | 说明 | 参数 |
|------|------|------|
| `status` | 数据快照状态 | - |
| `home-overview` | 首页概况 | `start`, `end`, `source` |
| `growth-insights` | 增长诊断 | `start`, `end`, `source` |
| `channels` | 来源质量 | `start`, `end`, `source` |
| `funnel` | 漏斗转化 | `steps`, `start`, `end`, `hours`, `association`, `source` |
| `retention` | 留存分析 | `initial`, `returning`, `start`, `end`, `source` |
| `trade-monitor` | 交易监控 | `start`, `end`, `source`, `chain` |
| `referral` | 推荐贡献 | `start`, `end`, `source`, `scope`, `quality` |

完整参数说明见 `backend/src/routes/batchAnalytics.js`

---

## 预设查询方法

### 1. 首页看板

```javascript
import { fetchHomeDashboard } from './api/batchAnalytics.js'

const { overview, growthInsights, channels, errors } =
  await fetchHomeDashboard(start, end, source)
```

**包含:**
- 总览 (home-overview)
- 增长诊断 (growth-insights)
- 来源质量 (channels)

### 2. 获客看板

```javascript
import { fetchAcquisitionDashboard } from './api/batchAnalytics.js'

const { channels, referral, errors } =
  await fetchAcquisitionDashboard(start, end, source)
```

**包含:**
- 来源质量 (channels)
- 推荐贡献 (referral)

### 3. 转化看板

```javascript
import { fetchConversionDashboard } from './api/batchAnalytics.js'

const { funnel, retention, errors } = await fetchConversionDashboard({
  start,
  end,
  source: 'all',
  funnelSteps: ['daily_visit', 'chip', 'chip_detail'],
  retentionInitial: 'chip',
  retentionReturning: 'chip'
})
```

**包含:**
- 漏斗转化 (funnel) - 可选
- 留存分析 (retention) - 可选

---

## 迁移现有代码

### 迁移前 (单独请求)

```javascript
// ❌ 3 个串行请求 = 3 RTT
async function loadDashboard() {
  const overview = await fetch('/api/analytics/home-overview', ...)
  const growth = await fetch('/api/analytics/growth-insights', ...)
  const channels = await fetch('/api/analytics/channels', ...)

  // 总耗时 = T1 + T2 + T3 (假设各 500ms = 1500ms)
}
```

### 迁移后 (批量请求)

```javascript
// ✅ 1 个并行请求 = 1 RTT
import { fetchHomeDashboard } from './api/batchAnalytics.js'

async function loadDashboard() {
  const { overview, growthInsights, channels } =
    await fetchHomeDashboard(start, end)

  // 总耗时 ≈ max(T1, T2, T3) + 网络 (约 600ms)
  // 性能提升 60%+
}
```

---

## 错误处理

### 全部成功

```javascript
const result = await fetchHomeDashboard(start, end)

if (result.errors.length === 0) {
  // 所有查询成功
  console.log('数据已就绪')
}
```

### 部分失败

```javascript
const result = await fetchHomeDashboard(start, end)

if (result.errors.length > 0) {
  // 部分查询失败
  result.errors.forEach(({ type, error }) => {
    console.warn(`${type} 失败:`, error.message)
  })
}

// 仍然可以使用成功的数据
if (result.overview) {
  renderOverview(result.overview)
}
```

### 完全失败

```javascript
try {
  const result = await fetchHomeDashboard(start, end)
} catch (err) {
  // 网络错误或服务器错误
  console.error('批量查询失败:', err.message)
  showErrorMessage('数据加载失败，请稍后重试')
}
```

---

## 性能优化建议

### 1. 合并相关查询

```javascript
// ✅ 好: 一次获取所有首页数据
const dashboard = await fetchHomeDashboard(start, end)

// ❌ 差: 分开请求
const overview = await fetch('/api/analytics/home-overview', ...)
const growth = await fetch('/api/analytics/growth-insights', ...)
```

### 2. 复用快照 ID

```javascript
// 第一次查询
const result1 = await fetchHomeDashboard(start, end)
const snapshotId = result1.snapshot_id

// 后续查询使用同一快照 (保证数据一致性)
const result2 = await batchQuery([
  { type: 'funnel', params: { ... } }
], snapshotId)
```

### 3. 避免过多查询

```javascript
// ✅ 好: 批量查询 3-5 个相关指标
const result = await batchQuery([...3 queries])

// ❌ 差: 一次查询 10+ 个指标 (超过限制)
// 最多 10 个，建议 ≤ 5 个
```

### 4. 并行独立请求

```javascript
// 如果两组查询完全独立，可以并行发送
const [dashboard1, dashboard2] = await Promise.all([
  fetchHomeDashboard(start1, end1),
  fetchAcquisitionDashboard(start2, end2)
])
```

---

## 调试技巧

### 1. 查看快照信息

```javascript
const result = await fetchHomeDashboard(start, end)

console.log('快照 ID:', result.snapshot_id)
console.log('数据截至:', new Date(result.as_of))
console.log('查询结果:', result.results.map(r => r.type))
```

### 2. 测量性能

```javascript
console.time('批量查询')
const result = await fetchHomeDashboard(start, end)
console.timeEnd('批量查询')

// 输出: 批量查询: 523.456ms
```

### 3. 使用 Network 面板

打开 Chrome DevTools → Network，查看:
- Request Payload: 发送的查询列表
- Response: 各查询的结果和状态
- Timing: 实际耗时

---

## 后端监控

### 查看缓存统计

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/system/metrics
```

**响应示例:**
```json
{
  "cache": {
    "l1": {
      "keys": 128,
      "hits": 456,
      "misses": 89,
      "hit_rate": "83.67%",
      "memory_kb": 2048
    },
    "total_sets": 234,
    "pending_requests": 2
  },
  "memory": {
    "rss_mb": 256,
    "heap_used_mb": 128
  }
}
```

### 刷新缓存

```bash
# 清空所有缓存
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/system/metrics/flush-cache
```

---

## 常见问题

### Q1: 批量查询会超时吗?

A: 后端会并行执行所有查询，总耗时 ≈ 最慢的那个查询。如果某个查询 > 10s 超时，会返回错误但不影响其他查询。

### Q2: 部分失败会影响其他查询吗?

A: 不会。使用 `Promise.allSettled()` 确保错误隔离。

### Q3: 可以查询不同的时间范围吗?

A: 可以。每个查询的 `params` 独立，可以设置不同的 `start`/`end`。

### Q4: 快照 ID 有效期多久?

A: 默认 15 分钟。过期后需要重新查询。

### Q5: 如何调试单个查询?

A: 使用单个查询的批量接口:
```javascript
const result = await batchQuery([
  { type: 'funnel', params: {...} }
])
```

---

## 示例: 完整的页面加载流程

```javascript
import { fetchHomeDashboard } from './api/batchAnalytics.js'

class HomePage {
  async load() {
    // 1. 显示加载状态
    this.showLoading()

    try {
      // 2. 批量获取数据
      const start = Date.now() - 14 * 24 * 3600 * 1000
      const end = Date.now()

      const result = await fetchHomeDashboard(start, end, 'all')

      // 3. 检查错误
      if (result.errors.length > 0) {
        console.warn('部分数据加载失败:', result.errors)
        this.showPartialError(result.errors)
      }

      // 4. 渲染数据
      if (result.overview) {
        this.renderOverview(result.overview)
      }

      if (result.growthInsights) {
        this.renderGrowthInsights(result.growthInsights)
      }

      if (result.channels) {
        this.renderChannels(result.channels)
      }

      // 5. 保存快照信息 (供后续查询使用)
      this.snapshotId = result.snapshot_id
      this.dataAsOf = result.as_of

      // 6. 隐藏加载状态
      this.hideLoading()

    } catch (err) {
      // 7. 处理完全失败
      console.error('数据加载失败:', err)
      this.showError('无法加载数据，请刷新页面重试')
    }
  }
}
```

---

## 相关文档

- 后端实现: `backend/src/routes/batchAnalytics.js`
- 前端客户端: `frontend/src/api/batchAnalytics.js`
- 测试脚本: `backend/test/batchAnalytics.manual.test.js`
- 性能优化: `docs/PERFORMANCE_OPTIMIZATION.md`

---

**最后更新:** 2024-10-20  
**维护者:** 增长团队

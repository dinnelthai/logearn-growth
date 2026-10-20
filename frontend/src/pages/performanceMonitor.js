/**
 * 性能监控面板
 *
 * 用途: 实时查看后端缓存统计、内存占用、慢查询等
 * 访问: /performance (需要管理员权限)
 *
 * 功能:
 * - 缓存命中率可视化
 * - 内存占用趋势
 * - 刷新缓存操作
 * - 实时自动刷新 (每 5 秒)
 */

import { getApiUrl, getAuthHeaders } from '../api/backendAnalytics.js'

/**
 * 获取系统指标
 */
async function fetchMetrics() {
  const url = `${getApiUrl()}/system/metrics`
  const response = await fetch(url, { headers: getAuthHeaders() })

  if (!response.ok) {
    throw new Error(`获取指标失败: ${response.statusText}`)
  }

  return response.json()
}

/**
 * 刷新缓存
 */
async function flushCache() {
  const url = `${getApiUrl()}/system/metrics/flush-cache`
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`刷新缓存失败: ${response.statusText}`)
  }

  return response.json()
}

/**
 * 重置统计
 */
async function resetStats() {
  const url = `${getApiUrl()}/system/metrics/reset`
  const response = await fetch(url, {
    method: 'POST',
    headers: getAuthHeaders(),
  })

  if (!response.ok) {
    throw new Error(`重置统计失败: ${response.statusText}`)
  }

  return response.json()
}

/**
 * 格式化字节数
 */
function formatBytes(kb) {
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(2)} MB`
}

/**
 * 格式化时长
 */
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

/**
 * 渲染指标卡片
 */
function renderMetricCard(title, value, subtitle = '', color = '#3b82f6') {
  return `
    <div class="metric-card" style="border-left: 4px solid ${color}">
      <div class="metric-title">${title}</div>
      <div class="metric-value">${value}</div>
      ${subtitle ? `<div class="metric-subtitle">${subtitle}</div>` : ''}
    </div>
  `
}

/**
 * 渲染进度条
 */
function renderProgress(label, value, max, color = '#3b82f6') {
  const percent = Math.round((value / max) * 100)
  return `
    <div class="progress-item">
      <div class="progress-label">
        <span>${label}</span>
        <span>${value} / ${max} (${percent}%)</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percent}%; background: ${color}"></div>
      </div>
    </div>
  `
}

/**
 * 渲染性能监控页面
 */
function render(metrics, history = []) {
  const { cache, memory, uptime_seconds, timestamp } = metrics

  // 缓存命中率颜色
  const hitRateValue = parseFloat(cache.l1.hit_rate)
  const hitRateColor = hitRateValue >= 80 ? '#10b981' :
                       hitRateValue >= 60 ? '#f59e0b' : '#ef4444'

  // 内存占用颜色
  const memPercent = (memory.heap_used_mb / memory.heap_total_mb) * 100
  const memColor = memPercent < 70 ? '#10b981' :
                   memPercent < 85 ? '#f59e0b' : '#ef4444'

  return `
    <div class="performance-monitor">
      <div class="monitor-header">
        <div>
          <h1>性能监控面板</h1>
          <p class="monitor-subtitle">
            实时追踪系统性能 · 运行时长 ${formatDuration(uptime_seconds)} ·
            最后更新 ${new Date(timestamp).toLocaleTimeString()}
          </p>
        </div>
        <div class="monitor-actions">
          <button id="pm-refresh" class="btn-primary">刷新数据</button>
          <button id="pm-reset-stats" class="btn-secondary">重置统计</button>
          <button id="pm-flush-cache" class="btn-danger">清空缓存</button>
        </div>
      </div>

      <!-- 缓存统计 -->
      <section class="monitor-section">
        <h2>缓存统计 (L1 内存)</h2>
        <div class="metric-grid">
          ${renderMetricCard(
            '命中率',
            cache.l1.hit_rate,
            `${cache.l1.hits} 命中 / ${cache.l1.misses} 未命中`,
            hitRateColor
          )}
          ${renderMetricCard(
            '缓存键数',
            cache.l1.keys,
            `总写入 ${cache.total_sets} 次`,
            '#3b82f6'
          )}
          ${renderMetricCard(
            '内存占用',
            formatBytes(cache.l1.memory_kb),
            `最多 500 个键`,
            '#8b5cf6'
          )}
          ${renderMetricCard(
            '待处理请求',
            cache.pending_requests,
            cache.pending_requests > 0 ? '⚠️ 有请求排队' : '✓ 无排队',
            cache.pending_requests > 5 ? '#f59e0b' : '#10b981'
          )}
        </div>

        <div class="progress-section">
          ${renderProgress('缓存键数', cache.l1.keys, 500, hitRateColor)}
        </div>
      </section>

      <!-- 内存统计 -->
      <section class="monitor-section">
        <h2>内存占用</h2>
        <div class="metric-grid">
          ${renderMetricCard(
            '堆内存使用',
            formatBytes(memory.heap_used_mb * 1024),
            `总量 ${formatBytes(memory.heap_total_mb * 1024)}`,
            memColor
          )}
          ${renderMetricCard(
            'RSS',
            formatBytes(memory.rss_mb * 1024),
            '常驻内存',
            '#3b82f6'
          )}
          ${renderMetricCard(
            'External',
            formatBytes(memory.external_mb * 1024),
            '外部内存',
            '#8b5cf6'
          )}
        </div>

        <div class="progress-section">
          ${renderProgress('堆内存', memory.heap_used_mb, memory.heap_total_mb, memColor)}
        </div>
      </section>

      <!-- 趋势图 -->
      ${history.length > 10 ? `
        <section class="monitor-section">
          <h2>命中率趋势 (最近 ${history.length} 次)</h2>
          <div id="pm-chart" class="chart-container"></div>
        </section>
      ` : ''}

      <!-- L2 缓存 (Redis) -->
      ${cache.l2 && cache.l2.hits > 0 ? `
        <section class="monitor-section">
          <h2>L2 缓存 (Redis)</h2>
          <div class="metric-grid">
            ${renderMetricCard('命中率', cache.l2.hit_rate, `${cache.l2.hits} 命中 / ${cache.l2.misses} 未命中`, '#10b981')}
          </div>
        </section>
      ` : ''}

      <!-- 操作日志 -->
      <section class="monitor-section">
        <h2>操作日志</h2>
        <div id="pm-logs" class="logs-container"></div>
      </section>
    </div>

    <style>
      .performance-monitor {
        padding: 24px;
        max-width: 1400px;
        margin: 0 auto;
      }

      .monitor-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 32px;
        padding-bottom: 16px;
        border-bottom: 1px solid var(--border-subtle, #e5e7eb);
      }

      .monitor-subtitle {
        color: var(--text-muted, #6b7280);
        margin-top: 8px;
        font-size: 14px;
      }

      .monitor-actions {
        display: flex;
        gap: 8px;
      }

      .btn-primary, .btn-secondary, .btn-danger {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-primary {
        background: #3b82f6;
        color: white;
      }

      .btn-primary:hover {
        background: #2563eb;
      }

      .btn-secondary {
        background: #f3f4f6;
        color: #374151;
      }

      .btn-secondary:hover {
        background: #e5e7eb;
      }

      .btn-danger {
        background: #fee;
        color: #dc2626;
      }

      .btn-danger:hover {
        background: #fdd;
      }

      .monitor-section {
        margin-bottom: 32px;
        background: white;
        border-radius: 8px;
        padding: 24px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .monitor-section h2 {
        margin: 0 0 16px 0;
        font-size: 18px;
        font-weight: 600;
      }

      .metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
        margin-bottom: 16px;
      }

      .metric-card {
        padding: 16px;
        background: #f9fafb;
        border-radius: 8px;
        border-left: 4px solid #3b82f6;
      }

      .metric-title {
        font-size: 13px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }

      .metric-value {
        font-size: 28px;
        font-weight: 700;
        color: #111827;
        margin-bottom: 4px;
      }

      .metric-subtitle {
        font-size: 13px;
        color: #6b7280;
      }

      .progress-section {
        margin-top: 16px;
      }

      .progress-item {
        margin-bottom: 16px;
      }

      .progress-label {
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        color: #6b7280;
        margin-bottom: 8px;
      }

      .progress-bar {
        height: 8px;
        background: #e5e7eb;
        border-radius: 4px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: #3b82f6;
        transition: width 0.3s ease;
      }

      .logs-container {
        max-height: 400px;
        overflow-y: auto;
        background: #f9fafb;
        border-radius: 6px;
        padding: 12px;
        font-family: 'Monaco', 'Courier New', monospace;
        font-size: 13px;
        line-height: 1.6;
      }

      .log-entry {
        padding: 8px;
        margin-bottom: 4px;
        border-left: 3px solid #d1d5db;
      }

      .log-entry.success {
        border-color: #10b981;
        background: #f0fdf4;
      }

      .log-entry.error {
        border-color: #ef4444;
        background: #fef2f2;
      }

      .log-entry.warning {
        border-color: #f59e0b;
        background: #fffbeb;
      }

      .chart-container {
        height: 300px;
        margin-top: 16px;
      }
    </style>
  `
}

/**
 * 添加日志条目
 */
function addLog(message, type = 'info') {
  const logsContainer = document.getElementById('pm-logs')
  if (!logsContainer) return

  const timestamp = new Date().toLocaleTimeString()
  const entry = document.createElement('div')
  entry.className = `log-entry ${type}`
  entry.textContent = `[${timestamp}] ${message}`

  logsContainer.insertBefore(entry, logsContainer.firstChild)

  // 最多保留 50 条
  while (logsContainer.children.length > 50) {
    logsContainer.removeChild(logsContainer.lastChild)
  }
}

/**
 * 渲染趋势图 (简化版)
 */
function renderChart(history) {
  const container = document.getElementById('pm-chart')
  if (!container) return

  const data = history.map(h => parseFloat(h.cache.l1.hit_rate))
  const max = 100
  const min = 0

  const bars = data.map((value, i) => {
    const height = ((value - min) / (max - min)) * 100
    const color = value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444'
    return `<div class="chart-bar" style="height: ${height}%; background: ${color}" title="${value}%"></div>`
  }).join('')

  container.innerHTML = `
    <div class="simple-chart">
      ${bars}
    </div>
    <style>
      .simple-chart {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        height: 100%;
        padding: 20px;
      }
      .chart-bar {
        flex: 1;
        min-width: 8px;
        background: #3b82f6;
        border-radius: 2px 2px 0 0;
        transition: all 0.3s;
        cursor: pointer;
      }
      .chart-bar:hover {
        opacity: 0.8;
      }
    </style>
  `
}

/**
 * 初始化性能监控页面
 */
export async function initPerformanceMonitor() {
  const container = document.getElementById('as-output')
  if (!container) return

  let metrics = null
  let history = []
  let autoRefreshInterval = null

  // 加载指标
  async function load() {
    try {
      metrics = await fetchMetrics()
      history.push(metrics)
      if (history.length > 60) history.shift() // 最多保留 60 个数据点

      container.innerHTML = render(metrics, history)
      attachEventListeners()

      if (history.length > 10) {
        renderChart(history)
      }

      addLog('✓ 指标加载成功', 'success')
    } catch (err) {
      console.error('加载指标失败:', err)
      container.innerHTML = `
        <div class="error-message">
          <h2>⚠️ 无法加载性能指标</h2>
          <p>${err.message}</p>
          <button onclick="location.reload()">重试</button>
        </div>
      `
      addLog(`✗ 加载失败: ${err.message}`, 'error')
    }
  }

  // 绑定事件
  function attachEventListeners() {
    // 刷新数据
    document.getElementById('pm-refresh')?.addEventListener('click', async () => {
      addLog('刷新数据...', 'info')
      await load()
    })

    // 重置统计
    document.getElementById('pm-reset-stats')?.addEventListener('click', async () => {
      if (!confirm('确定要重置缓存统计吗？')) return

      try {
        await resetStats()
        addLog('✓ 统计已重置', 'success')
        await load()
      } catch (err) {
        addLog(`✗ 重置失败: ${err.message}`, 'error')
      }
    })

    // 清空缓存
    document.getElementById('pm-flush-cache')?.addEventListener('click', async () => {
      if (!confirm('确定要清空所有缓存吗？这会导致短时间内性能下降。')) return

      try {
        await flushCache()
        addLog('✓ 缓存已清空', 'warning')
        await load()
      } catch (err) {
        addLog(`✗ 清空失败: ${err.message}`, 'error')
      }
    })
  }

  // 启动自动刷新 (每 5 秒)
  function startAutoRefresh() {
    stopAutoRefresh()
    autoRefreshInterval = setInterval(load, 5000)
    addLog('启动自动刷新 (5s)', 'info')
  }

  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval)
      autoRefreshInterval = null
    }
  }

  // 初始加载
  await load()
  startAutoRefresh()

  // 页面卸载时停止自动刷新
  window.addEventListener('beforeunload', stopAutoRefresh)
}

// 注册到页面路由
if (typeof globalThis.registerPage === 'function') {
  globalThis.registerPage('performance', initPerformanceMonitor)
}

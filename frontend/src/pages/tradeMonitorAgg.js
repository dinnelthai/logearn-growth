import {createOnlineTradeMonitorPage} from './onlineTradeMonitor.js'
import {viewState} from '../components/viewStates.js'
import { fetchTradeMetrics } from '../api/metrics.js'
import { createChartLifecycle } from './chartLifecycle.js'

export function createTradeMonitorAggPage(ctx) {
  if(ctx.dataStore.meta.storage==='hologres')return createOnlineTradeMonitorPage(ctx)
  const { root, $, esc, fmt, pct, table, stat, themeMedia, date } = ctx
  const clearNative = ctx.clear
  const chartLifecycle = createChartLifecycle(themeMedia)
  let nativeChart = null
  let inflight = 0

  async function draw(c) {
    chartLifecycle.dispose()
    nativeChart = null
    clearNative()
    const reqId = ++inflight
    $('#as-output').innerHTML = '<div class="a-card"><p class="a-muted si-loading" role="status">正在从 /api/metrics/trades 加载…</p></div>'
    let metrics
    try {
      metrics = await fetchTradeMetrics({ start: c.start, end: c.end, source: c.source || 'all' })
    } catch (err) {
      if (reqId !== inflight) return
      $('#as-output').innerHTML = viewState({kind:'error',title:'交易监控加载失败',description:err.message||String(err),actionLabel:'重新运行',actionAttr:'data-trade-retry'});
      $('#as-output').querySelector('[data-trade-retry]')?.addEventListener('click',()=>draw(c))
      return
    }
    if (reqId !== inflight) return

    const t = metrics.total || {}
    const days = metrics.days || []
    const byChain = metrics.byChain || []
    const pct2 = (a, b) => (b ? (a / b * 100).toFixed(1) + '%' : '—')

    $('#as-output').innerHTML = `
      <div class="a-context"><span class="a-chip">交易成功率监控 · 服务端日聚合</span><span>${date(c.start)}–${date(c.end - 86400000)}</span></div>
      <div class="a-summary a-four">
        ${stat('提交笔数', fmt(t.submitted || 0), 'daily_trade_stats 汇总')}
        ${stat('已关联成功', fmt(t.succeeded || 0), '同 attempt/trade 关联')}
        ${stat('成功率', t.successRate != null ? pct2(t.succeeded, t.submitted) : '—', '成功 / 提交')}
        ${stat('已关联失败', fmt(t.failed || 0), t.failureRate != null ? pct2(t.failed, t.submitted) + ' 失败率' : '')}
      </div>
      <div class="a-summary">
        ${stat('结果待确认', fmt(t.pending || 0), '有关联 ID 无终态')}
        ${stat('成交额 USD', fmt(Math.round(t.volume_usd || 0)), '确认成交事实')}
      </div>
      <div class="a-card"><div class="a-cardhead"><h2>每日趋势</h2></div><div id="as-trade-monitor-chart" style="height:280px;width:100%"></div></div>
      <div class="a-card"><div class="a-cardhead"><h2>按链分类</h2></div>
        ${table(
          ['链', '提交', '成功', '失败', '成功率', '成交额'],
          byChain.map(row => [
            esc(row.chain),
            fmt(row.submitted), fmt(row.succeeded), fmt(row.failed),
            row.successRate != null ? pct2(row.succeeded, row.submitted) : '—',
            fmt(Math.round(row.volume_usd || 0)),
          ]),
        )}
      </div>
      <p class="a-muted">Phase A 聚合版不返回逐笔 failure reason / 缺 ID 明细；需要时查 raw 小窗或后续 drill kind。</p>`

    const host = $('#as-trade-monitor-chart')
    if (!globalThis.echarts) return
    const colorFn = key => {
      const p = document.createElement('span')
      p.style.color = `var(${key})`
      root.appendChild(p)
      const v = getComputedStyle(p).color
      p.remove()
      return v
    }
    nativeChart = echarts.init(host, null, { renderer: 'svg' })
    const paint = () => {
      if (!nativeChart || !host.isConnected) return
      nativeChart.setOption({
        animation: false,
        tooltip: { trigger: 'axis', confine: true },
        legend: { top: 0 },
        grid: { left: 48, right: 20, top: 40, bottom: 32 },
        xAxis: { type: 'category', data: days.map(d => String(d.date).slice(5).replace('-', '/')) },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
          { name: '提交', type: 'bar', barMaxWidth: 28, itemStyle: { color: colorFn('--a-muted') }, data: days.map(d => d.submitted) },
          { name: '成功', type: 'bar', barMaxWidth: 28, itemStyle: { color: colorFn('--a-accent') }, data: days.map(d => d.succeeded) },
          { name: '失败', type: 'bar', barMaxWidth: 28, itemStyle: { color: '#e05c5c' }, data: days.map(d => d.failed) },
        ],
      }, true)
    }
    paint()
    chartLifecycle.attach(nativeChart, host, paint)
  }

  return {
    draw,
    dispose() {
      inflight++
      chartLifecycle.dispose()
      nativeChart = null
    },
  }
}

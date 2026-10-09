/**
 * Aggregated north-star renderer (backend-agg mode).
 * Uses /api/metrics/north-star + /api/drill/* — no local users[].events.
 */
import { fetchNorthStarMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'
import { createChartLifecycle } from './chartLifecycle.js'

function fmtDate(dateStr) {
  return String(dateStr).slice(5).replace('-', '/')
}

export function createNorthStarAggPage(ctx) {
  const { root, $, $$, esc, fmt, pct, table, stat, themeMedia, drawer, asof, date, clock } = ctx
  const clearNative = ctx.clear
  const chartLifecycle = createChartLifecycle(themeMedia)
  let nativeChart = null
  let northTrendView = 'total'
  let inflight = 0

  async function openDrill(title, description, kind, params) {
    drawer.openRemote({
      title,
      description,
      fetchPage: ({ offset, limit, q }) =>
        fetchDrillUsers({ kind, params, offset, limit, q }),
      fetchTimeline: async (userId, host) => {
        host.innerHTML = '<p class="a-muted">加载时间线…</p>'
        try {
          const data = await fetchUserTimeline({ userId, limit: 200 })
          const names = ctx.names || {}
          host.innerHTML = `<h2>${esc(data.user?.id || userId)} · 事件时间线</h2><div class="a-timeline">${(data.events || []).map(e => {
            const label = names[e.event_name] || e.event_name
            const t = new Date(e.t + 7 * 3600000).toISOString().slice(5, 16).replace('T', ' ')
            return `<div class="a-event"><strong>${esc(label)}</strong><div>${esc(t)}</div></div>`
          }).join('') || '<p class="a-muted">无事件</p>'}</div>${data.truncated ? '<p class="a-muted">已截断至最近/限额内事件。</p>' : ''}`
        } catch (err) {
          host.innerHTML = `<p class="a-empty">时间线加载失败：${esc(err.message || err)}</p>`
        }
      },
    })
  }

  async function drawNorth(c) {
    const reqId = ++inflight
    clearNative()
    let toolbar = $('#as-north-toolbar')
    if (!toolbar) {
      toolbar = document.createElement('div')
      toolbar.id = 'as-north-toolbar'
      root.querySelector('.a-head').append(toolbar)
    }
    toolbar.hidden = false
    toolbar.innerHTML = `<div class="a-north-periods" role="group" aria-label="北极星统计周期">${[['all', '全周期'], ['7', '近7天'], ['14', '近14天'], ['30', '近30天']].map(([v, label]) => `<button class="a-button" data-north-period="${v}" aria-pressed="${String(c.period) === v}">${label}</button>`).join('')}</div><div class="a-muted a-north-dates">${date(c.start)}–${date(c.end - 86400000)} · 数据截至 ${clock(asof)} · UTC+7 · 截至日进行中 · 服务端聚合</div>`
    toolbar.querySelectorAll('[data-north-period]').forEach(b => {
      b.onclick = () => ctx.setPeriod(b.dataset.northPeriod)
    })

    $('#as-output').innerHTML = '<div class="a-card"><p class="a-muted">正在从 /api/metrics/north-star 加载…</p></div>'

    let metrics
    try {
      metrics = await fetchNorthStarMetrics({
        start: c.start,
        end: c.end,
        source: c.source || 'all',
      })
    } catch (err) {
      if (reqId !== inflight) return
      $('#as-output').innerHTML = `<div class="a-card a-details"><h2>北极星加载失败</h2><p>${esc(err.message || err)}</p></div>`
      return
    }
    if (reqId !== inflight) return

    const days = metrics.days || []
    const totals = metrics.totals || {}
    const avgDaa = Number(totals.avg_daa || 0)

    $('#as-output').innerHTML = `
      <div class="a-summary a-four">
        ${stat('周期有效分析用户', `<button class="a-tablelink" id="as-north-yesterday" style="font:inherit">${fmt(totals.active_users || 0)}</button>`, '服务端去重 · 与下钻同口径')}
        ${stat('日均有效分析用户', avgDaa.toFixed(1), `${totals.days || days.length} 个业务日均值`)}
        ${stat('周期首次分析用户', `<button class="a-tablelink" id="as-north-new" style="font:inherit">${fmt(totals.new_users || 0)}</button>`, 'first_chip 落在本期')}
        ${stat('周期回访分析用户', `<button class="a-tablelink" id="as-north-return" style="font:inherit">${fmt(totals.returning_users || 0)}</button>`, 'first_chip 在本期之前')}
      </div>
      <div class="a-card">
        <div class="a-cardhead">
          <h2>每日有效分析用户</h2>
          <div class="a-tabs">
            <button class="a-button" data-north-trend="total" aria-pressed="${northTrendView === 'total'}">总量</button>
            <button class="a-button" data-north-trend="split" aria-pressed="${northTrendView === 'split'}">首次 / 回访</button>
          </div>
        </div>
        <div class="a-chart"><div id="as-north-chart" style="height:300px;width:100%" role="img" aria-label="每日有效分析用户"></div></div>
        <div class="a-insight">数字来自 daily_north_star rollup；下钻走 /api/drill，不把全量用户名单载入浏览器。</div>
      </div>
      <details class="a-card a-details a-north-daily">
        <summary>每日明细 <span class="a-muted">${days.length} 天</span></summary>
        ${table(
          ['日期', '登录用户', '有效分析', '当天首次', '当天回访'],
          days.map(d => [
            fmtDate(d.date),
            `<button class="a-tablelink" data-ns-login="${esc(d.date)}">${d.login_users}</button>`,
            `<button class="a-tablelink" data-ns-active="${esc(d.date)}">${d.active_users}</button>`,
            `<button class="a-tablelink" data-ns-new="${esc(d.date)}">${d.new_users}</button>`,
            `<button class="a-tablelink" data-ns-ret="${esc(d.date)}">${d.returning_users}</button>`,
          ]),
        )}
      </details>`

    const drillBase = { start: c.start, end: c.end, source: c.source && c.source !== 'all' ? c.source : null }
    $('#as-north-yesterday').onclick = () =>
      openDrill('周期有效分析用户', `${date(c.start)}–${date(c.end - 86400000)}`, 'north_star_period', { ...drillBase, cohort: 'active' })
    $('#as-north-new').onclick = () =>
      openDrill('周期首次分析用户', '首次 chip 在本期', 'north_star_period', { ...drillBase, cohort: 'new' })
    $('#as-north-return').onclick = () =>
      openDrill('周期回访分析用户', '首次 chip 在本期之前', 'north_star_period', { ...drillBase, cohort: 'returning' })

    $$('[data-ns-active]').forEach(b => b.onclick = () =>
      openDrill(`${fmtDate(b.dataset.nsActive)} 有效分析用户`, '当日去重', 'north_star_day', { date: b.dataset.nsActive, source: drillBase.source, cohort: 'active' }))
    $$('[data-ns-new]').forEach(b => b.onclick = () =>
      openDrill(`${fmtDate(b.dataset.nsNew)} 当天首次`, '当日首次 chip', 'north_star_day', { date: b.dataset.nsNew, source: drillBase.source, cohort: 'new' }))
    $$('[data-ns-ret]').forEach(b => b.onclick = () =>
      openDrill(`${fmtDate(b.dataset.nsRet)} 当天回访`, '当日回访', 'north_star_day', { date: b.dataset.nsRet, source: drillBase.source, cohort: 'returning' }))
    $$('[data-ns-login]').forEach(b => b.onclick = () =>
      openDrill(`${fmtDate(b.dataset.nsLogin)} 登录用户`, '当天任意事件带非空 user_id 的去重用户', 'north_star_login_day', { date: b.dataset.nsLogin, source: drillBase.source }))

    const host = $('#as-north-chart')
    if (!globalThis.echarts) {
      host.innerHTML = '<p class="a-muted">图表组件未加载。</p>'
      return
    }
    const color = key => {
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
        legend: {
          data: northTrendView === 'split'
            ? ['当天首次', '当天回访', '每日登录用户']
            : ['有效分析总人数', '每日登录用户'],
          top: 0,
          textStyle: { color: color('--a-muted') },
        },
        tooltip: { trigger: 'axis', confine: true },
        grid: { top: 48, left: 45, right: 18, bottom: 32 },
        xAxis: {
          type: 'category',
          data: days.map(d => fmtDate(d.date)),
          axisLabel: { color: color('--a-muted') },
        },
        yAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { color: color('--a-muted') },
          splitLine: { lineStyle: { color: color('--a-border') } },
        },
        series: (northTrendView === 'split'
          ? [
              { name: '当天首次', type: 'bar', label: { show: true, position: 'top', formatter: p => p.value > 0 ? String(p.value) : '' }, stack: 'users', barMaxWidth: 34, itemStyle: { color: color('--a-accent') }, data: days.map(d => d.new_users) },
              { name: '当天回访', type: 'bar', label: { show: true, position: 'top', formatter: p => p.value > 0 ? String(p.value) : '' }, stack: 'users', barMaxWidth: 34, itemStyle: { color: color('--a-green') }, data: days.map(d => d.returning_users) },
            ]
          : [
              { name: '有效分析总人数', type: 'bar', label: { show: true, position: 'top', formatter: p => p.value > 0 ? String(p.value) : '' }, barMaxWidth: 34, itemStyle: { color: color('--a-accent') }, data: days.map(d => d.active_users) },
            ]
        ).concat([
          { name: '每日登录用户', label: { show: true, position: 'top', distance: 16, formatter: p => p.value > 0 ? String(p.value) : '' }, type: 'line', symbol: 'diamond', symbolSize: 5, lineStyle: { type: 'dashed' }, itemStyle: { color: '#e5a64b' }, data: days.map(d => d.login_users) },
        ]),
      }, true)
    }
    paint()
    $$('[data-north-trend]').forEach(b => {
      b.onclick = () => {
        northTrendView = b.dataset.northTrend
        drawNorth(c)
      }
    })
    nativeChart.on('click', p => {
      const d = days[p.dataIndex]
      if (!d) return
      if (p.seriesName === '每日登录用户') {
        openDrill(`${fmtDate(d.date)} 登录用户`, '当天任意事件带非空 user_id 的去重用户', 'north_star_login_day', { date: d.date, source: drillBase.source })
        return
      }
      if (p.seriesType !== 'bar') return
      const cohort = northTrendView === 'total' ? 'active' : (p.seriesIndex === 0 ? 'new' : 'returning')
      openDrill(`${fmtDate(d.date)} · ${p.seriesName}`, '当日去重', 'north_star_day', { date: d.date, source: drillBase.source, cohort })
    })
    chartLifecycle.attach(nativeChart, host, paint)
  }

  return {
    draw: drawNorth,
    dispose() {
      chartLifecycle.dispose()
      nativeChart = null
    },
  }
}

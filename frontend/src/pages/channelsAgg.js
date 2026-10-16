import {createChannelInsightsPage} from './channelInsights.js'
import { fetchChannelMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'

export function createChannelsAggPage(ctx) {
  if(ctx.dataStore.meta.storage==='hologres')return createChannelInsightsPage(ctx)
  const { $, esc, fmt, pct, table, stat, drawer, date, names } = ctx
  const clearNative = ctx.clear
  let inflight = 0

  async function openDrill(title, description, params) {
    drawer.openRemote({
      title,
      description,
      fetchPage: ({ offset, limit, q }) =>
        fetchDrillUsers({ kind: 'channel_visits', params, offset, limit, q }),
      fetchTimeline: async (userId, host) => {
        host.innerHTML = '<p class="a-muted si-loading" role="status">加载时间线…</p>'
        try {
          const data = await fetchUserTimeline({ userId, limit: 200 })
          host.innerHTML = `<h2>${esc(data.user?.id || userId)}</h2><div class="a-timeline">${(data.events || []).map(e => {
            const label = (names && names[e.event_name]) || e.event_name
            const t = new Date(e.t + 7 * 3600000).toISOString().slice(5, 16).replace('T', ' ')
            return `<div class="a-event"><strong>${esc(label)}</strong><div>${esc(t)}</div></div>`
          }).join('')}</div>`
        } catch (err) {
          host.innerHTML = `<p class="a-empty">${esc(err.message || err)}</p>`
        }
      },
    })
  }

  async function draw(c) {
    const reqId = ++inflight
    clearNative()
    $('#as-output').innerHTML = '<div class="a-card"><p class="a-muted si-loading" role="status">正在从 /api/metrics/channels 加载…</p></div>'
    let metrics
    try {
      metrics = await fetchChannelMetrics({
        start: c.start,
        end: c.end,
        channel: c.source && c.source !== 'all' ? c.source : 'all',
      })
    } catch (err) {
      if (reqId !== inflight) return
      $('#as-output').innerHTML = `<div class="a-card"><h2>渠道指标加载失败</h2><p>${esc(err.message || err)}</p></div>`
      return
    }
    if (reqId !== inflight) return

    const total = metrics.total || {}
    const groups = metrics.groups || []
    const days = metrics.days || []
    const ruleName = id => (ctx.dataStore.channelRules || []).find(r => r.id === id)?.name || id

    $('#as-output').innerHTML = `
      <div class="a-summary a-four">
        ${stat('首次访问', `<button class="a-tablelink" id="as-ch-visits" style="font:inherit">${fmt(total.visits || 0)}</button>`, '按 first_visit 入组')}
        ${stat('登录', fmt(total.logins || 0), '访问后登录')}
        ${stat('Token 详情', fmt(total.tokens || 0), '登录后查看详情')}
        ${stat('有效分析', fmt(total.analyses || 0), '访问后至少一次 chip')}
      </div>
      <div class="a-summary">
        ${stat('D7 到期人数', fmt(total.d7_eligible || 0), '首次 chip 后 D7 已成熟')}
        ${stat('D7 留存', fmt(total.d7_retained || 0), total.d7_eligible ? pct(total.d7_retained, total.d7_eligible) : '—')}
        ${stat('交易用户', fmt(total.traders || 0), '有确认成交')}
        ${stat('交易量 USD', fmt(Math.round(total.volume_usd || 0)), '确认成交额')}
      </div>
      <div class="a-card"><div class="a-cardhead"><h2>按渠道</h2></div>
        ${table(
          ['渠道', '访问', '登录', 'Token', '分析', 'D7留存', '交易用户', '交易量'],
          groups.map(g => [
            esc(ruleName(g.id)),
            fmt(g.visits), fmt(g.logins), fmt(g.tokens), fmt(g.analyses),
            g.d7_eligible ? `${fmt(g.d7_retained)}/${fmt(g.d7_eligible)}` : '—',
            fmt(g.traders), fmt(Math.round(g.volume_usd || 0)),
          ]),
        )}
      </div>
      <details class="a-card a-details"><summary>按日入组</summary>
        ${table(
          ['日期', '访问', '登录', 'Token', '分析', 'D7到期', 'D7留存'],
          days.map(d => [d.date, fmt(d.visits), fmt(d.logins), fmt(d.tokens), fmt(d.analyses), fmt(d.d7_eligible), fmt(d.d7_retained)]),
        )}
      </details>
      <p class="a-muted">来自 daily_channel_stats；入组日 = first_visit 业务日。下钻为同期访问用户。</p>`

    const channel = c.source && c.source !== 'all' ? c.source : null
    $('#as-ch-visits').onclick = () =>
      openDrill('渠道访问用户', `${date(c.start)}–${date(c.end - 86400000)}`, { start: c.start, end: c.end, channel })
  }

  return { draw, dispose() {} }
}

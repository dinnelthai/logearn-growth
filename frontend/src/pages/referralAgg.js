import {createReferralInsightsPage} from './referralInsights.js'
import { fetchReferralMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'

export function createReferralAggPage(ctx) {
  if(ctx.dataStore.meta.storage==='hologres')return createReferralInsightsPage(ctx)
  const { $, esc, fmt, pct, table, stat, drawer, date, day } = ctx
  const clearNative = ctx.clear
  let inflight = 0

  function openCached(title, cacheId, listKey) {
    if (!cacheId) return
    drawer.openRemote({
      title,
      description: '推荐关系下钻',
      fetchPage: ({ offset, limit, q }) =>
        fetchDrillUsers({ kind: 'cached_list', params: { cache_id: cacheId, list_key: listKey }, offset, limit, q }),
      fetchTimeline: async (userId, host) => {
        host.innerHTML = '<p class="a-muted">加载时间线…</p>'
        try {
          const data = await fetchUserTimeline({ userId, limit: 200 })
          host.innerHTML = `<h2>${esc(data.user?.id || userId)}</h2><div class="a-timeline">${(data.events || []).map(e => {
            const t = new Date(e.t + 7 * 3600000).toISOString().slice(5, 16).replace('T', ' ')
            return `<div class="a-event"><strong>${esc(e.event_name)}</strong><div>${esc(t)}</div></div>`
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
    $('#as-output').innerHTML = '<div class="a-card"><p class="a-muted">正在从 /api/metrics/referral 加载…</p></div>'
    let metrics
    try {
      metrics = await fetchReferralMetrics({ start: c.start, end: c.end, source: c.source || 'all' })
    } catch (err) {
      if (reqId !== inflight) return
      $('#as-output').innerHTML = `<div class="a-card"><h2>推荐指标加载失败</h2><p>${esc(err.message || err)}</p></div>`
      return
    }
    if (reqId !== inflight) return

    const cacheId = metrics.drill?.cache_id
    $('#as-output').innerHTML = `
      <div class="a-context"><span class="a-chip">服务端推荐循环</span><span>${date(c.start)}–${date(c.end - day)}</span></div>
      <div class="a-summary a-four">
        ${stat('参与推荐用户', `<button class="a-tablelink" data-k="advocates" style="font:inherit">${fmt(metrics.advocates || 0)}</button>`, '至少绑定一位')}
        ${stat('绑定邀请用户', `<button class="a-tablelink" data-k="bound" style="font:inherit">${fmt(metrics.bound_invitees || 0)}</button>`, '首次绑定去重')}
        ${stat('推荐激活率', pct(metrics.activated_invitees, metrics.bound_invitees), `${fmt(metrics.activated_invitees || 0)} 位 7 日内有效分析`)}
        ${stat('有效推荐系数 K', metrics.advocates ? Number(metrics.k_factor || 0).toFixed(2) : '—', '激活 ÷ 参与推荐')}
      </div>
      <div class="a-summary">
        ${stat('待观察', fmt(metrics.pending_invitees || 0), '激活窗未结束')}
        ${stat('人均绑定', metrics.advocates ? Number(metrics.average_invitees_per_advocate || 0).toFixed(2) : '—', '')}
      </div>
      <p class="a-muted">Phase B 聚合版暂不含分享点击漏斗；分享行为仍待产品埋点。K 与下钻同口径。</p>`

    $('#as-output').querySelectorAll('[data-k]').forEach(b => {
      b.onclick = () => openCached(b.dataset.k, cacheId, b.dataset.k)
    })
  }

  return { draw, dispose() {} }
}

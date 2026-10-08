import { fetchSegmentsMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'

export function createSegmentsAggPage(ctx) {
  const { $, esc, fmt, pct, table, stat, drawer, asof, clock } = ctx
  const clearNative = ctx.clear
  let inflight = 0

  function openCached(title, cacheId, listKey) {
    if (!cacheId) return
    drawer.openRemote({
      title,
      description: '服务端分群名单',
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
    $('#as-output').innerHTML = '<div class="a-card"><p class="a-muted">正在从 /api/metrics/segments 加载…</p></div>'
    let metrics
    try {
      metrics = await fetchSegmentsMetrics({
        as_of: asof,
        source: c.source || 'all',
        audience_ids: c.audienceIds || null,
        cohort_id: c.cohortId || null,
      })
    } catch (err) {
      if (reqId !== inflight) return
      $('#as-output').innerHTML = `<div class="a-card"><h2>分群加载失败</h2><p>${esc(err.message || err)}</p></div>`
      return
    }
    if (reqId !== inflight) return

    const cacheId = metrics.drill?.cache_id
    const tags = metrics.tags || {}

    $('#as-output').innerHTML = `
      <div class="a-context"><span class="a-chip">服务端分群 · user_features</span><span>asOf ${clock(asof)} · 共 ${fmt(metrics.total || 0)} 人</span></div>
      <div class="a-summary a-four">
        ${stat('Telegram 已绑定', fmt(tags.telegram_bound || 0), `未知 ${fmt(tags.telegram_binding_unknown || 0)}`)}
        ${stat('邮箱已绑定', fmt(tags.email_bound || 0), `未知 ${fmt(tags.email_binding_unknown || 0)}`)}
        ${stat('用过策略', fmt(tags.used_strategy || 0), '')}
        ${stat('多策略用户', fmt(tags.multi_strategy_user || 0), '')}
      </div>
      <div class="a-card"><div class="a-cardhead"><h2>主分群</h2><span class="a-muted">互斥优先级</span></div>
        ${table(
          ['分群', '人数', '占比', '下钻'],
          (metrics.segments || []).map(s => [
            esc(s.segment),
            fmt(s.users),
            pct(s.users, metrics.total || 0),
            `<button class="a-tablelink" data-seg="${esc(s.segment)}">查看 ↗</button>`,
          ]),
        )}
      </div>
      <p class="a-muted">分类基于 rollup 的 user_features（近 28 天 chip 天数、回流间隔、策略数等），与明细 classifyUser 口径对齐。</p>`

    $('#as-output').querySelectorAll('[data-seg]').forEach(b => {
      b.onclick = () => openCached(b.dataset.seg, cacheId, b.dataset.seg)
    })
  }

  return { draw, dispose() {} }
}

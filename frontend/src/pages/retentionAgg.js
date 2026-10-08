import { fetchRetentionMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'

export function createRetentionAggPage(ctx) {
  const { $, $$, names, day, date, esc, fmt, pct, table, stat, drawer } = ctx
  const clearNative = ctx.clear
  let inflight = 0
  let continuous = false
  let cacheId = null
  let daily = []

  function openCached(title, description, listKey) {
    if (!cacheId || !listKey) return
    drawer.openRemote({
      title,
      description,
      fetchPage: ({ offset, limit, q }) =>
        fetchDrillUsers({ kind: 'cached_list', params: { cache_id: cacheId, list_key: listKey }, offset, limit, q }),
      fetchTimeline: async (userId, host) => {
        host.innerHTML = '<p class="a-muted">加载时间线…</p>'
        try {
          const data = await fetchUserTimeline({ userId, limit: 200 })
          host.innerHTML = `<h2>${esc(data.user?.id || userId)}</h2><div class="a-timeline">${(data.events || []).map(e => {
            const label = (ctx.names && ctx.names[e.event_name]) || e.event_name
            const t = new Date(e.t + 7 * 3600000).toISOString().slice(5, 16).replace('T', ' ')
            return `<div class="a-event"><strong>${esc(label)}</strong><div>${esc(t)}</div></div>`
          }).join('')}</div>`
        } catch (err) {
          host.innerHTML = `<p class="a-empty">${esc(err.message || err)}</p>`
        }
      },
    })
  }

  function renderTable() {
    const host = $('#as-cohort-table')
    if (!host) return
    host.innerHTML = table(
      ['首次日期', 'D0 人数', ...Array.from({ length: 7 }, (_, i) => (continuous ? '连续 ' : '') + 'D' + (i + 1))],
      daily.map(co => {
        const cells = [
          `<button class="a-tablelink" data-cohort="${esc(co.cohort_date)}">${esc(co.cohort_date)}</button>`,
          fmt(co.cohort_size),
        ]
        for (let p = 1; p <= 7; p++) {
          const period = co.periods.find(x => x.period === p)
          if (!period || period.retained_users == null) {
            cells.push('<span class="a-heat-unavailable">—</span>')
            continue
          }
          const n = continuous ? (period.continuous_retained_users ?? 0) : period.retained_users
          const rate = continuous ? period.continuous_retention_rate : period.retention_rate
          const key = continuous ? `retained:${co.cohort_date}:C${p}` : `retained:${co.cohort_date}:D${p}`
          cells.push(
            `<button class="a-heat cursor-interaction ${period.complete ? 'is-complete' : 'is-pending'}" data-list="${esc(key)}" style="--heat-intensity:${Math.round((rate || 0) * 75) + 5}%">${pct(n, co.cohort_size)}<small>${n} 人${period.complete ? '' : ' · 进行中'}</small></button>`
          )
        }
        return cells
      }),
    )
    $$('[data-cohort]').forEach(b => b.onclick = () => openCached(`${b.dataset.cohort} · D0`, '批次入组用户', `cohort:${b.dataset.cohort}`))
    $$('[data-list]').forEach(b => b.onclick = () => openCached('留存用户', b.dataset.list, b.dataset.list))
  }

  async function draw(c) {
    const reqId = ++inflight
    clearNative()
    $('#as-output').innerHTML = '<div class="a-card"><p class="a-muted">正在从 /api/metrics/retention 加载…</p></div>'
    let metrics
    try {
      metrics = await fetchRetentionMetrics({
        start: c.start,
        end: c.end,
        initial: c.initial || 'chip',
        returning: c.returning || 'chip',
        source: c.source || 'all',
        audience_ids: c.audienceIds || null,
        cohort_id: c.cohortId || null,
      })
    } catch (err) {
      if (reqId !== inflight) return
      $('#as-output').innerHTML = `<div class="a-card"><h2>留存加载失败</h2><p>${esc(err.message || err)}</p></div>`
      return
    }
    if (reqId !== inflight) return

    daily = metrics.daily || []
    cacheId = metrics.drill?.cache_id
    const chosen = [...daily].reverse().find(co => co.periods.every(p => p.complete)) || daily[0]

    $('#as-output').innerHTML = `
      <div class="a-context"><span class="a-chip">服务端留存 · 自然日</span><span>${date(c.start)}–${date(c.end - day)} · 首次 ${esc(names[c.initial] || c.initial)} / 回访 ${esc(names[c.returning] || c.returning)}</span></div>
      <div class="a-card"><div class="a-cardhead">
        <label style="margin:0">当前分析批次
          <select id="as-cohort-picker">${daily.map(co => `<option value="${esc(co.cohort_date)}" ${chosen && co.cohort_date === chosen.cohort_date ? 'selected' : ''}>${esc(co.cohort_date)} · ${co.cohort_size} 人</option>`).join('')}</select>
        </label>
        <div class="a-tabs">
          <button class="a-tab" data-retmode="daily" aria-pressed="${!continuous}">日留存</button>
          <button class="a-tab" data-retmode="continuous" aria-pressed="${continuous}">连续留存</button>
        </div>
      </div></div>
      <div class="a-summary" id="as-ret-summary"></div>
      <div class="a-card"><div class="a-cardhead"><h2>批次表</h2><span class="a-muted">${metrics.truncated ? '候选已截断' : `候选 ${fmt(metrics.candidate_count || 0)}`}</span></div>
        <div id="as-cohort-table"></div>
      </div>
      <p class="a-muted">数字与下钻名单来自同一次 /api/metrics/retention 缓存（15 分钟）。</p>`

    const renderSummary = () => {
      const dateKey = $('#as-cohort-picker')?.value
      const co = daily.find(x => x.cohort_date === dateKey) || chosen
      if (!co) {
        $('#as-ret-summary').innerHTML = stat('D0', '0', '无批次')
        return
      }
      const d1 = co.periods.find(p => p.period === 1)
      const d7 = co.periods.find(p => p.period === 7)
      const n1 = continuous ? d1?.continuous_retained_users : d1?.retained_users
      const n7 = continuous ? d7?.continuous_retained_users : d7?.retained_users
      $('#as-ret-summary').innerHTML =
        stat('当前批次 D0', fmt(co.cohort_size), co.cohort_date)
        + stat('D1', n1 == null ? '—' : pct(n1, co.cohort_size), n1 == null ? '未到观察期' : `${n1} / ${co.cohort_size}`)
        + stat(continuous ? '连续 D7' : 'D7', n7 == null || !d7?.complete ? '—' : pct(n7, co.cohort_size), d7?.complete ? `${n7} / ${co.cohort_size}` : '未成熟')
    }

    renderSummary()
    renderTable()
    $('#as-cohort-picker').onchange = () => { renderSummary() }
    $$('[data-retmode]').forEach(b => b.onclick = () => {
      continuous = b.dataset.retmode === 'continuous'
      $$('[data-retmode]').forEach(x => x.setAttribute('aria-pressed', x === b))
      renderSummary()
      renderTable()
    })
  }

  return { draw, dispose() {} }
}

import { fetchFunnelMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'
import { ASSOCIATIONS } from '../analytics/funnel.js'
import { createChartLifecycle } from './chartLifecycle.js'

export function createFunnelAggPage(ctx) {
  const { root, $, $$, names, day, date, esc, fmt, pct, table, stat, themeMedia, drawer } = ctx
  const clearNative = ctx.clear
  const chartLifecycle = createChartLifecycle(themeMedia)
  let nativeChart = null
  let inflight = 0
  let view = 'conversion'

  function openCached(title, description, cacheId, listKey) {
    if (!cacheId) return
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
            const label = names[e.event_name] || e.event_name
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
    $('#as-title').textContent = c.association === 'user' ? '用户激活漏斗' : `${ASSOCIATIONS[c.association] || c.association}漏斗`
    $('#as-output').innerHTML = '<div class="a-card"><p class="a-muted">正在从 /api/metrics/funnel 加载…</p></div>'

    let metrics
    try {
      metrics = await fetchFunnelMetrics({
        start: c.start,
        end: c.end,
        steps: c.steps,
        hours: c.hours,
        association: c.association || 'user',
        source: c.source || 'all',
        strategy: c.strategy || 'all',
        audience_ids: c.audienceIds || null,
        cohort_id: c.cohortId || null,
      })
    } catch (err) {
      if (reqId !== inflight) return
      $('#as-output').innerHTML = `<div class="a-card"><h2>漏斗加载失败</h2><p>${esc(err.message || err)}</p></div>`
      return
    }
    if (reqId !== inflight) return

    const steps = metrics.steps || []
    const counts = steps.map(s => s.users)
    const cacheId = metrics.drill?.cache_id
    const medianMin = metrics.median_conversion_ms == null
      ? '—'
      : `${Math.round(metrics.median_conversion_ms / 60000)} 分钟`
    const losses = steps.map(s => s.drop_off_users)
    const maxLoss = Math.max(0, ...losses.slice(0, -1))
    const maxLossIdx = losses.findIndex((n, i) => i < losses.length - 1 && n === maxLoss)

    const context = `${ASSOCIATIONS[c.association] || c.association} · ${date(c.start)}–${date(c.end - day)} · ${c.hours} 小时内 · ${c.source === 'all' ? '全部来源' : c.source}`

    $('#as-output').innerHTML = `
      <div class="a-context"><span class="a-chip">服务端漏斗 · 按用户去重</span><span>${context}</span></div>
      <div class="a-summary">
        ${stat('整体转化率', pct(metrics.total_converted, metrics.total_entered), `${fmt(metrics.total_converted)} / ${fmt(metrics.total_entered)}`)}
        ${stat('完成转化用户', fmt(metrics.total_converted), '依次完成全部步骤')}
        ${stat('转化耗时中位数', medianMin, '仅统计完成转化的用户')}
        ${stat('进行中', fmt(metrics.pending_count || 0), '窗口未结束')}
      </div>
      <div class="a-card">
        <div class="a-cardhead">
          <div class="a-tabs">
            <button class="a-tab cursor-interaction" data-view="conversion" aria-pressed="${view === 'conversion'}">漏斗转化</button>
            <button class="a-tab cursor-interaction" data-view="trend" aria-pressed="${view === 'trend'}">来源比较</button>
          </div>
          <span class="a-muted">${metrics.truncated ? '候选集已截断' : `候选 ${fmt(metrics.candidate_count || 0)}`}</span>
        </div>
        <div class="a-chart" id="as-chart"></div>
        <div class="a-insight">最大已确认流失：步骤 ${Math.max(1, maxLossIdx + 1)} → ${Math.max(2, maxLossIdx + 2)}，${maxLoss} 人。
          <button class="a-link cursor-interaction" data-loss="${maxLossIdx}">查看流失用户 ↗</button>
        </div>
      </div>
      <div class="a-card"><div class="a-cardhead"><h2>步骤转化明细</h2></div>
        ${table(
          ['步骤', '到达用户', '上一步转化', '整体占比', '已确认流失'],
          steps.map((s, i) => [
            `${i + 1}. ${names[s.key] || s.key}`,
            `<button class="a-tablelink" data-reached="${i}">${fmt(s.users)}</button>`,
            i ? pct(s.users, counts[i - 1]) : '—',
            pct(s.users, counts[0] || 0),
            i < steps.length - 1 ? `<button class="a-tablelink" data-loss="${i}">${s.drop_off_users} 人</button>` : '—',
          ]),
        )}
      </div>
      <div class="a-card" id="as-funnel-sources"><div class="a-cardhead"><h2>按首次获客来源比较</h2></div>
        ${table(
          ['来源', '入组', '完成', '转化率', '查看'],
          (metrics.by_source || []).map(row => [
            esc(row.source),
            fmt(row.entered),
            fmt(row.converted),
            pct(row.converted, row.entered),
            `<button class="a-tablelink" data-source="${esc(row.source)}">查看用户 ↗</button>`,
          ]),
        )}
      </div>
      <div class="a-card a-details">
        <h2>关联口径与数据质量</h2>
        <p>${esc(ASSOCIATIONS[c.association] || '')}。起点缺 ID：
          <button class="a-tablelink" data-q="missing_start">${metrics.quality?.missing_start || 0}</button>；
          后续缺 ID：
          <button class="a-tablelink" data-q="incomplete">${metrics.quality?.incomplete || 0}</button>。
        </p>
      </div>`

    const showFunnel = () => {
      const el = $('#as-chart')
      el.innerHTML = `<div id="as-native-funnel" style="height:${Math.max(300, counts.length * 95)}px;width:100%"></div>`
      if (!globalThis.echarts) return
      const color = key => {
        const probe = document.createElement('span')
        probe.style.color = `var(${key})`
        root.appendChild(probe)
        const result = getComputedStyle(probe).color
        probe.remove()
        return result
      }
      const host = $('#as-native-funnel')
      nativeChart = echarts.init(host, null, { renderer: 'svg' })
      const paint = () => {
        if (!nativeChart || !host.isConnected) return
        nativeChart.setOption({
          animation: false,
          tooltip: { trigger: 'item', confine: true },
          series: [{
            type: 'funnel',
            sort: 'none',
            left: '4%',
            top: 8,
            bottom: 12,
            width: '92%',
            min: 0,
            max: Math.max(1, counts[0] || 1),
            minSize: '0%',
            maxSize: '100%',
            gap: 7,
            label: {
              show: true,
              position: 'inside',
              formatter: p => `${p.data.name}\n${fmt(p.value)} 人 · ${pct(p.value, counts[0] || 0)}`,
            },
            data: counts.map((n, i) => ({
              name: names[steps[i]?.key] || steps[i]?.key,
              value: n,
              itemStyle: { color: color('--a-funnel-' + (i % 3)) },
            })),
          }],
        }, true)
      }
      paint()
      nativeChart.off('click')
      nativeChart.on('click', p => {
        const i = p.dataIndex
        openCached(names[steps[i]?.key] || '步骤', '已到达当前步骤', cacheId, `reached:${i}`)
      })
      chartLifecycle.attach(nativeChart, host, paint)
    }

    const bind = () => {
      $$('[data-reached]').forEach(b => b.onclick = () =>
        openCached(names[steps[+b.dataset.reached]?.key] || '步骤', '已到达当前步骤', cacheId, `reached:${b.dataset.reached}`))
      $$('[data-loss]').forEach(b => b.onclick = () =>
        openCached(`步骤 ${+b.dataset.loss + 1} → ${+b.dataset.loss + 2} 流失`, '已确认流失', cacheId, `drop:${b.dataset.loss}`))
      $$('[data-source]').forEach(b => b.onclick = () =>
        openCached(`${b.dataset.source} 来源用户`, '按来源', cacheId, `source:${b.dataset.source}`))
      $$('[data-q]').forEach(b => b.onclick = () =>
        openCached('关联字段缺失', b.dataset.q, cacheId, b.dataset.q === 'missing_start' ? 'missing_start' : 'incomplete'))
      $$('[data-view]').forEach(b => b.onclick = () => {
        view = b.dataset.view
        $$('[data-view]').forEach(x => x.setAttribute('aria-pressed', x === b))
        if (view === 'conversion') showFunnel()
        else $('#as-chart').innerHTML = '<p class="a-muted">来源比较见下方表格。</p>'
      })
    }

    showFunnel()
    bind()
  }

  return {
    draw,
    dispose() {
      chartLifecycle.dispose()
      nativeChart = null
    },
  }
}

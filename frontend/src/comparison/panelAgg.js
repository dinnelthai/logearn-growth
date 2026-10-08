/**
 * Aggregated crowd-comparison panel: counts from /api/metrics/comparison*,
 * drills via cached_list. No people[] in memory.
 */
import { fetchComparisonMetrics, fetchComparisonFunnelMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'
import { DIMENSIONS, ENTRY_LABELS, SEGMENTS } from '../analytics/comparison.js'
import { ASSOCIATIONS } from '../analytics/funnel.js'
import { EVENT_LABELS } from '../analytics/events.js'

const STORAGE = 'logearn.comparison.agg.v1'
const FUNNELS = {
  analysis: { label: '分析漏斗', steps: ['login', 'token', 'chip'] },
  ai: { label: 'AI漏斗', steps: ['token', 'ai', 'chip'] },
  token_visit: { label: '同次Token访问', steps: ['token_click', 'token', 'chip'], association: 'token_visit' },
  strategy_run: { label: '同次策略结果', steps: ['ai', 'strategy_result', 'signal_view'], association: 'strategy_run' },
}
const choices = {
  language: { all: '全部语言', zh: '中文', en: '英文', unknown: '未知/其他' },
  telegram: { all: '全部状态', bound: '已绑定', unbound: '未绑定', unknown: '状态未知' },
  email: { all: '全部状态', bound: '已绑定', unbound: '未绑定', unknown: '状态未知' },
  entry: { all: '全部入口', ...ENTRY_LABELS },
  segment: { all: '全部分群', ...Object.fromEntries(SEGMENTS.map(s => [s, s])) },
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const table = (heads, rows) => `<div class="a-scroll"><table><thead><tr>${heads.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const pct = (n, d) => (d ? (n / d * 100).toFixed(1) + '%' : '—')
const select = (name, label, values, value) =>
  `<label>${label}<select ${name}>${Object.entries(values).map(([k, v]) => `<option value="${esc(k)}" ${String(value) === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`

export function mountComparisonAgg(host, {
  asOf,
  drawer,
  names = EVENT_LABELS,
  lockedPeriod = null,
  audienceIds = null,
  cohortId = null,
  date,
}) {
  let state = {
    dimension: 'language',
    range: 14,
    filters: {},
    view: 'overview',
    funnel: 'analysis',
    hours: 24,
    association: 'user',
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE))
    if (saved && Object.hasOwn(DIMENSIONS, saved.dimension)) state = { ...state, ...saved }
  } catch { /* ignore */ }

  let status = ''
  let inflight = 0
  let cacheId = null
  let funnelCacheId = null

  const openDrill = (title, description, listKey, which = 'overview') => {
    const id = which === 'funnel' ? funnelCacheId : cacheId
    if (!id || !listKey) return
    drawer.openRemote({
      title,
      description,
      fetchPage: ({ offset, limit, q }) =>
        fetchDrillUsers({
          kind: 'cached_list',
          params: { cache_id: id, list_key: listKey },
          offset,
          limit,
          q,
        }),
      fetchTimeline: async (userId, el) => {
        el.innerHTML = '<p class="a-muted">加载时间线…</p>'
        try {
          const data = await fetchUserTimeline({ userId, limit: 200 })
          el.innerHTML = `<h2>${esc(data.user?.id || userId)}</h2><div class="a-timeline">${(data.events || []).map(e => {
            const label = names[e.event_name] || e.event_name
            const t = new Date(e.t + 7 * 3600000).toISOString().slice(5, 16).replace('T', ' ')
            return `<div class="a-event"><strong>${esc(label)}</strong><div>${esc(t)}</div></div>`
          }).join('')}</div>`
        } catch (err) {
          el.innerHTML = `<p class="a-empty">${esc(err.message || err)}</p>`
        }
      },
    })
  }

  const btn = (count, listKey, description, which = 'overview') => {
    if (count == null) return '待获取'
    return `<button class="a-tablelink" data-list="${esc(listKey)}" data-desc="${esc(description)}" data-which="${which}">${count}</button>`
  }

  async function render() {
    if (!host.isConnected) return
    const reqId = ++inflight
    const endAt = lockedPeriod?.endAt ?? Math.floor((asOf + 7 * 3600000) / 86400000) * 86400000 - 7 * 3600000
    const startAt = lockedPeriod?.startAt ?? endAt - state.range * 86400000
    const dateFmt = date || (t => new Date(t + 7 * 3600000).toISOString().slice(5, 10).replace('-', '/'))

    host.innerHTML = `<div class="a-card"><p class="a-muted">正在加载人群对比…</p></div>`

    let overview
    try {
      overview = await fetchComparisonMetrics({
        start: startAt,
        end: endAt,
        dimension: state.dimension,
        filters: state.filters,
        audience_ids: audienceIds,
        cohort_id: cohortId,
      })
    } catch (err) {
      if (reqId !== inflight) return
      host.innerHTML = `<div class="a-card"><h2>人群对比加载失败</h2><p>${esc(err.message || err)}</p></div>`
      return
    }
    if (reqId !== inflight) return
    cacheId = overview.drill?.cache_id

    let funnel = null
    if (state.view === 'funnel') {
      try {
        funnel = await fetchComparisonFunnelMetrics({
          start: startAt,
          end: endAt,
          dimension: state.dimension,
          filters: state.filters,
          preset: state.funnel,
          hours: state.hours,
          association: state.association,
          audience_ids: audienceIds,
          cohort_id: cohortId,
        })
        funnelCacheId = funnel.drill?.cache_id
      } catch (err) {
        funnel = { error: err.message || String(err) }
      }
    }

    const sources = { all: '全部来源' }
    // Pull sources from overview row keys when dimension=source; otherwise keep generic
    if (state.dimension === 'source') {
      for (const r of overview.rows || []) sources[r.key] = r.label
    }

    const metric = (r, key, label) => {
      const n = r[key]
      return `${btn(n, `${r.key}:${key}`, `${r.label} · ${label}`)}<br><span class="a-muted">${pct(n, r.people)} 组内占比</span>`
    }

    host.innerHTML = `
      <div class="a-card">
        <div class="a-cardhead"><h2>人群对比</h2><span class="a-chip">服务端聚合 · 分页下钻</span></div>
        <div class="a-compare-controls">
          ${select('data-compare-range', '统计周期', { 7: '最近7天', 14: '最近14天', 28: '最近28天' }, state.range)}
          ${select('data-compare-dimension', '对比维度', DIMENSIONS, state.dimension)}
          ${Object.entries(DIMENSIONS).map(([k, n]) =>
            select(`data-compare-filter="${k}"`, n, k === 'source' ? sources : choices[k], state.filters[k] ?? 'all')
          ).join('')}
        </div>
        <div class="a-cardhead">
          <button class="a-button" data-compare-reset>重置条件</button>
          <button class="a-button" data-compare-save>保存对比配置</button>
          <span role="status">${esc(status)}</span>
        </div>
        <p class="a-details">${dateFmt(startAt)}–${dateFmt(endAt - 86400000)} · 筛选后 ${overview.pool_size} 人 · 数字与下钻同口径，不加载全量用户对象。</p>
      </div>
      <div class="a-compare-tabs" role="group" aria-label="对比分析视图">
        ${Object.entries({ overview: '概览', funnel: '漏斗' }).map(([key, label]) =>
          `<button class="a-button" data-compare-view="${key}" aria-pressed="${state.view === key}">${label}</button>`
        ).join('')}
        <span class="a-muted">留存/趋势视图待下一迭代</span>
      </div>
      <div class="a-card" data-analysis-view="overview" ${state.view !== 'overview' ? 'hidden' : ''}>
        <div class="a-cardhead"><h2>周期表现</h2><span class="a-muted">点击人数下钻</span></div>
        ${(overview.rows || []).length
          ? table(
            [DIMENSIONS[state.dimension], '用户池', '有效分析', '首次分析', 'AI策略', '高频核心', '交易用户', '推荐者'],
            overview.rows.map(r => [
              esc(r.label),
              btn(r.people, `${r.key}:people`, `${r.label} · 用户池`),
              metric(r, 'analyzed', '有效分析'),
              metric(r, 'fresh', '首次分析'),
              metric(r, 'ai', 'AI策略'),
              metric(r, 'core', '高频核心'),
              metric(r, 'traders', '交易用户'),
              metric(r, 'inviters', '推荐者'),
            ]),
          )
          : '<p class="a-empty">暂无符合筛选条件的用户。</p>'}
      </div>
      <div class="a-card" data-analysis-view="funnel" ${state.view !== 'funnel' ? 'hidden' : ''}>
        <div class="a-cardhead">
          <h2>漏斗对比</h2>
          ${select('data-compare-funnel', '漏斗类型', Object.fromEntries(Object.entries(FUNNELS).map(([k, v]) => [k, v.label])), state.funnel)}
          ${select('data-compare-association', '关联模式', ASSOCIATIONS, state.association)}
          ${select('data-compare-hours', '转化窗口', { 1: '1小时', 24: '24小时', 72: '72小时' }, state.hours)}
        </div>
        ${funnel?.error
          ? `<p class="a-empty">${esc(funnel.error)}</p>`
          : funnel
            ? table(
              ['人群', '步骤', '到达', '相对起点', '逐步转化', '已确认流失', '待观察'],
              (funnel.groups || []).flatMap(g => (g.stages || []).map((s, i) => [
                esc(g.label),
                esc(EVENT_LABELS[s.key] || s.key),
                btn(s.reached, `${g.key}:funnel_reached_${i}`, `${g.label} · ${EVENT_LABELS[s.key] || s.key}`, 'funnel'),
                pct(s.reached, g.entered),
                i === 0 ? '—' : pct(s.reached, g.stages[i - 1].reached),
                i === g.stages.length - 1 ? '—' : btn(s.lost, `${g.key}:funnel_lost_${i}`, `${g.label} · 流失`, 'funnel'),
                i === g.stages.length - 1 ? '—' : btn(s.pending, `${g.key}:funnel_pending_${i}`, `${g.label} · 待观察`, 'funnel'),
              ])),
            ) + `<p class="a-details">有效关联起点与缺 ID 质量：${(funnel.groups || []).map(g => `${esc(g.label)} 入组 ${g.entered} / 缺起点 ${btn(g.missing_start, `${g.key}:funnel_missing_start`, g.label + ' 缺起点', 'funnel')} / 缺后续 ${btn(g.incomplete, `${g.key}:funnel_incomplete`, g.label + ' 缺后续', 'funnel')}`).join('；')}</p>`
            : '<p class="a-muted">切换到漏斗视图后加载。</p>'}
      </div>`

    if (lockedPeriod) {
      const rangeSelect = host.querySelector('[data-compare-range]')
      if (rangeSelect) {
        rangeSelect.innerHTML = '<option>人群原统计期</option>'
        rangeSelect.disabled = true
      }
    }

    host.querySelectorAll('[data-compare-view]').forEach(b => {
      b.onclick = () => { state.view = b.dataset.compareView; render() }
    })
    host.querySelector('[data-compare-range]')?.addEventListener('change', e => {
      state.range = +e.target.value; render()
    })
    host.querySelector('[data-compare-dimension]')?.addEventListener('change', e => {
      state.dimension = e.target.value; render()
    })
    host.querySelectorAll('[data-compare-filter]').forEach(s => {
      s.onchange = e => {
        state.filters[s.dataset.compareFilter] = e.target.value
        render()
      }
    })
    host.querySelector('[data-compare-funnel]')?.addEventListener('change', e => {
      state.funnel = e.target.value
      state.association = FUNNELS[state.funnel].association ?? 'user'
      render()
    })
    host.querySelector('[data-compare-association]')?.addEventListener('change', e => {
      state.association = e.target.value; render()
    })
    host.querySelector('[data-compare-hours]')?.addEventListener('change', e => {
      state.hours = +e.target.value; render()
    })
    host.querySelector('[data-compare-reset]')?.addEventListener('click', () => {
      state = { dimension: 'language', range: 14, filters: {}, view: 'overview', funnel: 'analysis', hours: 24, association: 'user' }
      status = '已重置'
      render()
    })
    host.querySelector('[data-compare-save]')?.addEventListener('click', () => {
      try {
        localStorage.setItem(STORAGE, JSON.stringify(state))
        status = '对比配置已保存'
      } catch {
        status = '保存失败，浏览器存储不可用'
      }
      render()
    })
    host.querySelectorAll('[data-list]').forEach(b => {
      b.onclick = () => openDrill(b.dataset.desc, '人群对比 · 与表格相同口径', b.dataset.list, b.dataset.which)
    })
  }

  render()
  return () => { inflight += 1 }
}

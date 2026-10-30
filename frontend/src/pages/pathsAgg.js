import {createBehaviorPathsPage} from './behaviorPaths.js'
import {viewState} from '../components/viewStates.js'
import {beginPageLoad} from './pageLoading.js'
import { fetchPathsMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'
import { createChartLifecycle } from './chartLifecycle.js'

export function createPathsAggPage(ctx) {
  if(ctx.dataStore.meta.storage==='hologres')return createBehaviorPathsPage(ctx)
  const { root, $, $$, names, day, date, esc, fmt, pct, table, stat, themeMedia, drawer } = ctx
  const clearNative = ctx.clear
  const chartLifecycle = createChartLifecycle(themeMedia)
  let nativeChart = null
  let inflight = 0

  const labels = {
    ...names,
    end: '观测结束',
    more: '后续行为（折叠）',
    boundary: '统计窗口截止',
    pending: '仍在观察',
  }

  function openCached(title, description, cacheId, listKey) {
    if (!cacheId || !listKey) return
    drawer.openRemote({
      title,
      description,
      fetchPage: ({ offset, limit, q }) =>
        fetchDrillUsers({
          kind: 'cached_list',
          params: { cache_id: cacheId, list_key: listKey },
          offset,
          limit,
          q,
        }),
      fetchTimeline: async (userId, host) => {
        host.innerHTML = '<p class="a-muted si-loading" role="status">加载时间线…</p>'
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
    chartLifecycle.dispose()
    nativeChart = null
    clearNative()
    const reqId = ++inflight
    const rangeDays = Math.ceil((c.end - c.start) / day)
    if (rangeDays > 7) {
      $('#as-output').innerHTML = `<div class="a-card a-details"><h2>行为路径 · 请缩小窗口</h2><p>聚合模式默认仅支持 ≤7 天统计期（当前 ${rangeDays} 天），以避免大规模会话展开过慢。请改用近 7 天后再运行。</p></div>`
      return
    }

    const finishLoading=beginPageLoad($('#as-output'),{placeholder:'<div class="a-card"><p class="a-muted si-loading" role="status">正在从 /api/metrics/paths 加载…</p></div>',selector:'#as-path-chart',message:'正在重新计算行为路径，当前路径图暂时保留…'});
    let metrics
    try {
      metrics = await fetchPathsMetrics({
        start: c.start,
        end: c.end,
        path_start: c.pathStart || 'all',
        path_depth: c.pathDepth || 5,
        source: c.source || 'all',
        audience_ids: c.audienceIds || null,
        cohort_id: c.cohortId || null,
      })
    } catch (err) {
      if (reqId !== inflight) return
      $('#as-output').innerHTML = viewState({kind:'error',title:'行为路径加载失败',description:err.message||String(err),actionLabel:'重新运行',actionAttr:'data-paths-retry'});
      $('#as-output').querySelector('[data-paths-retry]')?.addEventListener('click',()=>draw(c))
      return
    }finally{finishLoading()}
    if (reqId !== inflight) return

    const cacheId = metrics.drill?.cache_id
    const paths = metrics.paths || []
    const links = metrics.links || []
    const nodes = metrics.nodes || []

    $('#as-output').innerHTML = `
      <div class="a-context"><span class="a-chip">服务端行为路径 · 会话数</span><span>${date(c.start)}–${date(c.end - day)} · ${esc(labels[c.pathStart] || '会话首次行为')}</span></div>
      <div class="a-summary a-four">
        ${stat('分析会话数', fmt(metrics.sessions || 0), '同一用户可有多个会话')}
        ${stat('去重用户数', fmt(metrics.users || 0), '所选起点与来源下的用户')}
        ${stat('最常见路径占比', paths.length ? pct(paths[0].sessions, metrics.sessions) : '—', '按完整展示路径分组')}
        ${stat('平均展示行为数', metrics.sessions ? Number(metrics.average_steps || 0).toFixed(1) : '—', '最多 ' + (c.pathDepth || 5) + ' 步')}
      </div>
      <div class="a-card">
        <div class="a-cardhead"><h2>行为流向</h2><span class="a-muted">${metrics.truncated ? '候选已截断' : `候选 ${fmt(metrics.candidate_count || 0)}`} · 点击连线下钻</span></div>
        <div class="a-chart a-path-chart-scroll"><div id="as-path-chart" style="height:480px;width:100%" role="img" aria-label="用户实际行为流向桑基图"></div></div>
        <div class="a-insight">${metrics.inferred_sessions ? metrics.inferred_sessions + ' 个会话缺少 session_id，按30分钟无操作推断。' : '会话由 session_id 关联。'}名单经 /api/drill 分页，不载入全量用户对象。</div>
      </div>
      <div class="a-card">
        <div class="a-cardhead"><h2>常见行为路径</h2><span class="a-muted">展示前10条，共 ${paths.length} 种</span></div>
        ${table(
          ['行为顺序', '会话数', '去重用户', '会话占比'],
          paths.slice(0, 10).map((p, i) => [
            esc([...p.types, p.terminal].map(t => labels[t] || t).join(' → ')),
            fmt(p.sessions),
            `<button class="a-tablelink" data-path-key="${esc(p.path_key)}">${p.users}</button>`,
            pct(p.sessions, metrics.sessions),
          ]),
        )}
      </div>
      <details class="a-card a-details"><summary>路径统计口径</summary>
        <p>聚合模式默认强制 ≤7 天。优先 session_id；缺失时 30 分钟无操作拆分。展示上限外折叠，窗口外为截止，近 30 分钟结束为仍在观察。</p>
      </details>`

    $$('[data-path-key]').forEach(b => {
      b.onclick = () => openCached('行为路径用户', '同路径去重用户', cacheId, `path:${b.dataset.pathKey}`)
    })

    const host = $('#as-path-chart')
    if (!metrics.sessions) {
      host.innerHTML = '<p class="a-empty">当前筛选没有可分析的行为路径。</p>'
      return
    }
    if (!globalThis.echarts) {
      host.innerHTML = '<p class="a-empty">图表暂不可用，可查看下方路径表。</p>'
      return
    }
    const color = key => {
      const p = document.createElement('span')
      p.style.color = `var(${key})`
      root.appendChild(p)
      const value = getComputedStyle(p).color
      p.remove()
      return value
    }
    nativeChart = echarts.init(host, null, { renderer: 'svg' })
    const paint = () => {
      if (!nativeChart || !host.isConnected) return
      nativeChart.setOption({
        animation: false,
        aria: { enabled: true },
        tooltip: {
          trigger: 'item',
          confine: true,
          formatter: p => p.dataType === 'edge'
            ? `${esc(labels[p.data.source.split(':')[1]] || p.data.source)} → ${esc(labels[p.data.target.split(':')[1]] || p.data.target)}<br/>${p.data.value} 个会话`
            : `第 ${p.data.stage + 1} 步 · ${esc(labels[p.data.type] || p.data.type)}`,
        },
        series: [{
          type: 'sankey',
          left: 8,
          right: 145,
          top: 16,
          bottom: 16,
          nodeWidth: 14,
          nodeGap: 20,
          draggable: false,
          layoutIterations: 32,
          emphasis: { focus: 'adjacency' },
          label: {
            color: color('--a-text'),
            fontSize: 11,
            formatter: p => labels[p.data.type] || p.data.type,
          },
          lineStyle: { color: 'source', opacity: 0.3, curveness: 0.5 },
          data: nodes.map(n => ({
            ...n,
            depth: n.stage,
            itemStyle: {
              color: ['end', 'more', 'boundary', 'pending'].includes(n.type)
                ? color('--a-muted')
                : color('--a-accent'),
            },
          })),
          links: links.map(({ link_key, user_ids, ...link }) => link),
        }],
      }, true)
    }
    paint()
    nativeChart.off('click')
    nativeChart.on('click', p => {
      if (p.dataType !== 'edge') return
      const link = links.find(l => l.source === p.data.source && l.target === p.data.target)
      if (!link) return
      openCached(
        '路径流向用户',
        `${labels[link.source.split(':')[1]] || link.source} → ${labels[link.target.split(':')[1]] || link.target}`,
        cacheId,
        `link:${link.link_key}`,
      )
    })
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

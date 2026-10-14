import {createSegmentInsightsPage} from './segmentInsights.js'
import { fetchSegmentsMetrics } from '../api/metrics.js'
import { fetchDrillUsers, fetchUserTimeline } from '../api/drill.js'
import { mountComparisonAgg } from '../comparison/panelAgg.js'

export function createSegmentsAggPage(ctx) {
  if(ctx.dataStore.meta.storage==='hologres')return createSegmentInsightsPage(ctx)
  const { $, esc, fmt, pct, table, stat, drawer, asof, clock, date, names } = ctx
  const clearNative = ctx.clear
  let inflight = 0
  let previousMetrics = null
  let previousConfig = null
  let comparisonCleanup = null

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
          const data = await fetchUserTimeline({ userId, limit: 200, cacheId })
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
    if (comparisonCleanup) {
      comparisonCleanup()
      comparisonCleanup = null
    }
    clearNative()
    const reqId = ++inflight
    $('#as-output').innerHTML = '<div class="a-card"><p class="a-muted">正在从 /api/metrics/segments 加载…</p></div>'
    const configKey = JSON.stringify(c)
    let metrics
    try {
      metrics = await fetchSegmentsMetrics({
        as_of: ctx.dataStore.meta.asOf,
        source: c.source || 'all',
        audience_ids: c.audienceIds || null,
        cohort_id: c.cohortId || null,
      })
    } catch (err) {
      if (reqId !== inflight) return
      if(previousMetrics && previousConfig===configKey){
        metrics=previousMetrics
        $('#as-data-status').textContent='数据更新失败 · 保留上次结果：'+(err.message||err)
      }else{
      $('#as-output').innerHTML = `<div class="a-card"><h2>分群加载失败</h2><p>${esc(err.message || err)}</p></div>`
      return
      }
    }
    if (reqId !== inflight) return

    previousMetrics=metrics;previousConfig=configKey

    const cacheId = metrics.drill?.cache_id
    const tags = metrics.tags || {}

    $('#as-output').innerHTML = `
      <div class="a-context"><span class="a-chip">服务端分群 · ${ctx.dataStore.meta.storage==='hologres'?'实时用户与行为事实':'user_features'}</span><span>asOf ${clock(asof)} · 共 ${fmt(metrics.total || 0)} 人</span></div>
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
      ${metrics.binding_facts_available?`<div class="a-summary a-four">
        ${stat('被邀请用户', fmt(tags.referred_user || 0), '有效一级邀请关系')}
        ${stat('邀请人', fmt(tags.inviter || 0), '至少一位有效被邀请用户')}
        ${stat('有交易记录用户', fmt(metrics.trade_users || 0), '用户池内历史交易记录')}
        ${stat('交易记录', fmt(metrics.trade_records || 0), '按用户关联，不换算金额')}
      </div><p class="a-muted">注册账号 ${fmt(metrics.registered_users || 0)} · 未匹配账号的事件用户 ${fmt(metrics.unmatched_event_users || 0)} · 用户事实截至 ${esc(metrics.facts_as_of || '')}。绑定依据已验证身份；未匹配账号的绑定状态为未知。</p>`:''}
      <div id="as-compare-agg-mount"></div>
      <p class="a-muted">${ctx.dataStore.meta.storage==='hologres'?'覆盖注册账号及已观测登录用户，按远程行为实时分类。未激活表示当前事件历史内未观测到有效分析，不证明历史从未分析；事实更新采用弱一致快照。':'分类基于 rollup 的 user_features；人群对比和下钻由服务端计算。'}</p>`

    $('#as-output').querySelectorAll('[data-seg]').forEach(b => {
      b.onclick = () => openCached(b.dataset.seg, cacheId, b.dataset.seg)
    })

    const compareHost = $('#as-compare-agg-mount')
    if(ctx.dataStore.meta.storage==='hologres'){compareHost.innerHTML='<p class="a-muted">用户、已验证绑定、邀请和交易记录自动随远程版本刷新。人群对比暂未接入远程模式。</p>';return}
    comparisonCleanup = mountComparisonAgg(compareHost, {
      asOf: asof,
      drawer,
      names,
      date,
      audienceIds: c.audienceIds || null,
      cohortId: c.cohortId || null,
      lockedPeriod: ctx.getAudiencePeriod?.() || null,
    })
  }

  return {
    draw,
    dispose() {
      inflight++
      if (comparisonCleanup) {
        comparisonCleanup()
        comparisonCleanup = null
      }
    },
  }
}

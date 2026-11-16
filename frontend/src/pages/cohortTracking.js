import './cohortTracking.css'
import {getCohort, listCohortActions, createCohortAction} from '../analytics/cohortClient.js'
import {fetchBackendMeta} from '../api/backendAnalytics.js'
import {fetchSegmentsMetrics} from '../api/metrics.js'
import {fetchDrillUsers, fetchUserTimeline} from '../api/drill.js'

const DAY = 86400000
const OFFSET = 25200000
const dayStart = t => Math.floor((t + OFFSET) / DAY) * DAY - OFFSET
const localTime = t => Number.isFinite(Number(t)) ? new Date(Number(t) + OFFSET).toISOString().slice(0, 16).replace('T', ' ') : '—'
const localDay = t => localTime(t).slice(5, 10)
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const fmt = value => value == null ? '—' : Number(value).toLocaleString('zh-CN')
const onlyRegistered = id => /^user:[^\s]+$/.test(id)

function metric(label, value, detail) {
  return '<div class="ct-metric"><span class="ct-muted">' + safe(label) + '</span><strong>' + fmt(value) +
    '</strong><small class="ct-muted">' + safe(detail) + '</small></div>'
}

function analysisRequest(ids, start, end, snapshotId) {
  return {
    start, end, source:'all', snapshot_id:snapshotId,
    audience_ids:ids, pool:'registered', group_by:'signal', filters:{}
  }
}

/**
 * Opens a fixed-list cohort tracking inspector without replacing the segment
 * analysis page. Every figure comes from the same server-side audience filter.
 * No fictitious user metrics or analytics are persisted in the browser.
 */
export function openCohortTracking(cohort) {
  const overlay = document.createElement('div')
  overlay.className = 'ct-overlay'
  overlay.setAttribute('role', 'presentation')
  overlay.innerHTML =
    '<section class="ct-dialog" role="dialog" aria-modal="true" aria-label="固定用户追踪">' +
    '<div class="ct-head"><div><span class="ct-muted">固定用户群组 · 行为追踪</span><h2>' + safe(cohort.name) +
    '</h2><p class="ct-muted">固定名单不会因用户沉默而改变，分析仅展示已观测到的行为。</p></div>' +
    '<button class="ct-close" type="button" aria-label="关闭追踪面板" data-ct-close>×</button></div>' +
    '<div data-ct-status role="status">读取固定用户群组和统计快照…</div>' +
    '<div class="ct-grid" data-ct-metrics></div>' +
    '<section class="ct-section"><div class="ct-row"><h3>最近7个自然日 · 每日有效分析人数</h3><button class="a-button" data-ct-reload type="button">刷新统计</button></div>' +
    '<div class="ct-muted">按 UTC+7 自然日去重；今天是进行中，不代表完整日结果。</div><div data-ct-trend>等待数据…</div></section>' +
    '<section class="ct-section"><div class="ct-row"><h3>固定名单成员 · 逐人下钻</h3><input class="ct-search" type="search" data-ct-search placeholder="搜索用户 ID"></div>' +
    '<div class="ct-muted">最近分析与交易记录取服务端已观测事实，未观测不等于从未使用。点击用户查看时间线。</div>' +
    '<div class="ct-scroll" data-ct-users></div><div class="ct-row" data-ct-pages></div><div data-ct-timeline></div></section>' +
    '<section class="ct-section"><h3>记录运营动作</h3><form class="ct-form" data-ct-form>' +
    '<label>运营动作名称<input name="title" maxlength="100" required placeholder="例如：AI 策略训练营邀请"></label>' +
    '<label>执行时间 · UTC+7<input type="datetime-local" name="executed_at" required></label>' +
    '<button class="a-button a-primary" type="submit">记录动作</button>' +
    '<label>备注（可选）<textarea name="note" rows="2" maxlength="1000" placeholder="触达渠道、说明、运营计划"></textarea></label>' +
    '</form><div class="ct-muted">动作只保存运营记录，不会修改用户行为或自动推断因果关系。</div>' +
    '<div data-ct-action-status role="status"></div><ul class="ct-actions" data-ct-actions></ul><div data-ct-compare></div></section>' +
    '</section>'
  document.body.appendChild(overlay)

  const $ = s => overlay.querySelector(s)
  const previousFocus = document.activeElement
  let closed = false, seq = 0, meta, members = [], stats, actions = [], page = 0
  let dayEnd = 0, periodStart = 0, search = '', loadingUsers = false
  const close = () => {
    if (closed) return
    closed = true
    seq++
    document.removeEventListener('keydown', onKey)
    overlay.remove()
    if (previousFocus?.isConnected) previousFocus.focus()
  }
  const onKey = event => { if (event.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  overlay.addEventListener('click', event => { if (event.target === overlay) close() })
  $('[data-ct-close]').onclick = close
  $('[data-ct-reload]').onclick = () => load()
  $('[data-ct-search]').onchange = event => { search = event.target.value.trim(); page = 0; loadUsers() }
  const form = $('[data-ct-form]')
  form.elements.executed_at.value = localTime(Date.now()).replace(' ', 'T')

  function renderActions() {
    $('[data-ct-actions]').innerHTML = actions.length ? actions.map(a =>
      '<li><div class="ct-row"><div><strong>' + safe(a.title) + '</strong><p class="ct-muted">' +
      safe(localTime(a.executed_at)) + ' · ' + safe(a.note) + '</p></div>' +
      '<button class="a-button" data-ct-effect="' + safe(a.id) + '" type="button">比较前后7天</button></div></li>'
    ).join('') : '<li class="ct-muted">暂无运营动作记录。</li>'
    overlay.querySelectorAll('[data-ct-effect]').forEach(button => {
      button.onclick = () => compareAction(actions.find(a => a.id === button.dataset.ctEffect))
    })
  }

  form.onsubmit = async event => {
    event.preventDefault()
    const status = $('[data-ct-action-status]')
    const title = form.elements.title.value.trim()
    const note = form.elements.note.value.trim()
    const executed_at = Date.parse(form.elements.executed_at.value + ':00+07:00')
    if (!Number.isFinite(executed_at)) { status.textContent = '执行时间无效'; return }
    const button = form.querySelector('[type=submit]')
    button.disabled = true
    status.textContent = '保存中…'
    try {
      const result = await createCohortAction(cohort.id, {title, note, executed_at})
      if (closed) return
      actions = [result.action, ...actions].sort((a,b)=>b.executed_at-a.executed_at)
      form.elements.title.value = ''
      form.elements.note.value = ''
      status.textContent = '运营动作已保存'
      renderActions()
    } catch (error) {
      if (!closed) status.textContent = '保存失败：' + error.message
    } finally { if (!closed) button.disabled = false }
  }

  async function loadUsers() {
    if (closed || !stats?.drill?.cache_id || loadingUsers) return
    loadingUsers = true
    const ticket = seq, target = $('[data-ct-users]')
    target.innerHTML = '<p class="ct-muted">正在加载用户明细…</p>'
    try {
      const list = await fetchDrillUsers({
        kind:'cached_list', params:{cache_id:stats.drill.cache_id,list_key:'all'},
        offset:page*20, limit:20, q:search
      })
      if (closed || ticket !== seq) return
      target.innerHTML = list.rows.length ?
        '<table class="ct-table"><thead><tr><th>用户 ID</th><th>最近观测分析</th><th>交易记录</th><th>查看</th></tr></thead><tbody>' +
        list.rows.map(r =>
          '<tr><td>' + safe(r.id) + '</td><td>' + safe(localTime(r.last_chip_at)) +
          '</td><td>' + fmt(r.trade_count) + '</td><td><button class="a-button" type="button" data-ct-user="' +
          safe(r.id) + '">行为时间线</button></td></tr>'
        ).join('') + '</tbody></table>' : '<p class="ct-muted">没有匹配的用户。</p>'
      $('[data-ct-pages]').innerHTML = '<span class="ct-muted">服务端匹配 ' + fmt(list.total) +
        ' 人 · 第 ' + (page+1) + '/' + Math.max(1,Math.ceil(list.total/20)) + ' 页</span>' +
        '<span><button class="a-button" data-ct-prev ' + (page ? '' : 'disabled') +
        '>上一页</button> <button class="a-button" data-ct-next ' +
        ((page+1)*20<list.total ? '' : 'disabled') + '>下一页</button></span>'
      $('[data-ct-prev]').onclick = () => {page--;loadUsers()}
      $('[data-ct-next]').onclick = () => {page++;loadUsers()}
      overlay.querySelectorAll('[data-ct-user]').forEach(button => {
        button.onclick = () => loadTimeline(button.dataset.ctUser)
      })
    } catch (error) {
      if (!closed && ticket === seq) target.textContent = '明细加载失败：' + error.message
    } finally { loadingUsers = false }
  }

  async function loadTimeline(userId) {
    const host = $('[data-ct-timeline]')
    host.innerHTML = '<p class="ct-muted">正在查询 ' + safe(userId) + ' 的事件…</p>'
    const ticket = seq
    try {
      const data = await fetchUserTimeline({
        userId, start:periodStart, end:dayEnd, cacheId:stats?.drill?.cache_id, limit:200
      })
      if (closed || ticket !== seq) return
      host.innerHTML = '<h4>' + safe(userId) + ' · 期间事件（最多200条）</h4><div class="ct-timeline">' +
        (data.events?.length ? data.events.map(e =>
          '<p><strong>' + safe(e.event_name) + '</strong> · ' + safe(localTime(e.t)) + '</p>'
        ).join('') : '<p class="ct-muted">所选期间没有观测到行为事件。</p>') + '</div>'
    } catch (error) {
      if (!closed && ticket === seq) host.textContent = '事件查询失败：' + error.message
    }
  }

  async function loadTrend(ticket) {
    const host = $('[data-ct-trend]')
    host.innerHTML = '<p class="ct-muted">加载7天趋势，按固定用户范围查询…</p>'
    const startDay = dayStart(Number(meta.asOf) || Date.parse(meta.as_of)) - 6*DAY
    const asOf = Number(meta.asOf) || Date.parse(meta.as_of)
    const days = Array.from({length:7}, (_,i) => ({
      start:startDay+i*DAY, end:Math.min(startDay+(i+1)*DAY,asOf+1), summary:null, error:null
    }))
    let next = 0
    async function worker() {
      while (next < days.length) {
        const i = next++, day = days[i]
        try {
          const result = await fetchSegmentsMetrics(analysisRequest(members,day.start,day.end,meta.snapshot_id))
          day.summary = result.summary
        } catch(error) { day.error = error.message }
      }
    }
    await Promise.all([worker(),worker()])
    if (closed || ticket !== seq) return
    const counts = days.map(d=>d.summary?.analysis_users)
    const maximum = Math.max(1,...counts.filter(v=>Number.isFinite(v)))
    host.innerHTML = '<div class="ct-bars" role="img" aria-label="最近7天有效分析用户数">' +
      days.map((d,i) => {
        const count = counts[i]
        const height = count==null ? 0 : Math.max(2,Math.round(count/maximum*100))
        return '<div class="ct-bar"><b>' + fmt(count) + '</b><div class="ct-bar-track"><div class="ct-bar-fill" style="height:' +
          height + '%"></div></div><small>' + safe(localDay(d.start)) + '</small>' +
          (d.error ? '<small title="' + safe(d.error) + '">失败</small>' : (i===6?'<small>进行中</small>':'')) + '</div>'
      }).join('') + '</div>' +
      (days.some(d=>d.error)?'<p class="ct-error">部分日期查询失败，显示为“—”，不会补零。</p>':'')
  }

  async function compareAction(action) {
    if (!action || !meta) return
    const host = $('[data-ct-compare]')
    const firstDay = dayStart(action.executed_at)
    const asOf = Number(meta.asOf) || Date.parse(meta.as_of)
    const beforeStart = firstDay - 7*DAY
    const afterStart = firstDay + DAY
    const afterEnd = afterStart + 7*DAY
    if (afterEnd > asOf + 1) {
      host.innerHTML = '<p class="ct-muted">' + safe(action.title) +
        '：动作后的7个完整自然日尚未结束，暂不比较，避免把未成熟数据当成效果。</p>'
      return
    }
    host.innerHTML = '<p class="ct-muted">正在查询动作前后各7个完整自然日…</p>'
    const ticket=seq
    try {
      const [before,after] = await Promise.all([
        fetchSegmentsMetrics(analysisRequest(members,beforeStart,firstDay,meta.snapshot_id)),
        fetchSegmentsMetrics(analysisRequest(members,afterStart,afterEnd,meta.snapshot_id))
      ])
      if (closed || ticket !== seq) return
      const b=before.summary,a=after.summary
      host.innerHTML='<h4>' + safe(action.title) + ' · 完整7天前后对比</h4><div class="ct-compare">' +
        [['有效分析人数','analysis_users'],['使用AI策略人数','strategy_users'],['有交易记录人数','trade_users']]
          .map(([label,key])=>'<div><small class="ct-muted">' + safe(label) + '</small><b>' +
            fmt(b?.[key]) + ' → ' + fmt(a?.[key]) + '</b></div>').join('') + '</div>' +
        '<p class="ct-muted">动作当天不计入任一观察窗口。同一批固定用户，统计的是相关变化，不能单独证明运营动作带来了增长。历史事件采集覆盖可能不完整。</p>'
    } catch (error) {
      if (!closed || ticket !== seq) return
      host.textContent='效果比较失败：' + error.message
    }
  }

  async function load() {
    const ticket = ++seq
    $('[data-ct-status]').textContent='正在读取最新快照与固定名单…'
    $('[data-ct-trend]').textContent='等待最新快照…'
    $('[data-ct-users]').textContent=''
    $('[data-ct-timeline]').textContent=''
    $('[data-ct-pages]').textContent=''
    try {
      const [full, currentMeta, history] = await Promise.all([
        getCohort(cohort.id), fetchBackendMeta(), listCohortActions(cohort.id)
      ])
      if (closed || ticket!==seq) return
      if (full.kind === 'dynamic') throw new Error('请选择固定名单。动态人群不能直接做持续追踪。')
      const raw = (full.user_ids || []).map(v => String(v).startsWith('user:') ? String(v) : 'user:' + String(v))
      const unique = [...new Set(raw.filter(onlyRegistered))]
      if (!unique.length) throw new Error('固定名单为空，或没有可识别的注册用户 ID')
      const asOf = Number(currentMeta.asOf) || Date.parse(currentMeta.as_of)
      if (!Number.isFinite(asOf)) throw new Error('数据快照时间无效')
      members=unique;meta=currentMeta;actions=history.actions||[]
      periodStart=dayStart(asOf)-6*DAY;dayEnd=asOf+1
      renderActions()
      const result=await fetchSegmentsMetrics(analysisRequest(members,periodStart,dayEnd,meta.snapshot_id))
      if (closed || ticket!==seq) return
      stats=result
      const s=stats.summary||{}
      $('[data-ct-metrics]').innerHTML =
        metric('固定名单',members.length,'不会自动移除沉默用户') +
        metric('服务端匹配',stats.total,'未匹配 '+Math.max(0,members.length-(stats.total||0))+' 人') +
        metric('期间已登录',s.login_users,'近7个自然日') +
        metric('有效分析',s.analysis_users,'近7个自然日') +
        metric('交易记录用户',s.trade_users,'近7个自然日')
      $('[data-ct-status]').textContent='截至 ' + localTime(asOf) + ' · UTC+7 · ' +
        '近7个自然日（包含今日进行中） · 快照口径。未观测不代表用户未使用。'
      await Promise.all([loadTrend(ticket),loadUsers()])
    } catch (error) {
      if (!closed && ticket===seq) $('[data-ct-status]').innerHTML =
        '<p class="ct-error">追踪加载失败：' + safe(error.message) + '</p>'
    }
  }

  $('[data-ct-close]').focus()
  load()
  return {close}
}

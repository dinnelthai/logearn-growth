import "./styles.css";
import "./polish.css";
import "./brand-logo.css";
import "./growth-agent-ui.css";

async function start() {
  const status=document.getElementById('as-data-status')
  const badge=document.getElementById('as-data-badge')
  const root=document.getElementById('la-studio')

  // ── Auth gate ───────────────────────────────────────────────────────────────
  // Only active when backend URL is configured; skipped in JSON-only mode.
  const backendBase = import.meta.env.VITE_BACKEND_BASE_URL
  let currentUser = null
  if (backendBase) {
    const { getMe } = await import('./auth/authClient.js')
    try {
      const data = await getMe()
      currentUser = data.user
    } catch {
      // Not logged in — show login page and wait
      const { mountLoginPage } = await import('./auth/loginPage.js')
      currentUser = await new Promise(resolve => {
        mountLoginPage(document.body, { onSuccess: resolve })
      })
    }
    // Mount user menu after login
    const { mountUserMenu } = await import('./auth/userMenu.js')
    mountUserMenu(root, {
      user: currentUser,
      onLogout: () => {
        globalThis.LOGEARN_ANALYTICS_DATA = null
        location.reload()
      },
      getCurrentConfig: () => globalThis.__CURRENT_ANALYTICS_CONFIG ?? null,
    })
  }

  // ── Data loading ────────────────────────────────────────────────────────────
  // Prefer backend SQLite facts when the auth backend is configured.
  // Large datasets use aggregated metrics APIs (meta-only bootstrap).
  if (!globalThis.LOGEARN_ANALYTICS_DATA && backendBase) {
    badge.textContent='后端数据 · 加载中'
    document.querySelectorAll('#la-studio button, #la-studio select').forEach(b=>b.disabled=true)
    try {
      const {fetchBackendMeta,fetchAllBackendAnalytics}=await import('./api/backendAnalytics.js')
      const {default:channels}=await import('./channels/channels.json')
      const {default:lifecycleRulesJson}=await import('./lifecycle/lifecycle-rules.json')
      const meta=await fetchBackendMeta()
      const startAt=Date.parse(meta.start_at)
      const asOf=Date.parse(meta.as_of)
      if(!Number.isFinite(startAt)||!Number.isFinite(asOf))throw new Error('事件覆盖时间无效')

      const useAggregated=meta.mode==='aggregated' || Number(meta.event_count)>Number(meta.max_events_raw||100000)
      if(useAggregated){
        const {sourceCoverage}=await import('./analytics/coverage.js')
        const eventsCov=sourceCoverage(meta.coverage?.events??meta,'events',asOf,startAt)
        const tradesCov=sourceCoverage(meta.coverage?.trades??{},'trades',asOf,startAt)
        // Scale path: do NOT download raw events into the browser.
        globalThis.LOGEARN_ANALYTICS_DATA={
          meta:{
            startAt,
            asOf,
            timezone:meta.timezone??'Asia/Bangkok',
            source:'backend-agg',
            storage:meta.storage??'sqlite',
            capabilities:meta.capabilities??null,
            snapshot_cutoff:meta.snapshot_cutoff??null,
            sources:meta.sources??[],
            funnelSteps:meta.funnel_steps??null,
            strategies:meta.strategies??[],
            dataVersion:meta.data_version??null,
            historyComplete:!!meta.history_complete,
            coverage:{events:eventsCov,trades:tradesCov},
            eventCount:meta.event_count,
            userCount:meta.user_count,
            rollupsBuiltAt:meta.rollups_built_at??null,
          },
          users:[],
          trades:null,
          referrals:null,
          channelRules:channels.rules??null,
          lifecycleRules:lifecycleRulesJson?.rules??null,
          availability:{events:'aggregated',users:'aggregated',trades:'aggregated',referrals:'aggregated'},
          inputQuality:null,
          tradeQuality:null,
        }
        badge.textContent=`聚合模式 · ${(meta.event_count??0).toLocaleString('en-US')} 事件`
        status.textContent=`数据量较大，已启用服务端聚合（/api/metrics）。观测截至 ${meta.as_of ?? ''}；rollup ${meta.rollups_built_at ? '已构建' : '未构建'}。未迁移页面会提示暂不可用，不会回退成假零。`
      } else {
        const {normalizeApiResponse}=await import('./analytics/normalize.js')
        const {observationCeiling}=await import('./analytics/coverage.js')
        const raw=await fetchAllBackendAnalytics()
        const cov=raw.coverage??{}
        const asOfCeiling=observationCeiling({events:cov,trades:raw.tradesCoverage,asOf})
        const data=normalizeApiResponse({
          users:[],
          events:raw.events,
          logearnUsers:raw.logearnUsers,
          referrals:raw.referrals,
          trades:raw.trades,
          startAt,
          asOf:asOfCeiling,
          timezone:meta.timezone??'Asia/Bangkok',
          channelRules:channels.rules,
          coverage:cov,
          tradesCoverage:raw.tradesCoverage,
        })
        data.meta.source='backend'
        data.channelRules=channels.rules??null
        data.lifecycleRules=lifecycleRulesJson?.rules??null
        data.userReferrals=raw.userReferrals??null
        globalThis.LOGEARN_ANALYTICS_DATA=data
        badge.textContent=`后端数据 · ${raw.events.length} 事件`
      }
    } catch (err) {
      console.error('[main] backend analytics load failed:', err)
      badge.textContent='后端数据 · 请求失败'
      status.textContent='分析数据接口请求失败，请确认后端已启动并已登录后重试。'
      const retry=document.createElement('button')
      retry.className='a-button';retry.textContent='重新加载';retry.onclick=()=>location.reload()
      status.append(' ',retry)
      document.getElementById('as-output').textContent='分析结果暂不可用。'
      document.getElementById('as-dirty').textContent='数据尚未加载'
      return
    }
    document.querySelectorAll('#la-studio button, #la-studio select').forEach(b=>b.disabled=false)
  } else if (!globalThis.LOGEARN_ANALYTICS_DATA && import.meta.env.VITE_ANALYTICS_DATA_SOURCE === 'api') {
    badge.textContent='真实数据 · 加载中'
    document.querySelectorAll('#la-studio button, #la-studio select').forEach(b=>b.disabled=true)
    try {
      const {fetchAllAnalyticsData}=await import('./api/analytics.js')
      const {normalizeApiResponse}=await import('./analytics/normalize.js')
      const asOf=Date.now(),startAt=asOf-90*86400000
      const raw=await fetchAllAnalyticsData(startAt,asOf)
      const {default:channels}=await import('./channels/channels.json')
      const {observationCeiling}=await import('./analytics/coverage.js')
      const observedAsOf=observationCeiling({events:raw.coverage,trades:raw.tradesCoverage,asOf})
      const data=normalizeApiResponse({...raw,startAt,asOf:observedAsOf,timezone:'Asia/Bangkok',channelRules:channels.rules})
      data.channelRules=channels.rules
      data.userReferrals=raw.userReferrals??null
      globalThis.LOGEARN_ANALYTICS_DATA=data
    } catch {
      badge.textContent='真实数据 · 请求失败'
      status.textContent='数据请求失败，请检查接口配置后重试。'
      const retry=document.createElement('button')
      retry.className='a-button';retry.textContent='重新加载';retry.onclick=()=>location.reload()
      status.append(' ',retry)
      document.getElementById('as-output').textContent='分析结果暂不可用。'
      document.getElementById('as-dirty').textContent='数据尚未加载'
      return
    }
    document.querySelectorAll('#la-studio button, #la-studio select').forEach(b=>b.disabled=false)
  }

  // Ensure data is loaded; if neither backend nor API mode provided data, fail explicitly
  if (!globalThis.LOGEARN_ANALYTICS_DATA) {
    badge.textContent = '数据源未配置'
    status.textContent = '未配置有效的数据源。请设置 VITE_BACKEND_BASE_URL 或 VITE_ANALYTICS_DATA_SOURCE=api。'
    document.getElementById('as-output').textContent = '分析结果暂不可用。'
    document.getElementById('as-dirty').textContent = '数据未加载'
    return
  }

  await import('./chartRuntime.js')
  await import('./dashboard.js')
  await import('./tooltips.js')
  if (globalThis.LOGEARN_ANALYTICS_DATA?.meta.storage === 'hologres') {
    const { mountManualRefresh } = await import('./api/remoteRefresh.js')
    mountManualRefresh()
  }

}
start().catch((err)=>{
  console.error('[main] start() failed:', err)
  document.getElementById('as-data-status').textContent='页面初始化失败：' + (err?.message ?? err) + ' — 请刷新重试。'
})


import "./workspace.css";

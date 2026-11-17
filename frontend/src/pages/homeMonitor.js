import {weeklyCoreMarkup,bindWeeklyCore} from './weeklyCore.js'
import {mountPlatformAssets} from './platformAssets.js'
import {loadingState} from './loadingState.js'
import {beginPageLoad} from './pageLoading.js'
import {viewState} from '../components/viewStates.js'
import {inheritedReportPeriod,rememberReportPeriod,reportPeriod,periodFields,bindPeriod} from '../analytics/reportPeriod.js'
import {growthPanel,mountGrowthChart} from './homeGrowth.js'
import {fetchDrillUsers} from '../api/drill.js'
import {mountHomeCharts} from './homeCharts.js'
import {fetchNorthStarMetrics,fetchOnlineTradeMetrics,fetchTradeVolumeMetrics,fetchSegmentsMetrics,fetchMyMonitorMetrics} from '../api/metrics.js'
import {fetchBackendMeta} from '../api/backendAnalytics.js'
import {fetchSystemReliabilityOverview} from '../api/systemReliability.js'
export function createHomeMonitor(ctx){
 const {$,esc,fmt,table}=ctx
 let reportState=inheritedReportPeriod({days:7})
 let request=0,days=reportState.days,charts=[]
 const chainName=c=>({'3':'Solana (3)','56':'BSC (56)','4663':'Robinhood (4663)','5042':'Arc (5042)'}[c]||c)
 const rate=n=>n==null?'—':(n*100).toFixed(1)+'%'
 const card=(label,value,note)=>`<div class="home-kpi"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`
 async function draw(){reportState=inheritedReportPeriod(reportState);days=reportState.days;ctx.clear();const id=++request,host=$('#as-output');const finishLoading=beginPageLoad(host,{placeholder:loadingState('正在加载整体监控…'),selector:'.home-monitor',message:'正在更新经营总览，原有指标暂时保留…'})
 if(!ctx.isAgg){host.innerHTML=viewState({kind:'unavailable',title:'平台概况暂不可用',description:'当前模式没有服务端聚合数据，不能用空值代替业务指标。'});finishLoading();return}
 try{
 const meta=await fetchBackendMeta();if(id!==request)return
 const {start,end}=reportPeriod({...reportState,asOf:Date.parse(meta.as_of)})
 const results=await Promise.allSettled([fetchNorthStarMetrics({start,end,snapshot_id:meta.snapshot_id}),fetchOnlineTradeMetrics({start,end,source:'all',snapshot_id:meta.snapshot_id}),fetchTradeVolumeMetrics({start,end,snapshot_id:meta.snapshot_id}),fetchSegmentsMetrics({start,end,source:'all',snapshot_id:meta.snapshot_id,pool:'registered',filters:{},group_by:'signal'}),fetchMyMonitorMetrics({start,end,snapshot_id:meta.snapshot_id}),fetchSystemReliabilityOverview()]);if(id!==request)return
 ctx.onMetadata?.(meta)
 const north=results[0].status==='fulfilled'?results[0].value:null,trade=results[1].status==='fulfilled'?results[1].value:null,t=trade?.total
 const segments=results[3].status==='fulfilled'?results[3].value:null
 const volume=results[2].status==='fulfilled'?results[2].value:null,growth=results[4].status==='fulfilled'?results[4].value:null,reliability=results[5].status==='fulfilled'?results[5].value:null
 const money=n=>n==null?'—':'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2})
 const daily=north?.days||[],today=daily.find(d=>d.date===new Date(Math.min(end-1,Date.parse(meta.as_of))+25200000).toISOString().slice(0,10))
 const firstObservedDate=new Date(Date.parse(meta.start_at)+25200000).toISOString().slice(0,10)
 const observed=(d,n)=>d.date<firstObservedDate?'—':fmt(n)
 const asOfDate=new Date(Math.min(end-1,Date.parse(meta.as_of))+25200000).toISOString().slice(0,10),isToday=asOfDate===new Date(Date.now()+25200000).toISOString().slice(0,10),dayLabel=isToday?'今日':reportState.days==='custom'?'所选截止日':'截至日'
 const stamp=new Date(Date.parse(meta.as_of)+25200000).toISOString().slice(0,16).replace('T',' ')
 const attentionItems=[]
 if(!north)attentionItems.push({label:'分析指标加载失败',detail:'北极星与使用数据暂不可用',destination:'north',severity:'is-warning'})
 if(!trade)attentionItems.push({label:'交易指标加载失败',detail:'交易结果与订单状态暂不可用',destination:'trade-monitor',severity:'is-warning'})
 if(!growth)attentionItems.push({label:'增长转化指标加载失败',detail:'激活与回访数据暂不可用',destination:'growth-insights',severity:'is-warning'})
 if(t?.failed>0)attentionItems.push({label:fmt(t.failed)+' 笔失败订单',detail:'已关联终态失败订单，需要检查失败原因',destination:'trade-monitor',severity:'is-critical'})
 if(t?.pending>0)attentionItems.push({label:fmt(t.pending)+' 个待确认批次',detail:'待确认不等于失败，建议核对链上最终状态',destination:'trade-monitor',severity:'is-warning'})
 if(!segments)attentionItems.push({label:'价值用户指标加载失败',detail:'当前价值线索暂不可用',destination:'segments',severity:'is-warning'})
 if(!reliability)attentionItems.push({label:'系统可靠性数据读取失败',detail:'服务监控状态暂不可用',destination:'system-reliability',severity:'is-warning'})
 else if(reliability.configured&&reliability.state==='collector_unavailable')attentionItems.push({label:'Uptime Kuma 采集器不可用',detail:reliability.error||'无法读取状态页',destination:'system-reliability',severity:'is-warning'})
 else if(reliability.configured&&reliability.summary?.down>0)attentionItems.push({label:fmt(reliability.summary.down)+' 个服务监控异常',detail:'至少一个服务最近一次检查失败，请查看状态与历史心跳',destination:'system-reliability',severity:'is-critical'})
 const attentionMarkup=attentionItems.length?`<section class="a-card si-panel home-attention" aria-label="需要处理的异常"><div class="si-sectionhead"><div><h2>需要处理</h2><p>仅显示当前数据明确支持的异常与故障</p></div><span class="home-attention-count">${attentionItems.length} 项</span></div><div class="home-attention-items">${attentionItems.map(item=>`<button type="button" class="home-attention-item ${item.severity}" data-home-go="${item.destination}"><span class="home-attention-item-copy"><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></span><span class="home-attention-action">查看 →</span></button>`).join('')}</div></section>`:''
 const dailyPulseMarkup=`<section class="a-card si-panel home-daily-pulse" aria-label="每日使用概况"><div class="home-daily-pulse-head"><div><h2>每日使用</h2><p>辅助观察 · 不替代周核心分析指标</p></div><button class="a-button" data-home-go="north">查看分析详情 →</button></div><div class="home-daily-pulse-grid"><div><span>${dayLabel}有效分析用户</span><strong>${today?observed(today,today.active_users):'—'}</strong></div><div><span>周期有效分析用户</span><strong>${north?fmt(north.totals.active_users):'—'}</strong></div><div><span>${dayLabel}首次观测分析</span><strong>${today?observed(today,today.new_users):'—'}</strong></div><div><span>${dayLabel}回访分析</span><strong>${today?observed(today,today.returning_users):'—'}</strong></div></div><p class="home-daily-pulse-note">筹码峰查看或下钻 · 当日去重。首次观测不等于新注册；回访指此前已有分析记录的用户。</p></section>`
 const reliabilitySummary=reliability?.summary||{}
 const reliabilityLabel={up:'全部正常',degraded:'存在异常',warning:'状态待确认',empty:'暂无监控',maintenance:'维护中',unknown:'状态未知',collector_unavailable:'采集器不可用',not_configured:'未接入'}[reliability?.state]||'状态未知'
 const reliabilityClass=reliability?.state==='up'?'is-up':reliability?.state==='degraded'?'is-down':reliability?.state==='warning'?'is-warning':'is-unknown'
 const reliabilitySummaryMarkup=reliability?.configured?`<section class="a-card si-panel home-reliability-summary"><div><span class="activity-eyebrow">SYSTEM RELIABILITY</span><h2>系统可靠性 <span class="sr-status-badge ${reliabilityClass}">${reliabilityLabel}</span></h2><p>${fmt(reliabilitySummary.up||0)}/${fmt(reliabilitySummary.total||0)} 正常 · ${fmt(reliabilitySummary.down||0)} 异常 · 最近平均响应 ${reliabilitySummary.avgLatencyMs==null?'—':fmt(reliabilitySummary.avgLatencyMs)+' ms'}</p></div><button class="a-button" data-home-go="system-reliability">查看监控 →</button></section>`:`<section class="a-card si-panel home-reliability-summary is-unconfigured"><div><span class="activity-eyebrow">SYSTEM RELIABILITY</span><h2>系统可靠性 <span class="sr-status-badge is-unknown">${reliability?'未接入':'暂不可用'}</span></h2><p>接入 Uptime Kuma 后，在这里查看网站、登录 API、交易 API 与链路状态。</p></div><button class="a-button" data-home-go="system-reliability">配置接入 →</button></section>`
 host.innerHTML=`<div class="si-page home-monitor"><section class="home-toolbar"><div class="si-sectionhead"><div><p>数据截至 ${esc(stamp)} · UTC+7 <span class="home-status-pill ${isToday?'is-live':reportState.days==='custom'?'is-historical':'is-check'}">${isToday?'今日进行中':reportState.days==='custom'?'所选历史截止日':'数据截至日 · 采集待核对'}</span></p></div>${periodFields(esc,reportState,'home').replace('data-home-days','data-home-period')}</div></section>


 ${attentionMarkup}${weeklyCoreMarkup(ctx,north?.weekly_core)}${growthPanel(growth,ctx)}${dailyPulseMarkup}${reliabilitySummaryMarkup}<details class="a-card si-panel home-evidence-details" aria-label="首页指标证据范围"><summary>指标证据范围与数据限制</summary><p>历史覆盖：${meta.history_complete===true?'已声明完整':'未确认'} · 连续采集确认截至：${esc(meta.events_complete_through||'未知')}。日期成熟不证明采集完整；查看或下钻是分析行为代理，不代表请求成功或用户理解。</p><button class="a-button" data-home-go="growth-insights">核对注册、复访与诊断覆盖 →</button></details><div data-platform-assets></div>
 <section class="a-card si-panel"><div class="si-sectionhead"><h2>商业表现</h2><span class="a-muted">成交额与手动订单质量分别统计</span></div><div class="home-kpi-grid">${card('周期已知成交额 · USD',volume?money(volume.total.volume_usd):'—','交易哈希去重 · 买卖金额绝对值相加')}${card('手动交易成功用户',t?fmt(t.traders):'—','已关联成功订单的去重用户')}${card('已关联终态成功率',rate(t?.success_rate),'成功订单 / 成功与失败订单')}${card('价值线索用户',segments?`<button class="home-value-link" data-home-value>${fmt(segments.focus.value_users)}</button>`:'—','当前交易、资产与额度线索 · 不等于付费')}</div></section>
 <div class="home-primary-charts"><section class="a-card si-panel"><div class="si-sectionhead"><h2>用户使用趋势</h2><button class="a-button" data-home-go="north">查看分析 →</button></div><div id="home-usage-chart" class="home-chart" role="img" aria-label="每日使用趋势"></div><details class="si-details"><summary>每日使用明细</summary>${table(['日期','已登录访问用户','有效分析用户','首次分析用户','回访分析用户','D7回访'],daily.map(d=>[esc(d.date),observed(d,d.login_users),observed(d,d.active_users),observed(d,d.new_users),observed(d,d.returning_users),d.d7_users==null?'—':fmt(d.d7_users)]))}</details></section>
 <section class="a-card si-panel"><div class="si-sectionhead"><div><h2>每日交易量</h2><p>USD · 按交易日归属 · 买卖不相抵</p></div></div>${volume?'<div id="home-volume-chart" class="home-chart" role="img" aria-label="每日成交额USD"></div>':'<p class="a-empty">交易量加载失败，请刷新后重试。</p>'}<details class="si-details"><summary>每日交易量明细与口径</summary>${volume?table(['日期','成交额USD'],volume.days.map(d=>[esc(d.date),money(d.volume_usd)])):''}<p class="a-muted">按链与交易hash去重；成交量使用业务确认的trade_value美元字段，每笔取绝对值后相加（买卖不相抵）。当前同步覆盖未确认，笔数不等于手动提交批次。${volume?'缺金额记录 '+fmt(volume.total.missing_values)+' 条，负金额记录 '+fmt(volume.total.negative_values)+' 条。':''}</p></details></section>
 </div><details class="a-card si-panel" data-home-trade-details><summary>手动交易结果与各链质量</summary><div class="home-chart-grid"><section class="a-card si-panel"><div class="si-sectionhead"><div><h2>交易结果趋势</h2><p>手动交易 · 已关联终态订单</p></div><button class="a-button" data-home-go="trade-monitor">排查交易 →</button></div><div id="home-trade-chart" class="home-chart" role="img" aria-label="每日交易结果趋势"></div></section><section class="a-card si-panel"><div class="si-sectionhead"><div><h2>各链交易质量</h2><p>成功 / 失败订单 · 待确认批次不计入</p></div></div><div id="home-chain-chart" class="home-chart" role="img" aria-label="各链交易结果对比"></div><details class="si-details"><summary>交易质量明细</summary>${trade?table(['链','提交批次','成功订单','失败订单','终态成功率','待确认批次'],(trade.chains||[]).map(c=>[esc(chainName(c.chain)),fmt(c.submitted),fmt(c.succeeded),fmt(c.failed),rate(c.success_rate),fmt(c.pending)])):'<p>交易指标暂不可用。</p>'}</details></section></div></details>
 <div class="home-bottom-grid home-bottom-single">
 <section class="a-card si-panel"><h2>继续排查</h2><div class="a-audience-actions">${[['growth-insights','增长诊断与变化拆解'],['north','分析与回访'],['trade-monitor','交易失败与待确认'],['segments','运营人群'],['funnel','激活流程'],['paths','入口页与访问记录']].map(([mode,label])=>`<button class="a-button" data-home-go="${mode}">${label}</button>`).join('')}</div><p class="a-muted home-footnote">全平台口径 · 排除 acc_ 标识 · 历史覆盖未确认；未观测不等于没有使用。</p></section></div></div>`
 bindWeeklyCore(ctx,host,north?.weekly_core)
 charts=mountHomeCharts(ctx,daily,null,firstObservedDate,chainName,volume)
 charts.push(mountPlatformAssets(host.querySelector('[data-platform-assets]'),ctx))
 const tradeDetails=host.querySelector('[data-home-trade-details]');let tradeMounted=false;tradeDetails.ontoggle=()=>{if(tradeDetails.open&&!tradeMounted){tradeMounted=true;charts.push(...mountHomeCharts(ctx,[],trade,firstObservedDate,chainName,null,{tradeOnly:true}))}}
 const growthDetails=host.querySelector('[data-home-growth-details]');let growthMounted=false;if(growthDetails)growthDetails.ontoggle=()=>{if(growthDetails.open&&!growthMounted){growthMounted=true;const owner=mountGrowthChart(ctx,growth);if(owner)charts.push(owner)}}
 const valueLink=host.querySelector('[data-home-value]');if(valueLink)valueLink.onclick=()=>ctx.drawer.openRemote({selection:{cache_id:segments.drill.cache_id,list_key:'value'},title:'价值线索用户',description:'与用户分群同口径：截至快照有交易记录、NFT持有记录、近期正余额或可用Credits；不等于付费用户。标签重叠按账号去重。',columns:['用户','业务信号','交易记录数','NFT记录','可用Credits'],renderRow:r=>[esc(r.id),esc(r.signal_tier||'未知'),r.trade_count==null?'未知':fmt(r.trade_count),r.nft_count==null?'未知':fmt(r.nft_count),r.credits_available==null?'未知':fmt(r.credits_available)],fetchPage:({offset,limit,q})=>fetchDrillUsers({kind:'cached_list',params:{cache_id:segments.drill.cache_id,list_key:'value'},offset,limit,q})})
 bindPeriod({querySelector:s=>host.querySelector(s.replace('data-home-days','data-home-period'))},reportState,()=>draw(),'home');host.querySelectorAll('[data-home-go]').forEach(b=>b.onclick=()=>ctx.navigatePlatform?ctx.navigatePlatform(b.dataset.homeGo,{days,asOf:Date.parse(meta.as_of)}):ctx.navigate(b.dataset.homeGo))
 }catch(e){if(id===request){host.innerHTML=viewState({kind:'error',title:'首页加载失败',description:e.message,actionLabel:'重新加载',actionAttr:'data-home-retry'});host.querySelector('[data-home-retry]')?.addEventListener('click',draw)}}
 finally{finishLoading()}
 }
 return {draw,dispose(){request++;charts.forEach(c=>c.dispose());charts=[]}}
}

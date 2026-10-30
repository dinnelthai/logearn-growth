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
 const results=await Promise.allSettled([fetchNorthStarMetrics({start,end,snapshot_id:meta.snapshot_id}),fetchOnlineTradeMetrics({start,end,source:'all',snapshot_id:meta.snapshot_id}),fetchTradeVolumeMetrics({start,end,snapshot_id:meta.snapshot_id}),fetchSegmentsMetrics({start,end,source:'all',snapshot_id:meta.snapshot_id,pool:'registered',filters:{},group_by:'signal'}),fetchMyMonitorMetrics({start,end,snapshot_id:meta.snapshot_id})]);if(id!==request)return
 ctx.onMetadata?.(meta)
 const north=results[0].status==='fulfilled'?results[0].value:null,trade=results[1].status==='fulfilled'?results[1].value:null,t=trade?.total
 const segments=results[3].status==='fulfilled'?results[3].value:null
 const volume=results[2].status==='fulfilled'?results[2].value:null,growth=results[4].status==='fulfilled'?results[4].value:null
 const money=n=>n==null?'—':'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2})
 const daily=north?.days||[],today=daily.find(d=>d.date===new Date(Math.min(end-1,Date.parse(meta.as_of))+25200000).toISOString().slice(0,10)),mature=daily.filter(d=>d.d7_eligible_users>0),d7=mature.length?fmt(mature.reduce((n,d)=>n+(d.d7_users||0),0)):'—'
 const firstObservedDate=new Date(Date.parse(meta.start_at)+25200000).toISOString().slice(0,10)
 const observed=(d,n)=>d.date<firstObservedDate?'—':fmt(n)
 const asOfDate=new Date(Math.min(end-1,Date.parse(meta.as_of))+25200000).toISOString().slice(0,10),isToday=asOfDate===new Date(Date.now()+25200000).toISOString().slice(0,10),dayLabel=isToday?'今日':reportState.days==='custom'?'所选截止日':'截至日'
 const stamp=new Date(Date.parse(meta.as_of)+25200000).toISOString().slice(0,16).replace('T',' ')
 host.innerHTML=`<div class="si-page home-monitor"><section class="home-toolbar"><div class="si-sectionhead"><div><p>数据截至 ${esc(stamp)} · UTC+7 <span class="home-status-pill">${isToday?'今日进行中':reportState.days==='custom'?'所选历史截止日':'数据截至日 · 采集待核对'}</span></p></div>${periodFields(esc,reportState,'home').replace('data-home-days','data-home-period')}</div></section>
 <section class="a-card home-north-hero"><div><span class="activity-eyebrow">北极星 · 每日有效分析用户</span><h2>${dayLabel} ${today?fmt(today.active_users):'—'} <small>人</small></h2><p>筹码峰查看或下钻 · 当日去重 · ${isToday?'今日进行中':'历史截至日'}</p><button class="a-button" data-home-go="north">北极星详情 →</button></div><div class="home-north-support">${card('周期有效分析用户',north?fmt(north.totals.active_users):'—','周期内按用户去重，日人数不相加')}${card(dayLabel+'首次观测分析',today?fmt(today.new_users):'—','首次观测不等于新注册')}${card(dayLabel+'回访分析',today?fmt(today.returning_users):'—','今天分析且更早有分析记录')}</div></section>
 ${weeklyCoreMarkup(ctx,north?.weekly_core)}${growthPanel(growth,ctx)}<details class="a-card si-panel home-evidence-details" aria-label="首页指标证据范围"><summary>指标证据范围与数据限制</summary><p>历史覆盖：${meta.history_complete===true?'已声明完整':'未确认'} · 连续采集确认截至：${esc(meta.events_complete_through||'未知')}。日期成熟不证明采集完整；查看或下钻是分析行为代理，不代表请求成功或用户理解。</p><button class="a-button" data-home-go="growth-insights">核对注册、复访与诊断覆盖 →</button></details><div data-platform-assets></div>
 <section class="a-card si-panel"><div class="si-sectionhead"><h2>商业表现</h2><span class="a-muted">成交额与手动订单质量分别统计</span></div><div class="home-kpi-grid">${card('周期已知成交额 · USD',volume?money(volume.total.volume_usd):'—','交易哈希去重 · 买卖金额绝对值相加')}${card('手动交易成功用户',t?fmt(t.traders):'—','已关联成功订单的去重用户')}${card('已关联终态成功率',rate(t?.success_rate),'成功订单 / 成功与失败订单')}${card('价值线索用户',segments?`<button class="home-value-link" data-home-value>${fmt(segments.focus.value_users)}</button>`:'—','当前交易、资产与额度线索 · 不等于付费')}</div></section>
 <div class="home-primary-charts"><section class="a-card si-panel"><div class="si-sectionhead"><h2>用户使用趋势</h2><button class="a-button" data-home-go="north">查看分析 →</button></div><div id="home-usage-chart" class="home-chart" role="img" aria-label="每日使用趋势"></div><details class="si-details"><summary>每日使用明细</summary>${table(['日期','已登录访问用户','有效分析用户','首次分析用户','回访分析用户','D7回访'],daily.map(d=>[esc(d.date),observed(d,d.login_users),observed(d,d.active_users),observed(d,d.new_users),observed(d,d.returning_users),d.d7_users==null?'—':fmt(d.d7_users)]))}</details></section>
 <section class="a-card si-panel"><div class="si-sectionhead"><div><h2>每日交易量</h2><p>USD · 按交易日归属 · 买卖不相抵</p></div></div>${volume?'<div id="home-volume-chart" class="home-chart" role="img" aria-label="每日成交额USD"></div>':'<p class="a-empty">交易量加载失败，请刷新后重试。</p>'}<details class="si-details"><summary>每日交易量明细与口径</summary>${volume?table(['日期','成交额USD'],volume.days.map(d=>[esc(d.date),money(d.volume_usd)])):''}<p class="a-muted">按链与交易hash去重；成交量使用业务确认的trade_value美元字段，每笔取绝对值后相加（买卖不相抵）。当前同步覆盖未确认，笔数不等于手动提交批次。${volume?'缺金额记录 '+fmt(volume.total.missing_values)+' 条，负金额记录 '+fmt(volume.total.negative_values)+' 条。':''}</p></details></section>
 </div><details class="a-card si-panel" data-home-trade-details><summary>手动交易结果与各链质量</summary><div class="home-chart-grid"><section class="a-card si-panel"><div class="si-sectionhead"><div><h2>交易结果趋势</h2><p>手动交易 · 已关联终态订单</p></div><button class="a-button" data-home-go="trade-monitor">排查交易 →</button></div><div id="home-trade-chart" class="home-chart" role="img" aria-label="每日交易结果趋势"></div></section><section class="a-card si-panel"><div class="si-sectionhead"><div><h2>各链交易质量</h2><p>成功 / 失败订单 · 待确认批次不计入</p></div></div><div id="home-chain-chart" class="home-chart" role="img" aria-label="各链交易结果对比"></div><details class="si-details"><summary>交易质量明细</summary>${trade?table(['链','提交批次','成功订单','失败订单','终态成功率','待确认批次'],(trade.chains||[]).map(c=>[esc(chainName(c.chain)),fmt(c.submitted),fmt(c.succeeded),fmt(c.failed),rate(c.success_rate),fmt(c.pending)])):'<p>交易指标暂不可用。</p>'}</details></section></div></details>
 <div class="home-bottom-grid"><section class="a-card si-panel home-alerts"><div class="si-sectionhead"><h2>需要关注</h2><span class="home-status-pill">诊断线索</span></div>${t?`<div class="home-alert-metrics"><button data-home-go="trade-monitor"><strong>${fmt(t.failed)}</strong><span>失败订单</span></button><button data-home-go="trade-monitor"><strong>${fmt(t.pending)}</strong><span>待确认批次</span></button><div><strong>${rate(t.correlation_rate)}</strong><span>终态关联率</span></div></div>`:''}<ul>${!north?'<li>分析指标加载失败，请刷新后重试。</li>':''}${!trade?'<li>交易监控加载失败，请刷新后重试。</li>':''}${!segments?'<li>价值用户指标加载失败，请刷新后重试。</li>':''}${t?`<li>已关联失败订单 ${fmt(t.failed)} 笔；待确认提交批次 ${fmt(t.pending)} 个；终态关联率 ${rate(t.correlation_rate)}。待确认不等于失败。</li>`:''}<li>${mature.length?'D7包含今日已观测回访，今日结果未结束。':'尚无D7到期批次，暂不能判断7日留存。'}</li><li>历史与连续采集覆盖未确认；首次观测不等于新注册，缺记录不能解释为没有使用。成交额不等于收入，首页不估算收入。</li></ul></section>
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

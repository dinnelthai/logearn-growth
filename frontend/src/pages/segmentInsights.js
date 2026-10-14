import {mountSegmentUserList} from './segmentUserList.js'
import {OPERATING_LEADS,operationsPanel} from './segmentOperations.js'
import {pointsPanel,pointsTrendOption} from './segmentPoints.js'
import {createChartLifecycle} from './chartLifecycle.js'
import {behaviorOption,comparisonOption,cohortOption,SEGMENT_COLORS} from './segmentCharts.js'
import {fetchSegmentsMetrics} from '../api/metrics.js'
import {fetchDrillUsers,fetchUserTimeline} from '../api/drill.js'
const POOLS=[['business','有业务信号（默认）'],['registered','全部注册用户'],['contact_only','仅有邮箱/TG绑定'],['no_signal','无已知业务信号']]
const OPTIONS={
 task:['诊断人群',[['all','全部'],['single_page_no_action','单页访问无操作'],['token_detail_no_analysis','代币详情未分析'],['value_unobserved','有价值线索且近期未观测使用'],['login_no_analysis','本期登录未分析'],['analysis_no_d1','分析后次日未回访（观察期已结束）'],['absent_3d','连续3个完整自然日未观测回来'],['new_no_activity','新注册未观测启动'],['analysis_no_trade','本期分析无交易记录'],['repeat_analysis_no_trade','多日分析无交易记录'],['strategy_no_trade','启动策略无交易记录'],['trade_no_analysis','本期交易未分析'],['analysis_no_binding','分析用户未绑定触达渠道'],['checkin_no_analysis','本期签到未分析'],['referred_no_analysis','被邀请用户本期未分析']]],
 credits:['Credits额度',[['all','全部'],['available','有可用Credits'],['used','有已用Credits'],['empty','可用Credits为0'],['unknown','Credits额度未知']]],
 points:['积分与签到',[['all','全部'],['ledger','有积分流水'],['recent','期间有积分变动'],['earned','期间获得积分'],['negative','期间有负积分变动'],['checkin','期间有签到'],['streak','期间连续签到至少3天']]],
 asset:['资产与权益线索',[['all','全部'],['balance','近期正余额线索'],['nft','有NFT持有记录'],['points','有可用积分'],['balance_unknown','余额未知'],['points_unknown','积分未知']]],
 registration:['注册时间',[['all','全部'],['7','近7日'],['28','8–28日'],['older','28日前']]],
 login:['最近登录',[['all','全部'],['7','近7日'],['28','8–28日'],['older','28日前'],['unknown','未知']]],
 binding:['已验证绑定',[['all','全部'],['telegram','Telegram'],['email','邮箱'],['both','两者都有'],['neither','均未验证绑定']]],
 identity:['身份类型',[['all','全部'],['phantom','Phantom'],['metamask','MetaMask'],['multiple','多种已验证身份']]],
 invitation:['邀请关系',[['all','全部'],['referred','有有效邀请人'],['none','无有效邀请关系'],['inviter','邀请过别人']]],
 status:['账号状态',[['all','全部'],['active','active'],['locked','locked']]],
 segment:['行为分群',[['all','全部'],...['未观测分析','新分析用户','分析型','高频核心','策略型','流失风险','已流失','回流','观察不足'].map(v=>[v,v])]],
 trade:['交易经历',[['all','全部'],['none','无交易记录'],['first','一条交易记录'],['repeat','重复交易记录']]]
}
const GROUPS=[['signal','业务信号层级'],['binding','绑定状态'],['registration','注册时间'],['identity','身份类型'],['invitation','邀请关系'],['trade','交易经历'],['status','账号状态'],['segment','行为分群']]
export function createSegmentInsightsPage(ctx){
 const {$,esc,fmt,pct,stat,table,drawer}=ctx
 let advancedOpen=false,chartOwners=[]
 const disposeCharts=()=>{chartOwners.forEach(c=>c.dispose());chartOwners=[]}
 let applied={days:7,group:'signal',pool:'business',filters:{}},draft=structuredClone(applied),lastConfig=null,active=false,inflight=0,previous=null,previousKey=null
 const time=t=>t==null?'—':new Date(Number(t)+25200000).toISOString().slice(0,16).replace('T',' ')
 const bound=v=>v==null?'未知':v?'已验证':'未验证绑定'
 const rate=v=>v==null?'—':(v*100).toFixed(1)+'%'
 function select(k){const [label,opts]=OPTIONS[k];return `<label>${label}<select data-filter="${k}">${opts.map(([v,l])=>`<option value="${v}" ${(draft.filters[k]||'all')===v?'selected':''}>${l}</option>`).join('')}</select></label>`}
 function operatingPanel(){const activeId=OPERATING_LEADS.find(r=>applied.pool===(r.pool||'business')&&JSON.stringify(applied.filters)===JSON.stringify(r.filters))?.id;return `<details class="a-card segment-collapsed"><summary>运营线索</summary>${operationsPanel({esc,activeId})}</details>`}
 function toolbar(){const extra=Object.keys(OPTIONS).filter(k=>!['asset','binding'].includes(k)),count=extra.filter(k=>draft.filters[k]&&draft.filters[k]!=='all').length;return `<section class="a-card si-filter-card"><div class="si-sectionhead"><div><h2>圈选业务用户</h2><p>选择用户池与统计期，再比较不同人群的表现</p></div><span class="si-note">手动刷新 · 筛选需应用</span></div><div class="si-filter-main">
 <label>用户池<select data-insight="pool">${POOLS.map(([v,l])=>`<option value="${v}" ${draft.pool===v?'selected':''}>${l}</option>`).join('')}</select></label>
 <label>统计期<select data-insight="days" ${lastConfig?.taskLocked||lastConfig?.snapshotId?'disabled':''}>${[7,14,28].map(n=>`<option value="${n}" ${draft.days===n?'selected':''}>最近${n}天（含今日）</option>`).join('')}</select></label>
 ${select('asset')}${select('binding')}
 <label>对比维度<select data-insight="group">${GROUPS.map(([v,l])=>`<option value="${v}" ${draft.group===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
 <div class="si-filter-bottom"><details data-advanced ${advancedOpen||count?'open':''}><summary>更多筛选${count?` · ${count} 项`:''}</summary><div class="si-filter-extra">${extra.map(select).join('')}</div></details><div class="si-filter-actions"><span data-insight-dirty role="status"></span><button class="a-button" data-reset-insights>重置</button><button class="a-button a-primary" data-apply-insights>应用筛选</button></div></div></section>`}
 function open(title,id,key,userQuery=''){drawer.openRemote({selection:{cache_id:id,list_key:key},title,description:'注册账号去重名单；账号状态与绑定为当前事实',
 columns:['用户','业务信号','注册时间','最近分析','绑定','NFT记录','余额线索','可用积分','Credits可用 / 已用 / 总额','Credits更新时间','期间获得 / 负变动','期间签到 / 最长连续','最近积分变动','交易记录'],
 renderRow:r=>[`<button class="a-tablelink" data-user="${esc(r.id)}">${esc(r.id)}</button>`,esc(r.signal_tier||'未知'),esc(time(r.created_at)),esc(time(r.last_chip_at)),`Telegram：${bound(r.telegram_bound)}<br>邮箱：${bound(r.email_bound)}`,r.nft_count==null?'未知':fmt(r.nft_count),r.has_balance==null?'未知':r.has_balance?'近期正余额（未估值）':'近期未观测正余额',r.available_points==null?'未知':fmt(r.available_points),r.credits_available==null?'未知':`${fmt(r.credits_available)} / ${r.credits_used==null?'未知':fmt(r.credits_used)} / ${r.credits_total==null?'未知':fmt(r.credits_total)}`,esc(time(r.credits_updated_at)),`${fmt(r.points_earned_period||0)} / ${fmt(r.points_negative_period||0)}`,`${fmt(r.checkin_days_period||0)}天 / ${fmt(r.checkin_streak_period||0)}天`,esc(time(r.last_points_at)),r.trade_count==null?'未知':fmt(r.trade_count)],
 fetchPage:({offset,limit,q})=>fetchDrillUsers({kind:'cached_list',params:{cache_id:id,list_key:key},offset,limit,q:userQuery||q}),
 fetchTimeline:async(userId,host)=>{host.innerHTML='<p class="a-muted">加载时间线…</p>';try{const r=await fetchUserTimeline({userId,cacheId:id,limit:200});host.innerHTML=`<h2>${esc(userId)} · 事件时间线</h2>${r.events.length?`<div class="a-timeline">${r.events.map(e=>`<div class="a-event"><strong>${esc(e.event_name)}</strong><div>${esc(time(e.t))}</div></div>`).join('')}</div>`:'<p class="a-muted">当前快照内没有观测到事件。</p>'}`}catch(e){host.innerHTML=`<p class="a-empty">${esc(e.message)}</p>`}}
 })}
 const link=(n,key,title)=>`<button class="si-numberlink" data-list="${esc(key)}" data-title="${esc(title)}">${fmt(n)} <span aria-hidden="true">↗</span></button>`
 function comparison(rows){return table(['人群','人数','分析覆盖','策略使用','交易记录','人均分析活跃日'],rows.map(r=>[esc(r.label),link(r.users,r.list_key,r.label),`${link(r.analysis_users,r.list_key+':analysis',r.label+' · 期间分析用户')}<small class="si-cell-caption">${rate(r.analysis_rate)}</small>`,`${link(r.strategy_users,r.list_key+':strategy',r.label+' · 期间策略用户')}<small class="si-cell-caption">${rate(r.strategy_rate)}</small>`,`${link(r.trade_users,r.list_key+':trade',r.label+' · 期间交易用户')}<small class="si-cell-caption">${rate(r.trade_rate)}</small>`,r.avg_analysis_days==null?'—':r.avg_analysis_days.toFixed(1)]))}
 function mountCharts(m){if(!globalThis.echarts||!ctx.root||!ctx.themeMedia)return
  const models=[['#si-behavior-chart',colors=>behaviorOption(m,colors)],['#si-comparison-chart',colors=>comparisonOption(m.comparison,colors)],['#si-cohort-chart',colors=>cohortOption(m.registration_cohorts.slice(0,12),colors)]]
  if(m.points)models.push(['#si-points-chart',colors=>pointsTrendOption(m.points,colors.text)])
  for(const [selector,model]of models){const host=$(selector);if(!host)continue
   const chart=globalThis.echarts.init(host,null,{renderer:'svg'}),owner=createChartLifecycle(ctx.themeMedia)
   const paint=()=>{const style=getComputedStyle(ctx.root),colors={text:style.getPropertyValue('--a-text').trim()||'#24324b',muted:style.getPropertyValue('--a-muted').trim()||'#75829b',border:style.getPropertyValue('--a-border').trim()||'#e5eaf3',panel:style.getPropertyValue('--a-panel').trim()||'#fff'};chart.setOption(model(colors),true)}
   paint();chart.on('click',p=>{if(p.data?.list_key&&(p.data.count??p.value)>0)open((p.data.group||p.name)+' · '+(p.seriesName||'用户'),m.drill.cache_id,p.data.list_key)})
   owner.attach(chart,host,paint);chartOwners.push(owner)
  }
 }
 function bind(){const host=$('#as-output');host.querySelectorAll('[data-operation]').forEach(el=>el.onclick=()=>{const lead=OPERATING_LEADS.find(r=>r.id===el.dataset.operation);if(!lead)return;applied={...applied,pool:lead.pool||'business',filters:{...lead.filters}};draft=structuredClone(applied);return draw(lastConfig)});const extra=host.querySelector('[data-advanced]');if(extra)extra.ontoggle=()=>{advancedOpen=extra.open};if(JSON.stringify(draft)!==JSON.stringify(applied))host.querySelector('[data-insight-dirty]').textContent='筛选未应用；下方为上次结果';host.querySelectorAll('[data-filter]').forEach(el=>el.onchange=()=>{draft.filters[el.dataset.filter]=el.value;host.querySelector('[data-insight-dirty]').textContent='筛选未应用；下方为上次结果'})
 host.querySelectorAll('[data-insight]').forEach(el=>el.onchange=()=>{draft[el.dataset.insight]=el.dataset.insight==='days'?Number(el.value):el.value;host.querySelector('[data-insight-dirty]').textContent='筛选未应用；下方为上次结果'})
 host.querySelector('[data-apply-insights]').onclick=()=>{applied=structuredClone(draft);return draw(lastConfig)}
 host.querySelector('[data-reset-insights]').onclick=()=>{applied={days:7,group:'signal',pool:'business',filters:{}};draft=structuredClone(applied);return draw(lastConfig)}
 }
 async function draw(c){lastConfig=c
 // Preserve draft filters when the data version changes; applying them is explicit.
 if(active&&JSON.stringify(draft)!==JSON.stringify(applied))return
 active=true;disposeCharts();ctx.clear();const req=++inflight,end=c.taskLocked||c.snapshotId?c.end:ctx.dataStore.meta.asOf+1,start=c.taskLocked||c.snapshotId?c.start:Math.floor((end+25200000)/86400000)*86400000-25200000-(applied.days-1)*86400000
 const body={start,end,source:c.source||'all',snapshot_id:c.snapshotId,audience_ids:c.audienceIds||null,cohort_id:c.cohortId||null,filters:applied.filters,group_by:applied.group,pool:applied.pool},key=JSON.stringify({...body,start:0,end:0,days:applied.days})
 $('#as-output').innerHTML='<div class="si-page">'+toolbar()+operatingPanel()+'<div class="si-loading"><span></span>正在更新分析结果…</div></div>';bind()
 let m,error=null
 try{m=await fetchSegmentsMetrics(body)}catch(e){if(req!==inflight)return;if(previous&&previousKey===key){m=previous;error=e.message}else{$('#as-output').innerHTML='<div class="si-page">'+toolbar()+operatingPanel()+`<p class="a-empty">分群加载失败：${esc(e.message)}</p></div>`;bind();return}}
 if(req!==inflight)return
 previous=m;previousKey=key;const s=m.summary,f=m.focus||{}
 const card=(label,n,key,desc,tone='blue')=>`<button class="si-kpi si-${tone}" data-list="${key}" data-title="${label}"><span class="si-kpi-label">${label}<span class="si-arrow" aria-hidden="true">↗</span></span><strong>${fmt(n||0)}</strong><span class="si-kpi-desc">${desc}</span></button>`
 const assets=[['NFT持有记录',f.nft_users,'nft','#9c7ade'],['近期正余额线索',f.positive_balance_users,'balance','#18a999'],['可用积分',f.points_users,'points','#eca545']]
 const groupName=GROUPS.find(([v])=>v===m.group_by)?.[1]||'人群',chips=Object.entries(m.filters||{}).filter(([,v])=>v!=='all').map(([k,v])=>`${OPTIONS[k]?.[0]||k}：${OPTIONS[k]?.[1].find(([id])=>id===v)?.[1]||v}`)
 $('#as-output').innerHTML='<div class="si-page">'+toolbar()+operatingPanel()+`${error?`<p class="si-error">更新失败，显示上次结果：${esc(error)}</p>`:''}
 <div class="si-context"><div><span class="a-chip">${esc(POOLS.find(([v])=>v===m.pool)?.[1]||'注册用户')}</span><strong>${fmt(m.total)} <small>位用户</small></strong><button class="si-numberlink" data-list="all" data-title="当前筛选用户">查看名单 ↗</button></div><span>${esc(time(m.start))} – ${esc(time(m.end-1))} · UTC+7</span></div>
 <div class="si-context-meta"><span>期间新增 ${link(s.new_users,'period:new','期间新增注册用户')} 人</span><span>有效分析 ${link(s.analysis_users,'period:analysis','期间分析用户')} 人 · ${rate(s.analysis_rate)}</span><span>已登录访问 ${link(s.login_users,'period:login','期间已登录访问用户')} 人</span></div>
 ${chips.length?`<div class="si-chips">${chips.map(v=>`<span>${esc(v)}</span>`).join('')}</div>`:''}
 <section class="a-card si-panel"><div class="si-sectionhead"><h2>用户列表</h2><input data-segment-search placeholder="搜索用户或来源" aria-label="搜索分群用户"></div><div data-segment-users></div></section>
 <details class="a-card segment-collapsed" data-segment-details><summary>对比图表、资产与使用明细</summary> <div class="si-kpis">${card('价值线索用户',f.value_users,'value','交易记录、NFT、近期正余额或可用Credits')}${card('近期使用用户',f.recent_used_users,'recent_used','近28天分析或实际启动策略','teal')}${card('可联系的价值用户',f.contactable_value_users,'contactable_value','价值线索 + 已验证邮箱/TG','violet')}${card('价值用户未观测近期使用',f.value_without_recent_use,'value_without_recent_use','近28天未观测使用，不代表流失','amber')}</div>
 <div class="si-period-metrics"><div><span>期间分析用户</span>${link(s.analysis_users,'period:analysis','期间分析用户')}<small>覆盖率 ${rate(s.analysis_rate)}</small></div><div><span>人均分析活跃日</span>${s.avg_analysis_days==null?'<strong>—</strong>':`<button class="si-numberlink" data-list="period:analysis" data-title="人均活跃日的分析用户分母">${s.avg_analysis_days.toFixed(1)} <span>↗</span></button>`}<small>分母：期间分析用户</small></div><div><span>期间策略用户</span>${link(s.strategy_users,'period:strategy','期间策略用户')}<small>使用率 ${rate(s.strategy_rate)}</small></div><div><span>期间交易记录用户</span>${link(s.trade_users,'period:trade','期间交易记录用户')}<small>占比 ${rate(s.trade_rate)}</small></div></div>
 ${m.credits?`<section class="a-card si-panel"><div class="si-sectionhead"><div><h2>Credits额度</h2><p>API额度当前事实 · 与积分分开统计 · 有可用额度计入价值线索</p></div></div><div class="si-period-metrics"><div><span>有可用Credits</span>${link(m.credits.available_users,'credits:available','有可用Credits的用户')}<small>available_quota 大于0</small></div><div><span>有已用Credits</span>${link(m.credits.used_users,'credits:used','有已用Credits的用户')}<small>累计已用额度，非期间消费</small></div><div><span>可用Credits为0</span>${link(m.credits.empty_users,'credits:empty','可用Credits为0的用户')}<small>已有明确额度记录</small></div><div><span>额度未知</span>${link(m.credits.unknown_users,'credits:unknown','Credits额度未知的用户')}<small>缺记录不计为0</small></div></div><p class="si-footnote">额度取数据库原始可用、已用、总额字段，不推算余额，不代表付费用户。${m.credits.quality?`全库来源 ${fmt(m.credits.quality.source_users)} 人，身份未确认 ${fmt(m.credits.quality.unmapped_users)} 人，多来源账号待确认 ${fmt(m.credits.quality.ambiguous_users)} 人；后两类未纳入额度统计。`:''} AI credits流水暂无记录。</p></section>`:''}
 ${pointsPanel(m,{esc,fmt,table,link})}
 <div class="si-charts-grid">
 <section class="a-card si-panel"><div class="si-sectionhead"><div><h2>行为分群构成</h2><p>互斥分群 · 点击图形或名单下钻</p></div><span class="si-pill">${fmt(m.total)} 人</span></div>${m.total?`<div class="si-behavior-layout"><div id="si-behavior-chart" class="si-donut" role="img" aria-label="行为分群构成环形图"></div><div class="si-legend">${m.segments.map((r,i)=>`<button data-list="${esc(r.list_key)}" data-title="${esc(r.segment)}"><span class="si-dot" style="--si-color:${r.segment==='未观测分析'?'#c7cfdf':SEGMENT_COLORS[i%SEGMENT_COLORS.length]}"></span><span>${esc(r.segment)}</span><strong>${fmt(r.users)}</strong><small>${pct(r.users,m.total)}</small></button>`).join('')}</div></div>`:'<p class="si-empty">当前筛选没有用户，可放宽条件后重试。</p>'}<details class="si-details"><summary>分群明细与观察状态</summary>${table(['分群','人数','占比','观察状态'],m.segments.map(r=>[esc(r.segment),link(r.users,r.list_key,r.segment),pct(r.users,m.total),r.segment==='观察不足'?'缺完整历史':'按已观测行为']))}</details></section>
 <section class="a-card si-panel"><div class="si-sectionhead"><div><h2>资产与权益线索</h2><p>标签可重叠 · 占比以当前筛选为分母</p></div></div><div class="si-asset-list">${assets.map(([label,n,key,color])=>`<div><div class="si-asset-head"><span><i class="si-dot" style="--si-color:${color}"></i>${label}</span>${n==null?'<span class="si-unknown">数据未知</span>':link(n,key,label+'用户')}</div><div class="si-track"><span style="width:${m.total&&n!=null?Math.min(100,n/m.total*100):0}%;background:${color}"></span></div><small>${n==null?'缺记录不计为0':`${pct(n,m.total)} · 点击人数查看用户`}</small></div>`).join('')}<div class="si-asset-foot"><span>VIP权益</span><span class="si-unknown">未确认</span></div></div></section>
 </div>
 <section class="a-card si-panel"><div class="si-sectionhead"><div><h2>人群效果对比</h2><p>按${esc(groupName)}分组 · 点击柱形查看对应行为用户</p></div><span class="si-pill">${m.comparison.length} 组</span></div>${m.comparison.length?`<div id="si-comparison-chart" class="si-effect-chart" style="height:${Math.max(270,m.comparison.length*76)}px" role="img" aria-label="各人群分析策略交易占比柱状图"></div>`:'<p class="si-empty">当前筛选无可对比人群。</p>'}<details class="si-details"><summary>查看人数、比例与活跃日明细</summary>${comparison(m.comparison)}</details><p class="si-footnote">三种行为可重叠；比例分母为各组账号。绑定差异描述相关性，不能解释为绑定带来提升。</p></section>
 <section class="a-card si-panel"><div class="si-sectionhead"><div><h2>注册批次表现</h2><p>最近12个注册周批次 · 同一统计期内的分析覆盖</p></div><span class="si-pill">周一分批</span></div>${m.registration_cohorts.length?`<div id="si-cohort-chart" class="si-cohort-chart" style="height:${Math.max(230,Math.min(12,m.registration_cohorts.length)*32+70)}px" role="img" aria-label="注册周批次分析覆盖堆叠柱状图"></div>`:'<p class="si-empty">当前筛选没有注册批次。</p>'}<details class="si-details"><summary>查看全部 ${m.registration_cohorts.length} 个注册批次明细</summary>${comparison(m.registration_cohorts)}</details><p class="si-footnote">不同批次的账号年龄不同，这不是注册后转化率。${esc(m.retention_reason)}</p></section>
 <div class="si-charts-grid"><section class="a-card si-panel"><div class="si-sectionhead"><div><h2>推荐贡献</h2><p>当前筛选内的有效邀请关系</p></div></div><div class="si-referral"><div><span>期间新增被邀请用户</span>${link(s.new_referred_users,'referral:new','期间新增有效被邀请用户')}</div><span class="si-referral-arrow">→</span><div><span>绑定后观测到分析</span>${link(s.new_referred_analysis_users,'referral:analysis','新增被邀请且绑定后分析的用户')}</div></div><p class="si-footnote">只描述已观测结果；无邀请关系不等于自然增长。</p></section>
 <section class="a-card si-panel"><div class="si-sectionhead"><div><h2>用户池背景</h2><p>补充查看，不计入当前分析分母</p></div></div><div class="si-background"><span>全部注册账号</span><strong>${fmt(m.registered_total)}</strong><span>有业务信号 ${fmt(m.business_total||0)} · 仅可联系 ${fmt(m.contact_only_total||0)} · 无已知信号 ${fmt(m.no_signal_total||0)}</span></div><p class="si-footnote">未匹配账号的事件用户 ${link(m.unmatched_users,'unmatched','未匹配账号的事件用户')}，单列且不纳入注册分母。</p></section></div>
</details>
 <details class="a-card si-methods"><summary>统计口径与数据完整性</summary><p>当前池与筛选后的账号是分析、策略和交易比例的分母；人均活跃日的分母为分析用户。主指标可能重叠，不能相加。</p><p>未观测分析不代表从未使用，未观测近期使用不代表流失。历史覆盖未确认时不确认流失、回流或成熟留存。</p><p>业务信号来自有效分析/策略、交易记录、NFT、近期正余额、可用积分、积分流水或签到任一项，邮箱/TG单独不纳入。交易记录不等于已统一确认的成交，不换算USD。</p><p>余额仅使用24小时内更新的唯一身份关联记录；未估值或过滤残值，无记录/过期为未知。NFT限已接入Ethereum/Base所有权记录；积分缺记录不当零，交易等级不当VIP。</p><p>用户事实截至 ${esc(time(Date.parse(m.facts_as_of)))}；事件截至 ${esc(time(m.as_of))}。源事实可更新，采用弱一致快照。</p></details></div>`

 bind();$('#as-output').querySelectorAll('[data-list]').forEach(el=>el.onclick=()=>open(el.dataset.title,m.drill.cache_id,el.dataset.list));mountSegmentUserList(ctx,m,open);const detail=$('[data-segment-details]');let mounted=false;detail.ontoggle=()=>{if(detail.open&&!mounted){mounted=true;mountCharts(m)}}
 }
 return {draw,configureTask(filters={}){applied={days:7,group:'signal',pool:'business',filters};draft=structuredClone(applied)},hasPendingChanges:()=>JSON.stringify(draft)!==JSON.stringify(applied),dispose(){active=false;inflight++;disposeCharts()}}
}

import {growthEvidenceMarkup,growthCohortsMarkup} from './growthCohorts.js'
import {conversionLossMarkup} from './conversionLoss.js'
import {createTrackingAuditPanel} from './trackingAudit.js'
import {fetchGrowthInsights,fetchValueDiagnostics,fetchConversionLoss} from '../api/metrics.js'
import {fetchBackendMeta} from '../api/backendAnalytics.js'
import {inheritedReportPeriod,reportPeriod,periodFields,bindPeriod} from '../analytics/reportPeriod.js'
import {openObservedDrill,observedTime} from './observedDrill.js'
import {requestDiagnosticsMarkup,valueDiagnosticsMarkup} from './diagnostics.js'
import {growthReportRequest} from '../api/growthReports.js'
import {createOperationTask} from '../api/operationTasks.js'
import {opsRequest} from '../api/ops.js'
import {viewState} from '../components/viewStates.js'

const DAY=86400000
const rate=v=>v==null?'—':(v*100).toFixed(1)+'%'
const duration=v=>v==null?'—':(v/60000).toFixed(1)+' 分钟'
const count=(ctx,v)=>v==null?'—':ctx.fmt(v)
const span=v=>v?`${rate(v[0])}–${rate(v[1])}`:'—'
const tabs=[['change','变化拆解'],['cohorts','注册与复访'],['loss','转化损失'],['quality','数据可信度'],['audit','埋点验收'],['channels','渠道长期质量'],['value','价值转化'],['association','行为与回访'],['ops','运营动作复盘'],['reports','报告与结论']]
export function growthAlerts(m,{decline=20,minUsers=30}={}){
 const out=[]
 if(!m.quality.history_complete)out.push('连续采集与历史覆盖未确认，以下变化仅为已观测线索。')
 if(m.change.previous>=minUsers&&m.change.rate!=null&&m.change.rate<=-decline/100)out.push(`有效分析用户下降 ${rate(-m.change.rate)}，请查看来源贡献与未回访名单。`)
 if(m.quality.lag_ms>3600000)out.push('最新事件距快照截止超过1小时，请先核对采集水位。')
 const missing=m.quality.families.filter(f=>!f.available).map(f=>f.label)
 if(missing.length)out.push(missing.join('、')+'事件待接入，不计算零成功率。')
 const small=m.quality.families.filter(f=>f.available&&(f.users!=null?f.users<30:f.started_events>0&&f.started_events<30))
 for(const f of small)out.push(`${f.label}仅观测 ${f.users==null?'未知数量':f.users} 位诊断用户、${f.started_events} 条发起事件，样本与采集覆盖不足，不外推全量表现。`)
 return out
}
export function growthChangeMarkup(ctx,m){
 const {esc,fmt,table}=ctx,c=m.change
 const link=(n,k,title)=>`<button class="si-numberlink" data-gi-key="${esc(k)}" data-gi-title="${esc(title)}">${fmt(n)} ↗</button>`
 return `<section class="a-card si-panel"><h2>北极星人数变化</h2><button class="a-button" data-gi-tab="loss">查看转化损失拆解 →</button><div class="si-kpis">${[['本期分析用户',c.current,'current'],['上期分析用户',c.previous,'previous'],['首次观测分析',c.fresh,'fresh'],['重新观测活跃',c.resumed,'resumed'],['两期持续分析',c.continuing,'continuing'],['本期未观测回访',c.absent,'absent']].map(([label,n,key])=>`<div class="si-kpi"><span>${label}</span><strong>${link(n,'growth:'+key,label)}</strong></div>`).join('')}</div><p class="gi-equation">${fmt(c.current)} − ${fmt(c.previous)} = ${fmt(c.fresh)} + ${fmt(c.resumed)} − ${fmt(c.absent)} = <strong>${c.delta>0?'+':''}${fmt(c.delta)} 人</strong> · 变化率 ${rate(c.rate)}</p><p>首次观测分析：历史首次分析在本期；重新观测活跃：本期分析、上期未分析，但更早有记录；持续分析：两期均分析。未回访仅代表本期未观测，不能确认流失。</p><p>本期 ${esc(observedTime(m.start))} 至 ${esc(observedTime(m.end))}；上期 ${esc(observedTime(m.previous_start))} 至 ${esc(observedTime(m.previous_end))}。截止不含，时长相同，含进行中的业务日。</p></section>${Object.entries(m.dimensions).map(([dimension,rows])=>`<section class="a-card si-panel"><h2>${({source:'来源',device:'首次分析设备',app_version:'首次分析应用版本'})[dimension]}变化贡献</h2>${table(['分类','上期用户','本期用户','人数变化'],rows.map(r=>[esc(r.value),link(r.previous,r.list_key+':previous',r.value+' · 上期'),link(r.current,r.list_key+':current',r.value+' · 本期'),(r.delta>0?'+':'')+fmt(r.delta)]))}<p class="a-muted">每个维度内分别归组；不同维度的贡献不能相加，也不能解释为因果。</p></section>`).join('')}<section class="a-card si-panel"><h2>继续处理未回访用户</h2><p>账号身份用户 ${link(c.actionable,'growth:absent:registered','本期未回访 · 账号身份用户')} 人；匿名身份保留在指标中，不进入运营任务；创建任务时再核对注册账号。</p><form data-gi-task><label>任务标题<input name="title" value="核对本期未观测回访用户" maxlength="80" required></label><label>下一步<textarea name="next_step" maxlength="1000" placeholder="记录排查与跟进计划"></textarea></label><button class="a-button" ${!c.actionable?'disabled':''}>固定名单并创建运营任务</button></form><p role="status" data-gi-task-status></p></section>`
}
export function growthQualityMarkup(ctx,m){
 const {esc,fmt,table}=ctx,q=m.quality
 return `<section class="a-card si-panel"><h2>数据可信度与采集水位</h2><button class="a-button" data-gi-tab="audit">按event_id核验采集证据 →</button><div class="si-kpis">${[['本期有效事件',fmt(q.events)],['已关联账号事件比例',rate(q.linked_rate)],['已记录来源事件比例',rate(q.source_rate)],['距最新事件',duration(q.lag_ms)]].map(([label,v])=>`<div class="si-kpi"><span>${label}</span><strong>${v}</strong></div>`).join('')}</div><p>最新事件：${esc(q.latest_event_at||'未知')}；最新到达：${esc(q.source_seen_at||'未知')}；快照截止：${esc(q.snapshot_cutoff||'未知')}。</p><p>完整历史：${q.history_complete?'已声明完整':'未确认'}；连续采集确认截至：${esc(q.events_complete_through||'未知')}；查询截断：${q.truncated?'是':'否（超预算直接报错）'}。</p><p>账号比例仅表示事件已关联账号身份，不代表注册表匹配率。来源比例以本期有效事件为分母、使用用户历史最早来源。最新事件不等于连续采集水位；过滤前的非法/缺身份事件不在本面板分母。</p>${table(['诊断能力','去重诊断用户','发起事件','结果事件','缺关联ID事件','状态'],q.families.map(f=>[esc(f.label),f.users==null?'未知':fmt(f.users),fmt(f.started_events),fmt(f.finished_events),fmt(f.missing_id_events),f.available?'已观测（关联质量见价值转化）':'待接入']))}<p>这里按事件条数检查接入；结果事件数 / 发起事件数不能当作终态覆盖率，跨期与重复上报需按尝试ID关联。</p>${q.diagnostic_coverage?.available?`<h3>设备与版本覆盖</h3>${table(['能力','设备','应用版本','诊断版本','去重用户','事件数'],q.diagnostic_coverage.rows.filter(r=>r.scope==='device_version').map(r=>[esc(r.family),esc(r.device),esc(r.app_version),esc(r.diagnostics_version),fmt(r.users),fmt(r.events)]))}<p>${esc(q.diagnostic_coverage.definition)}</p>`:'<p>设备与版本覆盖未包含在该结果中。</p>'}</section><section class="a-card si-panel"><h2>诊断版本观测</h2>${q.versions.length?table(['事件','采集版本','事件数','本期首次观测','本期最近观测'],q.versions.map(r=>[esc(r.event_name),esc(r.version),fmt(r.events),esc(observedTime(r.first_at)),esc(observedTime(r.latest_at))])):'<p>当前范围未观测到诊断版本，无法确认部署生效时间。</p>'}<p class="a-muted">首次观测时间不能证明部署时间或连续采集完整。</p></section>`
}
export function growthChannelsMarkup(ctx,m){
 const {esc,fmt,table}=ctx,link=(n,k)=>`<button class="si-numberlink" data-gi-key="${esc(k)}" data-gi-title="渠道成熟批次用户">${fmt(n)} ↗</button>`
 const ret=r=>`${link(r.returned,r.list_key+':returned')} / ${link(r.eligible,r.list_key+':eligible')} · ${rate(r.rate)}<small class="si-cell-caption">95%区间 ${span(r.interval)} · 未成熟 ${fmt(r.pending)} 人</small>`
 return `<section class="a-card si-panel"><h2>渠道首次观测批次的长期质量</h2><p>按本期首次观测用户入组，同一来源、同一入组范围。24小时分析成熟后计入激活分母；D7/D30仅计入对应UTC+7自然日已结束者。</p>${table(['来源','入组用户','24小时分析 / 成熟用户','分析比例 / 95%区间','首次分析耗时中位','D7分析回访','D30分析回访','首7天交易用户 / 成熟匹配账号','首7天已知成交额USD'],m.channels.map(r=>[esc(r.source),link(r.users,r.list_key+':users'),`${link(r.activated,r.list_key+':activated')} / ${link(r.eligible,r.list_key+':eligible')}<small class="si-cell-caption">未成熟 ${fmt(r.pending)} 人</small>`,`${rate(r.activation_rate)}<small class="si-cell-caption">${span(r.activation_interval)}${r.eligible<30?' · 小样本':''}</small>`,duration(r.median_ms),ret(r.d7),ret(r.d30),r.trade?.available?`${link(r.trade.traders,r.trade.list_key+':traders')} / ${link(r.trade.eligible,r.trade.list_key+':eligible')}<small class="si-cell-caption">身份未匹配 ${fmt(r.trade.unmatched)} · 未成熟 ${fmt(r.trade.pending)}</small>`:'待获取',r.trade?.available?`${count(ctx,r.trade.volume_usd)}<small class="si-cell-caption">缺金额 ${fmt(r.trade.missing_values)} · 冲突排除 ${fmt(r.trade.excluded_trades)}</small>`:esc(r.trade?.error||'未知')]))}<p>激活沿用筹码查看/下钻观测口径，首次观测不等于新增获客。D7/D30从首次观测日计算，未成熟不补零；每项成熟分母可能不同，应核对样本量与入组日期。区间为Wilson 95%描述区间，不是渠道差异的显著性检验。</p><p>首7天交易使用首次观测后的168小时成熟窗口，按统一已验证身份与链/交易哈希去重；匿名及未匹配账号不进入交易分母。已知成交额取买卖绝对值，不等于收入；交易来源失败保留未知。</p></section>`
}
export function growthAssociationsMarkup(ctx,m){
 const {esc,fmt,table}=ctx
 return `<section class="a-card si-panel"><h2>哪些早期行为与D7分析回访相关</h2><p>以本期首次观测分析用户入组，行为只读取首次分析起24小时；D7使用第7个完整UTC+7自然日。每个假设分别比较两组。</p>${m.associations.map(a=>`<h3>${esc(a.label)}</h3>${table(['人群','入组人数','D7成熟人数','D7回访人数','回访率 / 95%区间','未成熟'],a.groups.map(g=>[esc(g.label),`<button class="si-numberlink" data-gi-key="${esc(g.list_key+':users')}" data-gi-title="${esc(a.label+' · '+g.label)}">${fmt(g.users)} ↗</button>`,fmt(g.d7.eligible),fmt(g.d7.returned),`${rate(g.d7.rate)} / ${span(g.d7.interval)}${g.d7.eligible<30?' · 小样本':''}`,fmt(g.d7.pending)]))}`).join('')}<p>不同小时观测到分析不等于准确操作次数。两组可能在来源、经验及使用意愿上不同，结果用于提出假设，不证明某行为提高留存。</p></section>`
}

export function createGrowthInsightsPage(ctx){
 const {$,esc,table}=ctx
 let state=inheritedReportPeriod({days:7}),generation=0,tab='change',result=null,meta=null,source='all',frozen=false,valueResult=null,lossResult=null,notice=''
 let rules={decline:20,minUsers:30}
 try{const saved=JSON.parse(localStorage.getItem('logearn.growth.rules.v1')||'null');if(saved&&Number.isFinite(saved.decline)&&saved.decline>=1&&saved.decline<=100&&Number.isSafeInteger(saved.minUsers)&&saved.minUsers>=1&&saved.minUsers<=50000)rules=saved}catch{}
 const auditPanel=createTrackingAuditPanel(ctx)
 const host=()=>$('#as-output')
 function drill(key,title){
  if(!frozen)return openObservedDrill(ctx,result,title,key)
  const rows=(result.lists?.[key]||[]).map(id=>result.members[id]).filter(Boolean)
  ctx.drawer.openRemote({title,description:'保存报告时的固定名单与来源；当前账号画像可能已更新。',columns:['用户','首次来源'],profileContext:{start:result.start,end:result.end},renderRow:r=>[esc(r.id),esc(r.source)],fetchPage:async({offset=0,limit=12,q=''})=>{const matched=rows.filter(r=>(r.id+' '+r.source).toLowerCase().includes(q.toLowerCase()));return {rows:matched.slice(offset,offset+limit),total:matched.length}}})
 }
 function render(){
  auditPanel.dispose()
  const m=result
  host().innerHTML=`<div class="si-page gi-page"><section class="a-card si-panel"><div class="si-sectionhead"><div><h2>增长诊断</h2><p>${frozen?'已保存报告 · 固定结果':'全平台 · 独立统计期，不继承已圈选名单'} · 截至 ${esc(observedTime(m.as_of))} · UTC+7</p></div><button class="a-button" data-gi-refresh>用最新数据重新分析</button></div><div class="gi-filters">${periodFields(esc,state,'gi')}<label>首次已记录来源<select data-gi-source><option value="all">全部来源</option>${[...new Set([...(meta?.sources||[]),'未知',...(source!=='all'?[source]:[])])].map(v=>`<option value="${esc(v)}" ${v===source?'selected':''}>${esc(v)}</option>`).join('')}</select></label></div><p class="a-muted">支持1–31天；默认最近7天。较长统计期请使用其他专题分析。历史报告的结果与名单不会因刷新而改写。</p><div class="a-audience-actions" role="group" aria-label="诊断视图">${tabs.map(([id,label])=>`<button class="a-button" data-gi-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join('')}</div>${notice?`<p role="status" class="si-error">${esc(notice)}</p>`:''}</section><section class="a-card si-panel"><h2>需要核对的线索</h2><ul>${growthAlerts(m,rules).map(t=>`<li>${esc(t)}</li>`).join('')||'<li>当前规则未发现需要提示的变化。</li>'}</ul><details><summary>关注规则（本浏览器保存，每次运行时检查）</summary><form data-gi-rules class="gi-filters"><label>下降至少 %<input name="decline" type="number" min="1" max="100" value="${rules.decline}" required></label><label>上期最少人数<input name="minUsers" type="number" min="1" max="50000" value="${rules.minUsers}" required></label><button class="a-button">保存规则</button></form><p>规则不会自动运行或发送通知；采集覆盖未确认时，始终保留质量提示。</p></details></section>${growthEvidenceMarkup(ctx,m)}<div data-gi-content>${tab==='change'?growthChangeMarkup(ctx,m):tab==='cohorts'?growthCohortsMarkup(ctx,m):tab==='quality'?growthQualityMarkup(ctx,m):tab==='channels'?growthChannelsMarkup(ctx,m):tab==='association'?growthAssociationsMarkup(ctx,m):'<section class="a-card si-panel"><p role="status">正在加载…</p></section>'}</div></div>`
  host().querySelectorAll('[data-gi-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.giTab;notice='';render()})
  host().querySelector('[data-gi-refresh]').onclick=()=>draw({keepWindow:frozen})
  host().querySelector('[data-gi-source]').onchange=e=>{source=e.target.value;draw()}
  bindPeriod(host(),state,()=>draw(),'gi')
  host().querySelectorAll('[data-gi-key]').forEach(b=>b.onclick=()=>drill(b.dataset.giKey,b.dataset.giTitle))
  host().querySelector('[data-gi-rules]').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),next={decline:Number(f.get('decline')),minUsers:Number(f.get('minUsers'))};if(next.decline<1||next.decline>100||!Number.isSafeInteger(next.minUsers)||next.minUsers<1||next.minUsers>50000)return;try{localStorage.setItem('logearn.growth.rules.v1',JSON.stringify(next));rules=next;notice='关注规则已保存';render()}catch{notice='浏览器存储不可用，规则未保存';render()}}
  const task=host().querySelector('[data-gi-task]');if(task){task.querySelector('button').disabled=frozen||!m.change.actionable;task.onsubmit=async e=>{e.preventDefault();const stamp=generation,button=task.querySelector('button');button.disabled=true;try{const values=Object.fromEntries(new FormData(task)),r=await createOperationTask({...values,cache_id:m.drill.cache_id,scope_label:'增长诊断 · 本期未观测回访的账号身份用户'});if(stamp!==generation||!task.isConnected)return;host().querySelector('[data-gi-task-status]').textContent=r.existing?'该结果已创建任务':'任务已创建，可在运营工作台跟进';ctx.openOperationTask?.(r.task.id)}catch(error){if(stamp===generation&&task.isConnected){host().querySelector('[data-gi-task-status]').textContent=error.message;button.disabled=false}}}}
  if(tab==='loss')loadLoss()
  if(tab==='audit'){const node=host().querySelector('[data-gi-content]');if(frozen)node.innerHTML='<section class="a-card si-panel"><p>埋点验收需独立核验当前证据，请用最新数据重新分析。</p></section>';else auditPanel.draw(node,{start:m.start,end:m.end,snapshot_id:m.drill.snapshot_id})}
  if(tab==='value')loadValue()
  if(tab==='ops')loadOps()
  if(tab==='reports')loadReports()
 }
 function tabError(node,title,error,retry){
  node.innerHTML=viewState({kind:'error',title,description:error.message||String(error),actionLabel:'重新读取',actionAttr:'data-view-retry'})
  node.querySelector?.('[data-view-retry]')?.addEventListener?.('click',retry)
 }
 async function loadLoss(){
  const stamp=generation,node=host().querySelector('[data-gi-content]'),m=result
  if(frozen){node.innerHTML='<section class="a-card si-panel"><p>转化损失为独立查询；历史报告不包含此结果，请用最新数据重新分析。</p></section>';return}
  try{
   const loaded=lossResult||await fetchConversionLoss({start:m.start,end:m.end,source,snapshot_id:m.drill.snapshot_id})
   if(stamp!==generation||tab!=='loss'||!node.isConnected)return
   lossResult=loaded;node.innerHTML=conversionLossMarkup(ctx,loaded)
   node.querySelectorAll('[data-loss-key]').forEach(b=>b.onclick=()=>{const period=loaded.list_periods?.[b.dataset.lossKey];openObservedDrill(ctx,period?{...loaded,...period}:loaded,b.dataset.lossTitle,b.dataset.lossKey)})
  }catch(e){if(stamp===generation&&tab==='loss'&&node.isConnected)tabError(node,'转化损失加载失败',e,loadLoss)}
 }
 async function loadValue(){
  const stamp=generation,node=host().querySelector('[data-gi-content]'),m=result
  if(frozen){node.innerHTML='<section class="a-card si-panel"><p>保存报告包含人数变化、渠道和行为关联。请求级诊断请用最新数据重新分析。</p></section>';return}
  if(m.end-m.start>7*DAY){node.innerHTML='<section class="a-card si-panel"><p>请求级诊断支持全平台最长7天。请选择最近7天或更短范围，再查看价值转化。</p></section>';return}
  try{
   const loaded=valueResult||await fetchValueDiagnostics({start:m.start,end:m.end,source,snapshot_id:m.drill.snapshot_id})
   if(stamp!==generation||tab!=='value'||!node.isConnected)return
   valueResult=loaded
   node.innerHTML=`<section class="a-card si-panel"><h2>从入口到首次成功分析</h2><p>页面用户点击 → 同次Token详情 → 请求成功 → 首次成功后的回访。各段分别使用页面用户、Token访问和请求ID，不能当作同一分母直接连乘。</p><p>诊断事件连续覆盖未确认，历史未观测成功不能判为分析失败。本次分析请求来自 ${count(ctx,valueResult.request_diagnostics?.families?.analysis?.users)} 位用户，成功率仅描述已采集样本。</p></section>${valueDiagnosticsMarkup(ctx,valueResult.value_diagnostics)}${requestDiagnosticsMarkup(ctx,valueResult.request_diagnostics)}`
   node.querySelectorAll('[data-op-key]').forEach(b=>b.onclick=()=>openObservedDrill(ctx,valueResult,b.dataset.opTitle,b.dataset.opKey))
  }catch(error){if(stamp===generation&&tab==='value'&&node.isConnected)tabError(node,'价值转化加载失败',error,loadValue)}
 }
 async function loadOps(){
  const stamp=generation,node=host().querySelector('[data-gi-content]')
  try{const r=await opsRequest('/batches');if(stamp!==generation||tab!=='ops'||!node.isConnected)return
   const batches=r.batches.filter(b=>['grant_quota','vip'].includes(b.operation))
   node.innerHTML=`<section class="a-card si-panel"><h2>发放权益后的使用与交易</h2><p>仅比较成功且目标账号已核对的SKILL/VIP；每批固定用户，按整批结束前后相同时长比较，最多7天。VIP未核对预期账号、失败或待核实行不纳入。</p>${batches.length?`<label>选择执行记录<select data-gi-batch><option value="">请选择</option>${batches.map(b=>`<option value="${esc(b.id)}">${esc(b.operation)} · ${esc(observedTime(b.created_at))} · ${esc(b.state)}</option>`).join('')}</select></label>`:'<p>暂无SKILL/VIP执行记录。</p>'}<div data-gi-effect></div><p>此处为只读复盘，不发送发放请求。结果为相关表现；因果增量需要独立对照设计。</p></section>`
   const select=node.querySelector('[data-gi-batch]');let effectRequest=0;if(select)select.onchange=async()=>{const seq=++effectRequest,target=node.querySelector('[data-gi-effect]');if(!select.value){target.innerHTML='';return}target.textContent='正在读取固定名单的前后表现…';try{const d=await opsRequest('/batches/'+encodeURIComponent(select.value)+'/effect');if(seq!==effectRequest||stamp!==generation||!target.isConnected)return
    target.innerHTML=d.pending?`<p>${esc(d.reason)}</p>`:`<p>${count(ctx,d.users)} 位用户 · ${d.mature?'7天观察已结束':'观察未满7天，按已观测时长等长比较'} · 截至 ${esc(d.as_of)}</p>${table(['统计期','起止（UTC+7）','匹配用户','分析用户','分析观测次数','交易用户','已知成交额USD'],['before','after'].map((key,i)=>{const p=d[key],t=p.total;return [i?'发放后':'发放前',esc(observedTime(p.start))+' — '+esc(observedTime(p.end)),count(ctx,t?.users),count(ctx,t?.analysis_users),count(ctx,t?.analysis_events),count(ctx,t?.trade_users),count(ctx,t?.volume_usd)]}))}<p>${esc(d.definition)}</p>${[d.before,d.after].flatMap(p=>Object.values(p.errors||{})).filter(Boolean).map(e=>`<p class="si-error">${esc(e)}</p>`).join('')}`
   }catch(e){if(seq===effectRequest&&stamp===generation&&target.isConnected)target.innerHTML=`<p class="si-error">${esc(e.message)}</p>`}}
  }catch(e){if(stamp===generation&&tab==='ops'&&node.isConnected)tabError(node,'运营动作复盘加载失败',e,loadOps)}
 }
 async function loadReports(){
  const stamp=generation,node=host().querySelector('[data-gi-content]')
  try{const r=await growthReportRequest();if(stamp!==generation||tab!=='reports'||!node.isConnected)return
   node.innerHTML=`<section class="a-card si-panel"><h2>保存本次分析与结论</h2><p>保存当前统计期、来源、数据时间、口径版本、指标与固定名单。转化损失、埋点验收、请求级价值转化及OPS复盘独立查询，不包含在本报告中。</p><form data-gi-report><label>标题<input name="title" maxlength="80" required value="增长诊断 ${esc(observedTime(result.as_of).slice(0,10))}"></label><label>结论<textarea name="note" maxlength="4000" placeholder="记录发现、证据、假设与下一步"></textarea></label><button class="a-button" ${frozen?'disabled':''}>保存报告</button></form><p role="status" data-gi-report-status></p><h3>最近30份报告</h3>${table(['标题','保存时间','查看'],r.reports.map(r=>[esc(r.title),esc(observedTime(r.created_at)),`<button class="a-button" data-gi-report-open="${esc(r.id)}">查看固定结果</button>`]))}</section>`
   const form=node.querySelector('[data-gi-report]');form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button');button.disabled=true;try{await growthReportRequest('',{...Object.fromEntries(new FormData(form)),cache_id:result.drill.cache_id});if(stamp!==generation||!node.isConnected)return;notice='分析报告已保存';render()}catch(e){if(stamp===generation&&node.isConnected){node.querySelector('[data-gi-report-status]').textContent=e.message;button.disabled=false}}}
   node.querySelectorAll('[data-gi-report-open]').forEach(b=>b.onclick=async()=>{try{const r=await growthReportRequest('/'+encodeURIComponent(b.dataset.giReportOpen));if(stamp!==generation||!node.isConnected)return;result={...r.result.payload,lists:r.result.lists,members:r.result.members};frozen=true;tab='change';source=result.source;state={days:'custom',start:new Date(result.start+25200000).toISOString().slice(0,16),end:new Date(result.end+25200000).toISOString().slice(0,16)};notice=r.title+' · '+(r.note||'未填写结论');render()}catch(e){if(stamp===generation&&node.isConnected)node.querySelector('[data-gi-report-status]').textContent=e.message}})
  }catch(e){if(stamp===generation&&tab==='reports'&&node.isConnected)tabError(node,'已保存报告加载失败',e,loadReports)}
 }
 async function draw(options={}){
  const fixedPeriod=options.keepWindow&&result?{start:result.start,end:result.requested_end??result.end}:null
  ctx.clear();const stamp=++generation;result=null;valueResult=null;lossResult=null;frozen=false;notice=''
  host().innerHTML='<section class="a-card si-panel"><p role="status">正在计算增长诊断…</p></section>'
  if(ctx.dataStore.meta.storage!=='hologres'){host().innerHTML='<section class="a-card si-panel"><p>增长诊断需要Hologres真实数据源，当前模式暂不可用。</p></section>';return}
  try{meta=await fetchBackendMeta();if(stamp!==generation)return;const p=fixedPeriod||reportPeriod({...state,asOf:Date.parse(meta.as_of)});if(p.end-p.start>31*DAY)throw Error('增长诊断最长31天，请选择更短统计期')
   const m=await fetchGrowthInsights({...p,source,snapshot_id:meta.snapshot_id});if(stamp!==generation)return;result=m;render()
  }catch(e){if(stamp!==generation)return;host().innerHTML=`<section class="a-card si-panel"><h2>增长诊断暂不可用</h2><p class="si-error">${esc(e.message)}</p><div class="gi-filters">${periodFields(esc,state,'gi')}</div><button class="a-button" data-gi-retry>重试</button></section>`;bindPeriod(host(),state,()=>draw(),'gi');host().querySelector('[data-gi-retry]').onclick=()=>draw()}
 }
 return {draw,dispose(){generation++;auditPanel.dispose()}}
}

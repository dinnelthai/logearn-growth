import {fetchTrackingAudit} from '../api/metrics.js'
import {parseTrackingSamples} from '../analytics/trackingSamples.js'
import {observedTime} from './observedDrill.js'
const states={read_conflict:'读取证据不一致，需重查',not_found:'快照前未查到',duplicate_conflict:'同ID白名单字段冲突',excluded:'已到达但未纳入指标',schema_issue:'已纳入，契约字段待核对',sample_mismatch:'浏览器样本不一致',consistent:'库侧契约与样本未见冲突',legacy:'历史事件，无新诊断契约'}
export function trackingAuditMarkup(ctx,m){
 const {esc,fmt,table}=ctx,s=m.summary
 const countTable=table(['到达记录','首次纳入代表事件','同ID其他到达','未纳入记录','记录对账'],[[fmt(s.received),fmt(s.included),fmt(s.same_id_others),fmt(s.excluded),s.reconciled?'一致':'读取不一致，请重查']])
 const exclusionLabels={invalid_base:'缺事件ID或没有有效时间的代表记录',representative_missing_identity:'去重代表记录缺少身份',dirty_linked_identity:'代表记录或唯一身份关联命中脏账号',dirty_anonymous_history:'匿名身份关联到历史脏账号，按现有规则抑制',other:'其他排除，需核对'}
 const exclusions=(s.excluded_reasons||[]).length?`<h3>未纳入原因</h3>${table(['现有规则','到达记录数'],s.excluded_reasons.map(r=>[esc(exclusionLabels[r.reason]||r.reason),fmt(r.records)]))}`:''
 const flags=table(['窗口内重复ID记录','缺event_id','无效客户端时间','无身份','脏账号标记'],[[s.duplicate_rows,s.missing_event_ids,s.invalid_client_times,s.missing_identities,s.dirty_user_ids].map(fmt)])
 const rows=m.rows.length?table(['event_id / 事件','数据库与事实层','浏览器与采集证据','待核对字段 / 原因'],m.rows.map(r=>[
  `${esc(r.event_id)}<small class="si-cell-caption">${esc(r.event_name||'未知')} · ${esc(r.diagnostics_version||'未观测版本')}</small>`,
  `${esc(r.state==='consistent'?(r.sample_supplied?'库侧与所提供字段一致':'库侧契约字段未见问题'):(states[r.state]||r.state))}<small class="si-cell-caption">原始 ${fmt(r.raw_records)} 条 · 事实层${r.included?'已纳入':'未纳入'}</small>`,
  `${r.browser_evidence==='manually_reported'?'浏览器发出：人工声明':'浏览器发出：待提供'}<small class="si-cell-caption">${r.sample_supplied?'已提供脱敏样本':'未提供事件字段样本'} · HTTP ${esc(r.collector_status??'未知')} · 业务成功${r.collector_business_success?'已人工核对':'待核对'}</small><small>${r.evidence_state==='sample_consistent'?'样本证据一致（含人工声明）':'证据链待补齐'}</small>`,
  esc([...r.issues,...r.differences.map(k=>'样本差异：'+k),...(r.exclusions||[])].join('；')||'—')
 ])):'<p>尚未提供event_id。粘贴真实浏览器请求的事件样本后，可精确核对落库、去重、字段及事实层纳入。</p>'
 return `<section class="a-card si-panel"><h2>采集到达与统计纳入</h2><p>按服务端到达时间 ${esc(observedTime(m.start))} — ${esc(observedTime(m.end))}，全平台，不受来源筛选影响。快照截止 ${esc(m.snapshot_cutoff)}。</p>${countTable}<p>到达记录 = 首次纳入代表事件 + 同ID其他到达 + 未纳入记录。同ID其他到达包含原始代表记录在更早窗口的重试，也可能有字段冲突；不是新增业务行为。</p>${exclusions}<details><summary>重叠诊断标记</summary>${flags}<p>这些标记可重叠，不能相加为排除总数；窗内重复ID不包含原始记录在更早窗口的全部重试。</p></details><p>事实层纳入使用现有去重、时间及身份规则，不保证计入某项业务指标；这不是漏报率，也不把HTTP成功当作落库成功。</p></section><section class="a-card si-panel"><h2>按event_id核验结果</h2><p>请求 ${fmt(m.counts.requested)} 个，快照前找到 ${fmt(m.counts.found)} 个，统一事实层纳入 ${fmt(m.counts.included)} 个，样本证据一致（含人工声明） ${fmt(m.counts.sample_consistent)} 个。</p>${rows}<p>event_id核验覆盖快照前全历史，不限上方到达窗口；快照后到达的事件需用最新快照重查。浏览器发出与采集响应来自人工声明，字段一致不能独立证明连续完整采集；只有数据库记录时，仅完成库侧核验。</p></section>`
}
export function createTrackingAuditPanel(ctx){
 const {esc}=ctx
 let epoch=0,inputText='',browser=false,http='',business=false,result=null
 function dispose(){epoch++}
 async function draw(host,period){
  const stamp=++epoch
  const activePeriod={...period}
  host.innerHTML=`<section class="a-card si-panel"><h2>线上埋点验收</h2><p>先核对采集到达与数据库纳入，再按真实浏览器请求的event_id关联。HTTP成功、数据库存在和完整采集是不同证据。</p><form data-tracking-form class="tracking-audit-form"><label>真实事件ID或脱敏事件JSON<textarea data-tracking-samples rows="6" maxlength="262144" placeholder="每行一个event_id，或粘贴解压后的事件数组">${esc(inputText)}</textarea></label><p>只提交event_id、event_name、client_ts及诊断字段白名单；账号、匿名身份、请求头、Token和其他properties会被移除。不要粘贴完整HAR。</p><label class="tracking-check"><input type="checkbox" data-tracking-browser ${browser?'checked':''}> 我已在浏览器发出的请求中核对这些event_id（人工声明）</label><div class="gi-filters"><label>采集HTTP响应（人工填写）<input data-tracking-http type="number" min="100" max="599" value="${esc(http)}" placeholder="未知留空"></label><label class="tracking-check"><input type="checkbox" data-tracking-business ${business?'checked':''}> 我已核对采集响应业务成功（人工声明）</label></div><button class="a-button" type="submit">核验当前快照</button><button class="a-button" type="button" data-tracking-latest>用最新快照重查</button><button class="a-button" type="button" data-tracking-export disabled>导出验收结果</button><p role="status" data-tracking-status></p></form></section><div data-tracking-result><section class="a-card si-panel"><p role="status">正在核对采集到达记录…</p></section></div>`
  const form=host.querySelector('[data-tracking-form]'),target=host.querySelector('[data-tracking-result]'),status=host.querySelector('[data-tracking-status]')
  let request=0
  const remember=()=>{inputText=form.querySelector('[data-tracking-samples]').value;browser=form.querySelector('[data-tracking-browser]').checked;http=form.querySelector('[data-tracking-http]').value;business=form.querySelector('[data-tracking-business]').checked}
  form.oninput=()=>{remember();request++;result=null;status.textContent='样本或声明已变更，请重新核验。';form.querySelectorAll('button').forEach(b=>b.disabled=false);form.querySelector('[data-tracking-export]').disabled=true}
  async function run(latest=false){
   remember();const seq=++request
   let normalized
   try{normalized=parseTrackingSamples(inputText)}catch(e){status.textContent=e.message;result=null;form.querySelector('[data-tracking-export]').disabled=true;return}
   form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='正在按快照核验；未观测不补造记录…'
   try{
    const args={...activePeriod,...normalized,browser_confirmed:browser,collector_status:http===''?null:Number(http),collector_business_success:business}
    if(latest){const {fetchBackendMeta}=await import('../api/backendAnalytics.js');const meta=await fetchBackendMeta({refresh:true});args.snapshot_id=meta.snapshot_id}
    if(stamp!==epoch||seq!==request||!host.isConnected)return
    activePeriod.snapshot_id=args.snapshot_id
    const loaded=await fetchTrackingAudit(args)
    if(stamp!==epoch||seq!==request||!host.isConnected)return
    result=loaded;target.innerHTML=trackingAuditMarkup(ctx,result);status.textContent='核验完成；仅对已提供证据作结论，完整采集仍未确认。'
   }catch(e){if(stamp===epoch&&seq===request&&host.isConnected){target.innerHTML='';status.textContent='核验失败：'+e.message;result=null}}
   finally{if(stamp===epoch&&seq===request&&host.isConnected){form.querySelectorAll('button').forEach(b=>b.disabled=false);form.querySelector('[data-tracking-export]').disabled=!result}}
  }
  form.onsubmit=e=>{e.preventDefault();return run()}
  form.querySelector('[data-tracking-latest]').onclick=()=>run(true)
  form.querySelector('[data-tracking-export]').onclick=()=>{
   if(!result)return
   const blob=new Blob([JSON.stringify({...result,exported_at:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tracking-audit-'+new Date(Date.now()+25200000).toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  await run()
 }
 return {draw,dispose}
}

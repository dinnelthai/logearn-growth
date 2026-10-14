import {RAW_EVENT_TYPES,EVENT_LABELS} from '../analytics/eventConfig.js'
import {fetchDrillUsers,fetchUserTimeline} from '../api/drill.js'
// Product chain dictionary: logearn-web/src/config/index.ts, chain_defs. Raw IDs remain query keys.
export const observedChain=c=>({'3':'Solana','56':'BSC','4663':'Robinhood','5042':'Arc'})[c]?({'3':'Solana','56':'BSC','4663':'Robinhood','5042':'Arc'})[c]+' ('+c+')':c
export const observedTime=t=>t==null?'—':new Date(Number(t)+25200000).toISOString().slice(0,19).replace('T',' ')
export function openObservedDrill(ctx,result,title,key,subset=null){
 const cache=result?.drill?.cache_id;if(!cache)return
 const {esc,drawer}=ctx,entity=result.list_entities?.[key]||'用户',records=entity!=='用户',deviceRows=key.startsWith('url:')
 drawer.openRemote({selection:records||subset?null:{cache_id:cache,list_key:key},title,entity,description:records?'当前分析快照的准确记录；点击用户查看事件时间线':'当前分析快照内的去重用户；同一用户可有多个会话',columns:records?['用户','链','状态','订单覆盖','提交时间','终态时间','尝试ID / 订单ID','错误内容 / 关联诊断']:deviceRows?['用户','设备 / 浏览器','系统 / 环境','入口页面','首次来源']:['用户','首次来源'],
 renderRow:input=>{const r=deviceRows?deviceProfile(result,key,input):input;return records?[`<button class="a-tablelink" data-user="${esc(r.user_id)}">${esc(r.user_id)}</button>`,esc(observedChain(r.chain)),esc(({succeeded:'成功',failed:'失败',pending:'待确认',mixed:'混合结果',conflict:'冲突',observed_only:'仅已观测终态',unmatched:'未关联',missing:'缺关联ID'})[r.status]||r.status),r.orders_key?`${r.observed_orders} / ${r.expected_wallets??'未知'} 订单<br><button class="a-tablelink" data-row-action="${esc(r.orders_key)}">查看订单 ↗</button>`:'—',esc(observedTime(r.submitted_at)),esc(observedTime(r.terminal_at)),`<span class="om-id">${esc(r.attempt_id||'—')}<br>${esc(r.trade_id||'—')}</span>`,`<div class="om-issue-content">${esc(r.error_reason||r.reason||'—')}${r.error_detail?`<p>${esc(r.error_detail)}</p>`:(r.status==='failed'||r.reported_status==='failed')?'<p>详细错误未上报</p>':''}${r.status==='unmatched'&&r.error_reason?`<small>关联诊断：${esc(r.reason)}</small>`:''}${r.diagnostic_reason?`<small>${esc(r.diagnostic_reason)}</small>`:''}</div>`]:[`<button class="a-tablelink" data-user="${esc(r.id)}">${esc(r.id)}</button>`,...(deviceRows?[esc((r.device||'未知')+' / '+(r.browser||'未知')+' '+(r.version||'')),esc((r.os||'未知')+' / '+(r.environment||'未知')),esc(r.entry_page||'—')]:[]),esc(r.source)]},
 onRowAction:key=>openObservedDrill(ctx,result,'提交批次的已观测订单',key),
 fetchPage:args=>{if(!subset)return fetchDrillUsers({kind:'cached_list',params:{cache_id:cache,list_key:key},...args});const q=(args.q||'').toLowerCase(),rows=subset.filter(r=>(r.id+' '+r.source).toLowerCase().includes(q));return Promise.resolve({rows:rows.slice(args.offset,args.offset+args.limit),total:rows.length})},
 fetchTimeline:async(uid,host)=>{host.innerHTML='<p class="a-muted">加载事件时间线…</p>';try{const d=await fetchUserTimeline({userId:uid,cacheId:cache,limit:200});if(!host.isConnected)return;host.innerHTML=`<h2>${esc(uid)} · 已观测时间线（按时间升序，最多200条）</h2><div class="a-timeline">${d.events.map(e=>`<div class="a-event"><strong>${esc(EVENT_LABELS[RAW_EVENT_TYPES[e.event_name]]||e.event_name)}</strong><div>${esc(observedTime(e.t))}</div>${['page_viewed','page_visit_ended'].includes(e.event_name)?`<div>${esc(String(e.properties?.page_url||e.properties?.url||e.properties?.path||'URL 未上报').split(/[?#]/)[0])}</div><small>有效停留：${e.properties?.visible_duration_ms!=null?esc((Number(e.properties.visible_duration_ms)/1000).toFixed(1))+' 秒':e.event_name==='page_viewed'?'见同次页面停留记录':'未上报'}</small>`:''}</div>`).join('')||'<p>当前快照未观测事件。</p>'}</div>`}catch(e){if(host.isConnected)host.innerHTML=`<p class="a-empty">${esc(e.message)}</p>`}}
 })
}
export function mountObservedChart(ctx,host,option,onClick){if(!globalThis.echarts||!host)return null;const chart=globalThis.echarts.init(host,null,{renderer:'svg'});chart.setOption(option);chart.on('click',onClick);return chart}

export function deviceProfile(result,key,r){
 const entry=result.page_visits?.entries.find(e=>key===e.list_key||key.startsWith(e.list_key+':'))
 if(!entry)return r
 let profiles=(r.entry_sessions||[]).filter(p=>p.entry_page===entry.url)
 for(const [dim,groups]of Object.entries(entry.device_breakdown||{}))for(const g of groups)if(key.startsWith(g.list_key+':')){
  profiles=profiles.filter(p=>p[dim]===g.label)
  const status=key.slice(g.list_key.length+1);if(['idle','context','pending'].includes(status))profiles=profiles.filter(p=>p.observation_status===status)
 }
 return {...r,...profiles.sort((a,b)=>a.entry_at-b.entry_at)[0]}
}

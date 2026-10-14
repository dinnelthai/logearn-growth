import {observedChain} from './observedDrill.js'
export const tradeIssueLabels={failed:'交易失败（已关联）',unmatched_failed:'失败结果未关联',conflict:'终态 / 关联冲突',correlation:'成功结果未关联'}
export function filterTradeIssues(rows,query='',type='all'){
 const q=query.trim().toLowerCase()
 return rows.filter(r=>(type==='all'||r.type===type)&&(!q||[r.reason,r.error_detail,r.diagnostic,tradeIssueLabels[r.type],...(r.chains||[]).map(observedChain)].some(x=>String(x||'').toLowerCase().includes(q))))
}
export function tradeIssueContent(r,esc){
 const status=/^order_status_(\d+)$/.exec(r.reason||''),summary=r.type==='conflict'?r.diagnostic:status?'交易失败，业务状态 '+status[1]:r.reason||r.diagnostic||'未提供错误原因'
 return `<div class="om-issue-content"><strong>${esc(summary)}</strong>${r.reason?`<code>${esc(r.reason)}</code>`:''}<p>${esc(r.error_detail||(['failed','unmatched_failed'].includes(r.type)?'详细错误未上报':'该记录用于关联诊断，不计入失败订单'))}</p>${r.diagnostic&&['failed','unmatched_failed'].includes(r.type)?`<small>关联诊断：${esc(r.diagnostic)}</small>`:''}</div>`
}

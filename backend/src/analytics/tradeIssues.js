/** Group actual failure evidence and correlation diagnostics without mixing their units. */
function tradeIssues(orders,unlinked,lists){
 const groups=new Map()
 for(const r of [...orders.filter(o=>o.status==='failed'||o.status==='conflict'),...unlinked]){
  const type=r.status==='failed'?'failed':r.status==='conflict'?'conflict':r.reported_status==='failed'?'unmatched_failed':'correlation'
  const code=r.status==='unmatched'?r.error_reason:r.reason
  const diagnostic=type==='conflict'?(r.diagnostic_reason||'订单终态或关联存在冲突'):r.status==='unmatched'?r.reason:null
  const detail=r.error_detail||null,k=JSON.stringify([type,code||null,detail,diagnostic])
  if(!groups.has(k))groups.set(k,{type,reason:code||null,error_detail:detail,diagnostic,entity:r.status==='unmatched'?'终态记录':'订单结果',rows:[]})
  groups.get(k).rows.push(r)
 }
 return [...groups.values()].map((g,i)=>{const list_key='issue:'+i;lists[list_key]=g.rows.map(r=>r.id);return {type:g.type,reason:g.reason,error_detail:g.error_detail,diagnostic:g.diagnostic,entity:g.entity,records:g.rows.length,users:new Set(g.rows.map(r=>r.user_id)).size,chains:[...new Set(g.rows.map(r=>r.chain))].sort(),first_at:g.rows.reduce((n,r)=>Math.min(n,r.terminal_at),Infinity),last_at:g.rows.reduce((n,r)=>Math.max(n,r.last_terminal_at||r.terminal_at),-Infinity),list_key}}).sort((a,b)=>({failed:0,unmatched_failed:1,conflict:2,correlation:3}[a.type]-{failed:0,unmatched_failed:1,conflict:2,correlation:3}[b.type])||b.records-a.records||b.last_at-a.last_at)
}
module.exports={tradeIssues}

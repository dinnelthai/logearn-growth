/** Submission cohorts joined to terminal outcomes by attempt ID / trade ID.
 * Outcomes may arrive after the selected period, but never after asOf.
 * Missing correlation IDs are reported explicitly rather than guessed.
 */
const DAY = 86400000
export function computeTradeMonitor({users,startAt,endAt,asOf,source='all'}) {
 const submissions=[],outcomes=[],seen=new Set()
 const keys=(u,e)=>[e.trade_attempt_id&&`${u}:attempt:${e.trade_attempt_id}`,e.trade_id&&`${u}:trade:${e.trade_id}`].filter(Boolean)
 for(const u of users){
  if(source!=='all'&&u.source!==source)continue
  for(const e of u.events){
   if(!Number.isFinite(e.t)||e.t>asOf||!['trade_submitted','trade','trade_failed'].includes(e.type))continue
   const eventKey=e._raw_event_id&&`${u.id}:${e._raw_event_id}`
   if(eventKey&&seen.has(eventKey))continue
   if(eventKey)seen.add(eventKey)
   const row={...e,userId:u.id,keys:keys(u.id,e)}
   if(e.type==='trade_submitted'){if(e.t>=startAt&&e.t<endAt)submissions.push(row)}
   else outcomes.push(row)
  }
 }
 submissions.sort((a,b)=>a.t-b.t)
 const rows=[],lookup=new Map()
 for(const s of submissions){
  let row=s.keys.map(k=>lookup.get(k)).find(Boolean)
  if(!row){row={...s,outcome:null};rows.push(row)}
  for(const k of s.keys)lookup.set(k,row)
 }
 const unmatched=[]
 for(const o of outcomes.sort((a,b)=>a.t-b.t)){
  const row=o.keys.map(k=>lookup.get(k)).find(Boolean)
  if(!row||o.t<row.t){if(o.t>=startAt&&o.t<endAt)unmatched.push(o);continue}
  for(const key of o.keys)lookup.set(key,row)
  if(!row.outcome||o.t>=row.outcome.t)row.outcome=o
 }
 const aggregate=rs=>{
  const succeeded=rs.filter(r=>r.outcome?.type==='trade'),failed=rs.filter(r=>r.outcome?.type==='trade_failed')
  const missing=rs.filter(r=>!r.keys.length).length
  return {submitted:rs.length,succeeded:succeeded.length,failed:failed.length,pending:rs.filter(r=>r.keys.length&&!r.outcome).length,missingCorrelation:missing,successRate:rs.length&&!missing?succeeded.length/rs.length:null,failureRate:rs.length&&!missing?failed.length/rs.length:null}
 }
 const total=aggregate(rows),success=rows.filter(r=>r.outcome?.type==='trade'),failure=rows.filter(r=>r.outcome?.type==='trade_failed'),reasonMap=new Map()
 for(const r of failure){const reason=String(r.outcome.reason??'未知原因');reasonMap.set(reason,(reasonMap.get(reason)??0)+1)}
 const failureReasons=[...reasonMap].map(([reason,count])=>({reason,count,pct:total.failed?count/total.failed:0})).sort((a,b)=>b.count-a.count)
 const days=Array.from({length:Math.ceil((endAt-startAt)/DAY)},(_,i)=>{const t=startAt+i*DAY,r=aggregate(rows.filter(s=>s.t>=t&&s.t<t+DAY));return {t,...r,rate:r.successRate}})
 const byChain=[...new Set(rows.map(r=>String(r.chain??'未知')))].map(chain=>({chain,...aggregate(rows.filter(r=>String(r.chain??'未知')===chain))})).sort((a,b)=>b.submitted-a.submitted)
 return {totalSubmitted:total.submitted,totalSucceeded:total.succeeded,totalFailed:total.failed,successRate:total.successRate,failureRate:total.failureRate,pending:total.pending,missingCorrelation:total.missingCorrelation,unmatchedOutcomes:unmatched.length,uniqueSubmitters:new Set(rows.map(r=>r.userId)).size,uniqueTraders:new Set(success.map(r=>r.userId)).size,failureReasons,byChain,days}
}

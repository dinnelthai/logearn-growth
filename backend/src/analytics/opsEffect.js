function effectTargets(batch,rows){
 if(!['grant_quota','vip'].includes(batch.operation))return []
 return [...new Set(rows.filter(r=>r.state==='success').flatMap(r=>{
   const result=typeof r.result_json==='string'?JSON.parse(r.result_json):r.result
   const id=result?.summary?.user_id
   return result?.verification?.user_id===true&&typeof id==='string'&&/^[1-9]\d{0,19}$/.test(id)?[id]:[]
 }))]
}
function effectPeriods(batch,asOf,days=7){
 const anchor=batch.finished_at
 if(!['finished','cancelled','interrupted'].includes(batch.state)||!Number.isSafeInteger(anchor))return null
 const elapsed=Math.min(days*86400000,asOf+1-anchor)
 if(elapsed<=0)return null
 return {anchor,mature:elapsed===days*86400000,days,before:{start:anchor-elapsed,end:anchor},after:{start:anchor,end:anchor+elapsed}}
}
function advertisingTargets(rows){
 const sent=rows.filter(r=>r.state==='success'),ids=new Set();let unmatched=0
 for(const row of sent){const payload=typeof row.payload_json==='string'?JSON.parse(row.payload_json):row.payload;if(typeof payload?.accountId==='string'&&/^[1-9]\d{0,19}$/.test(payload.accountId))ids.add(payload.accountId);else unmatched++}
 return {ids:[...ids],sent:sent.length,unmatched}
}
module.exports={effectTargets,effectPeriods,advertisingTargets}

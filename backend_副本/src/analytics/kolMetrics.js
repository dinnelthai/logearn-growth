const DAY=86400000, OFFSET=25200000
function validatePeriod(body) {
  const {start,end}=body
  if (!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end-start>366*DAY||end>Date.now()+DAY) throw Object.assign(new Error('请选择有效统计期，最长366天'),{status:400})
  return {start,end}
}
function aggregateMembers(members,events,trades,{start,end,asOf}) {
  const bounds=new Map(members.map(m=>[m.id,Math.max(start*1000,m.bound_order??(m.bound_at??start)*1000)]))
  const users=new Map(members.map(m=>[m.id,{user_id:m.id,bound_at:m.bound_at??null,analysis_events:0,analysis_days:0,last_analysis_at:null,transactions:0,volume_usd:0,missing_values:0,excluded_trades:0}]))
  const days=new Map(),activeDays=new Map(),eventIds=new Set(),tradeIds=new Set()
  const date=t=>new Date(t+OFFSET).toISOString().slice(0,10)
  const daily=t=>{const key=date(t);if(!days.has(key))days.set(key,{date:key,analysis_events:0,transactions:0,volume_usd:0,missing_values:0});return days.get(key)}
  const inRange=(id,t,order=t*1000)=>bounds.has(id)&&Number.isFinite(t)&&Number.isFinite(order)&&order>=bounds.get(id)&&t<end&&t<=asOf
  for(const e of events) {
    const id=String(e.user_id),t=Number(e.t)
    if(!e.event_id||eventIds.has(e.event_id)||!inRange(id,t))continue
    eventIds.add(e.event_id)
    const row=users.get(id);row.analysis_events++;row.last_analysis_at=Math.max(row.last_analysis_at??0,t)
    if(!activeDays.has(id))activeDays.set(id,new Set());activeDays.get(id).add(date(t));daily(t).analysis_events++
  }
  for(const t of trades) {
    const id=String(t.account_id),at=Date.parse(t.transaction_time)
    if(!inRange(id,at,t.transaction_order==null?at*1000:Number(t.transaction_order)))continue
    const row=users.get(id)
    if(!t.valid||!t.transaction_hash||t.chain==null) {row.excluded_trades++;continue}
    const key=t.chain+':'+t.transaction_hash
    if(tradeIds.has(key))continue;tradeIds.add(key)
    row.transactions++;daily(at).transactions++
    const n=t.trade_value==null?null:Number(t.trade_value)
    if(n==null||!Number.isFinite(n)) {row.missing_values++;daily(at).missing_values++;continue}
    row.volume_usd+=Math.abs(n);daily(at).volume_usd+=Math.abs(n)
  }
  for(const [id,row] of users) {
    row.analysis_days=activeDays.get(id)?.size||0
    if(row.transactions>0&&row.missing_values===row.transactions)row.volume_usd=null
  }
  const rows=[...users.values()],sum=key=>rows.reduce((n,r)=>n+(r[key]??0),0)
  const total={users:rows.length,analysis_users:rows.filter(r=>r.analysis_events>0).length,analysis_events:sum('analysis_events'),analysis_days:sum('analysis_days'),last_analysis_at:rows.reduce((n,r)=>r.last_analysis_at==null?n:Math.max(n??0,r.last_analysis_at),null),trade_users:rows.filter(r=>r.transactions>0).length,transactions:sum('transactions'),volume_usd:sum('volume_usd'),missing_values:sum('missing_values'),excluded_trades:sum('excluded_trades')}
  if(total.transactions>0&&total.missing_values===total.transactions)total.volume_usd=null
  for(const day of days.values())if(day.transactions>0&&day.missing_values===day.transactions)day.volume_usd=null
  return {total,rows,daily:[...days.values()].sort((a,b)=>a.date.localeCompare(b.date))}
}
module.exports={validatePeriod,aggregateMembers}

const {memberMetrics}=require('../data/memberMetrics')
function rates(total){return total?{...total,analysis_rate:total.analysis_users==null||!total.users?null:total.analysis_users/total.users,trade_rate:total.trade_users==null||!total.users?null:total.trade_users/total.users,analysis_per_user:total.analysis_events==null||!total.users?null:total.analysis_events/total.users,volume_per_user:total.volume_usd==null||!total.users?null:total.volume_usd/total.users}:null}
function compareFacts(specs,facts,period,s){
 const scopes=specs.map(spec=>{const p={start:Math.max(period.start,spec.start??period.start),end:Math.min(period.end,spec.end??period.end)};const members=spec.members.filter(m=>(m.bound_order??(m.bound_at??p.start)*1000)<p.end*1000)
  const metrics=p.end>p.start&&!spec.reason?memberMetrics(facts,members,p,s):null
  return {...spec,members,period:p,metrics,total:rates(metrics?.total),no_window:p.end<=p.start}
 })
 // Keep disjoint eligibility intervals separate; a user's activity in a gap must not enter the union.
 const windows=new Map();let memberships=0
 for(const scope of scopes){if(scope.no_window||scope.reason)continue;memberships+=scope.members.length
  for(const m of scope.members){const id=String(m.id),lower=Math.max(scope.period.start*1000,m.bound_order??(m.bound_at??scope.period.start)*1000),upper=scope.period.end*1000;if(!windows.has(id))windows.set(id,[]);windows.get(id).push([lower,upper])}
 }
 const eligible=(id,order)=>(windows.get(String(id))||[]).some(([lower,upper])=>order>=lower&&order<upper)
 const unionFacts={...facts,events:facts.events.filter(e=>eligible(e.user_id,Number(e.t)*1000)),trades:facts.trades.filter(t=>eligible(t.account_id,t.transaction_order==null?Date.parse(t.transaction_time)*1000:Number(t.transaction_order)))}
 const union=memberMetrics(unionFacts,[...windows.keys()].map(id=>({id})),period,s)
 return {rows:scopes.map(({members,metrics,...scope})=>({...scope,requested_users:members.length,unmatched_users:metrics?.unmatched_users??null})),union:rates(union?.total),unique_requested_users:windows.size,overlap_memberships:memberships-windows.size,errors:facts.errors}
}
module.exports={compareFacts,rates}

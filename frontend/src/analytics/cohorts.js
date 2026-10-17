const DAY = 86400000
export const midnight = t => Math.floor((t + 7*3600000)/DAY)*DAY - 7*3600000
/** Historical first-analysis fact is used only for classification, never as a synthetic activity. */
export function firstEvent(user,type,asOf=Infinity){
 const observed=user.events.filter(e=>e.type===type&&Number.isFinite(e.t)&&e.t<=asOf).reduce((a,e)=>!a||e.t<a.t?e:a,null);
 const t=typeof user.first_analysis_at==='number'?user.first_analysis_at:Date.parse(user.first_analysis_at);
 if(type==='chip'&&Number.isFinite(t)&&t<=asOf&&(!observed||t<observed.t))return {type,t,entry_source:user.source,entry_module:user.first_analysis_entry_module,historical_fact:true};
 return observed;
}
export function buildCohorts(users, {startAt,endAt,asOf,initialEvent='chip',returningEvent='chip',sourceFilter='all'}) {
  const firstDay=midnight(startAt)
  const cohorts=Array.from({length:Math.ceil((endAt-firstDay)/DAY)},(_,i)=>({start:firstDay+i*DAY,users:[]}))
  for (const user of users) {
    const first=firstEvent(user,initialEvent,asOf)
    if (!first || first.t<startAt || first.t>=endAt || (sourceFilter!=='all' && first.entry_source!==sourceFilter && user.source!==sourceFilter)) continue
    const index=Math.floor((midnight(first.t)-firstDay)/DAY)
    if(cohorts[index]) cohorts[index].users.push(user)
  }
  return cohorts.map(co=>({...co,returningEvent,asOf}))
}
export function retainedUsers(cohort, period, continuous=false) {
  const onDay=(user,p)=>user.events.some(e=>e.type===cohort.returningEvent && e.t<=cohort.asOf && e.t>=cohort.start+p*DAY && e.t<cohort.start+(p+1)*DAY)
  return cohort.users.filter(user=>continuous?Array.from({length:period},(_,i)=>i+1).every(p=>onDay(user,p)):onDay(user,period))
}
export const periodObserved=(co,p)=>co.start+p*DAY<=co.asOf
export const periodComplete=(co,p)=>co.start+(p+1)*DAY<=co.asOf

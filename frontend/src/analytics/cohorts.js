const DAY = 86400000
export const midnight = t => Math.floor((t + 7*3600000)/DAY)*DAY - 7*3600000
export function buildCohorts(users, {startAt,endAt,asOf,initialEvent='chip',returningEvent='chip',sourceFilter='all'}) {
  const cohorts=Array.from({length:Math.ceil((endAt-startAt)/DAY)},(_,i)=>({start:startAt+i*DAY,users:[]}))
  for (const user of users) {
    const first=user.events.filter(e=>e.type===initialEvent && e.t<=asOf).reduce((a,e)=>!a||e.t<a.t?e:a,null)
    if (!first || first.t<startAt || first.t>=endAt || (sourceFilter!=='all' && first.entry_source!==sourceFilter)) continue
    const index=Math.floor((midnight(first.t)-startAt)/DAY)
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

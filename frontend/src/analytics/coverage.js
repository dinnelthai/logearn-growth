/** A nonempty array or earliest fact never proves coverage. Only explicit bounds do. */
const time = value => typeof value==='number'?value:typeof value==='string'?Date.parse(value):NaN
export function sourceCoverage(meta={}, source, asOf=Infinity, requestedStart=-Infinity) {
  if(!meta||typeof meta!=='object'||Array.isArray(meta))return null
  const start=time(meta[`${source}_start_at`]??meta.start_at)
  const end=time(meta[`${source}_complete_through`])
  if(meta.complete===false||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null
  const boundedStart=Math.max(start,requestedStart),boundedEnd=Math.min(end,asOf)
  return boundedEnd>boundedStart?{start:boundedStart,end:boundedEnd}:null
}
export function observationCeiling({events={},trades={},asOf}) {
  const ranges=[sourceCoverage(events,'events'),sourceCoverage(trades,'trades')].filter(Boolean)
  return Math.min(asOf,...ranges.map(r=>r.end))
}
export function periodCoverage(range,start,end) {
  if(!range||!Number.isFinite(range.start)||!Number.isFinite(range.end)||range.end<=range.start||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 'unknown'
  if(range.start<=start&&range.end>=end)return 'complete'
  if(range.end<=start||range.start>=end)return 'uncovered'
  return 'partial'
}
export const coverageLabel=state=>({complete:'覆盖完整',partial:'仅部分覆盖',uncovered:'未覆盖',unknown:'覆盖未确认'}[state]??'覆盖未确认')
export function cohortCoverage(co,period,ranges,continuous=false,initialRange=ranges) {
  const start=co.start+(continuous?1:period)*86400000,end=Math.min(co.start+(period+1)*86400000,co.asOf)
  return periodCoverage(initialRange,co.start,co.start+86400000)==='complete'&&end>start&&periodCoverage(ranges,start,end)==='complete'
}
export function rollingAverage({users,endAt,loadedStart,range,compute,day=86400000}) {
  const requestedStart=endAt-7*day
  const start=Math.max(requestedStart,Math.ceil((loadedStart+7*3600000)/day)*day-7*3600000)
  if(start>=endAt||periodCoverage(range,start,endAt)!=='complete')return {value:null,days:0}
  const rows=compute(users,start,endAt)
  return {value:rows.length?+(rows.reduce((n,r)=>n+r.active_users,0)/rows.length).toFixed(1):null,days:rows.length}
}

export function behaviorCoverage(type,coverage={}) {
  if(type!=='trade')return coverage.events??null
  if(!coverage.events||!coverage.trades)return null
  const start=Math.max(coverage.events.start,coverage.trades.start),end=Math.min(coverage.events.end,coverage.trades.end)
  return end>start?{start,end}:null
}

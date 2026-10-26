const {PATH_TYPES}=require('./eventMap')
const DAY=86400000,OFFSET=25200000,types=new Set(PATH_TYPES)
// Calendar-day observations describe return use, not activation or causal retention.
function pathCrossDay(users,body,s){
 const end=Math.min(body.end,Date.parse(s.as_of)+1),lists={},distribution=new Map(),transitions=new Map(),gaps=[]
 let observed=0,returning=0,analysisReturning=0
 for(const u of users){
  if(body.source&&body.source!=='all'&&u.source!==body.source)continue
  const events=u.events.filter(e=>types.has(e.type)&&e.type!=='strategy_heartbeat'&&Number.isFinite(e.t)&&e.t>=body.start&&e.t<end).slice().sort((a,b)=>a.t-b.t)
  if(!events.length)continue
  observed++
  const days=new Map(),analysisDays=new Set()
  for(const e of events){const d=Math.floor((e.t+OFFSET)/DAY);if(!days.has(d))days.set(d,e);if(['chip','chip_drilldown'].includes(e.type))analysisDays.add(d)}
  const key='crossday:days:'+days.size
  if(!lists[key])lists[key]=[];lists[key].push(u.id);distribution.set(days.size,(distribution.get(days.size)||0)+1)
  if(analysisDays.size>=2){analysisReturning++;(lists['crossday:analysis_return']??=[]).push(u.id)}
  const entries=[...days.values()]
  if(entries.length<2)continue
  returning++;(lists['crossday:returning']??=[]).push(u.id)
  gaps.push((entries[1].t-entries[0].t)/3600000)
  const from=entries[0].type,to=entries[1].type,k=JSON.stringify([from,to])
  if(!transitions.has(k))transitions.set(k,{from,to,users:0,list_key:'crossday:entry:'+k})
  const t=transitions.get(k);t.users++;(lists[t.list_key]??=[]).push(u.id)
 }
 gaps.sort((a,b)=>a-b)
 lists['crossday:returning']??=[];lists['crossday:analysis_return']??=[]
 return {lists,payload:{users:observed,returning_users:returning,analysis_returning_users:analysisReturning,median_first_return_hours:gaps.length?(gaps[Math.floor((gaps.length-1)/2)]+gaps[Math.ceil((gaps.length-1)/2)])/2:null,
 distribution:[...distribution].sort((a,b)=>a[0]-b[0]).map(([days,users])=>({days,users,list_key:'crossday:days:'+days})),
 entries:[...transitions.values()].sort((a,b)=>b.users-a.users||a.list_key.localeCompare(b.list_key)).slice(0,8),start:body.start,end,
 partial_last_day:end%DAY!==DAY-OFFSET,timezone:'Asia/Bangkok'}}
}
module.exports={pathCrossDay}

const IDLE_MS=30*60000
const CHECKPOINTS=new Set(['page_end','page_engaged'])
// Checkpoints belong to the visit that produced them, even across a long pause.
// They update observation time but never fabricate a new page entry.
function observedSessions(events,asOf){
 const states=new Map(),groups=[],visits=new Map()
 for(const e of events.filter(e=>Number.isFinite(e.t)&&e.t<=asOf).slice().sort((a,b)=>a.t-b.t||String(a.event_id||'').localeCompare(String(b.event_id||'')))){
  const sid=e.session_id?.trim()||null,key=sid?'session:'+sid:'inferred'
  if(CHECKPOINTS.has(e.type)){
   const group=e.page_visit_id?visits.get(e.page_visit_id):null
   if(group){group.events.push(e);group.last=Math.max(group.last,e.t)}
   continue
  }
  let group=states.get(key)
  if(!group||e.t-group.last>=IDLE_MS){group={key:key+':'+groups.length,inferred:!sid,events:[],last:e.t};groups.push(group);states.set(key,group)}
  group.events.push(e);group.last=e.t
  if(e.type==='page_view'&&e.page_visit_id)visits.set(e.page_visit_id,group)
 }
 return groups
}
module.exports={observedSessions,IDLE_MS}

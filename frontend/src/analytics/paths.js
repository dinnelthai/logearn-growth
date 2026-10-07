const IDLE_MS=30*60000
import { EVENT_LABELS } from './events.js'
const TYPES=new Set(Object.keys(EVENT_LABELS))
/** Counts actual session paths, with stage-indexed nodes so revisits never form cycles. */
export function computePaths(users,{startAt,endAt,asOf,startEvent='all',maxSteps=5,sourceFilter='all'}) {
  const sessions=[]
  for(const user of users) {
    if(sourceFilter!=='all'&&user.source!==sourceFilter)continue
    const events=user.events.filter(e=>TYPES.has(e.type)&&e.type!=='strategy_heartbeat'&&Number.isFinite(e.t)&&e.t<=asOf).slice().sort((a,b)=>a.t-b.t)
    const groups=new Map();let fallback=null,lastFallback=-Infinity,index=0
    for(const event of events) {
      let key
      if(event.session_id)key='session:'+event.session_id
      else {
        if(!fallback||event.t-lastFallback>=IDLE_MS)fallback='inferred:'+index++
        key=fallback;lastFallback=event.t
      }
      if(!groups.has(key))groups.set(key,[])
      groups.get(key).push(event)
    }
    for(const [key,group] of groups) {
      const start=startEvent==='all'?0:group.findIndex(e=>e.type===startEvent)
      if(start<0||group[start].t<startAt||group[start].t>=endAt)continue
      const available=group.slice(start).filter(e=>e.t<endAt)
      const compact=[]
      for(const event of available)if(compact.at(-1)?.type!==event.type)compact.push(event)
      if(!compact.length)continue
      const visible=compact.slice(0,maxSteps)
      const terminal=compact.length>maxSteps?'more':group.some(e=>e.t>=endAt)?'boundary':asOf-available.at(-1).t<IDLE_MS?'pending':'end'
      sessions.push({u:user,key:user.id+':'+key,events:visible,terminal,inferred:key.startsWith('inferred:')})
    }
  }
  const paths=new Map(),links=new Map(),nodes=new Map()
  for(const session of sessions) {
    const types=session.events.map(e=>e.type),key=JSON.stringify([types,session.terminal])
    if(!paths.has(key))paths.set(key,{types,terminal:session.terminal,rows:[]})
    paths.get(key).rows.push(session)
    const sequence=[...types,session.terminal].map((type,stage)=>({name:stage+':'+type,type,stage}))
    for(const node of sequence)if(!nodes.has(node.name))nodes.set(node.name,node)
    for(let i=0;i<sequence.length-1;i++) {
      const source=sequence[i].name,target=sequence[i+1].name,k=source+'>'+target
      if(!links.has(k))links.set(k,{source,target,value:0,rows:[]})
      const link=links.get(k);link.value++;link.rows.push(session)
    }
  }
  const ranked=[...paths.values()].map(p=>({...p,sessions:p.rows.length,users:new Set(p.rows.map(r=>r.u.id)).size})).sort((a,b)=>b.sessions-a.sessions)
  return {sessions:sessions.length,users:new Set(sessions.map(r=>r.u.id)).size,inferred_sessions:sessions.filter(r=>r.inferred).length,average_steps:sessions.length?sessions.reduce((n,r)=>n+r.events.length,0)/sessions.length:0,paths:ranked,nodes:[...nodes.values()].map(node=>({...node,value:Math.max([...links.values()].filter(l=>l.source===node.name).reduce((n,l)=>n+l.value,0),[...links.values()].filter(l=>l.target===node.name).reduce((n,l)=>n+l.value,0))})),links:[...links.values()]}
}

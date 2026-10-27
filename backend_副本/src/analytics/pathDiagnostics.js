const {entryPage}=require('./pageVisits')
const {deviceInfo}=require('./deviceInfo')
// Per-analysis cache: shared events are decoded once, then released with the job.
function createEventResolver(){
 const cache=new WeakMap()
 return e=>{
  if(e&&cache.has(e))return cache.get(e)
  const value={url:entryPage(e?.page_url||'页面未知'),info:deviceInfo(e)}
  if(e)cache.set(e,value)
  return value
 }
}
function pathDiagnostics(sessions,stage=null,resolveEvent=e=>({url:entryPage(e?.page_url||'页面未知'),info:deviceInfo(e)})){
 const pages=new Map()
 for(const s of sessions){
  const e=stage==null?s.observedEvents.at(-1):s.visibleEvents[Math.min(stage,s.visibleEvents.length-1)]
  const {url,info}=resolveEvent(e)
  if(!pages.has(url))pages.set(url,{url,sessions:0,users:new Set(),dimensions:{device:new Map(),browser:new Map(),os:new Map(),environment:new Map()}})
  const page=pages.get(url);page.sessions++;page.users.add(s.userId)
  for(const dim of Object.keys(page.dimensions)){
   const label=dim==='browser'?`${info.browser} ${info.version?.split('.')[0]||''}`.trim():info[dim]
   const map=page.dimensions[dim];if(!map.has(label))map.set(label,new Set());map.get(label).add(s.userId)
  }
 }
 return {sessions:sessions.length,users:new Set(sessions.map(s=>s.userId)).size,pages:[...pages.values()].map(p=>({url:p.url,sessions:p.sessions,users:p.users.size,dimensions:Object.fromEntries(Object.entries(p.dimensions).map(([dim,groups])=>[dim,[...groups].map(([label,ids])=>({label,users:ids.size})).sort((a,b)=>b.users-a.users)]))})).sort((a,b)=>b.users-a.users||b.sessions-a.sessions)}
}
module.exports={pathDiagnostics,createEventResolver}

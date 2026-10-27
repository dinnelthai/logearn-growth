const {computePaths}=require('./paths')
const {PATH_TYPES}=require('./eventMap')
function validatePaths(b){const bounded=Array.isArray(b.audience_ids)||!!b.cohort_id,maxDays=bounded?31:7;if(b.path_direction!=null&&!['after','before'].includes(b.path_direction)||b.path_direction==='before'&&(!b.path_start||b.path_start==='all')||b.details!=null&&typeof b.details!=='boolean'||b.end-b.start>maxDays*86400000||b.path_start&&!['all',...PATH_TYPES].includes(b.path_start)||b.path_stop&&!['none',...PATH_TYPES].includes(b.path_stop)||b.path_depth!=null&&![3,5,7].includes(Number(b.path_depth)))throw Object.assign(new Error(`路径支持最长${maxDays}天、3/5/7步和有效业务起点`),{status:400})}
function pathInsights(users,body,s){
 const r=computePaths(users,{startAt:body.start,endAt:body.end,asOf:Date.parse(s.as_of),startEvent:body.path_start||'all',direction:body.path_direction||'after',stopEvent:body.path_stop||'none',maxSteps:Number(body.path_depth)||5,sourceFilter:body.source||'all',typeSet:new Set(PATH_TYPES),includeDiagnosticSessions:true})
 const diagnosticOptions={start:body.start,end:body.end,asOf:Date.parse(s.snapshot_cutoff||s.as_of)}
 const details=body.details!==false,empty={lists:{},members:{},payload:null}
 const visits=details?require('./pageVisits').pageVisits(users,diagnosticOptions):empty
 const bounce=details?require('./homeBounce').homeBounce(users,diagnosticOptions):empty
 const requests=details?require('./requestDiagnostics').requestDiagnostics(users,diagnosticOptions):empty
 const value=details?require('./valueDiagnostics').valueDiagnostics(users,diagnosticOptions,requests.analysis_rows):empty
 const crossDay=require('./pathCrossDay').pathCrossDay(users,body,s)
 const lists={...crossDay.lists,all:r.user_ids,...visits.lists,...bounce.lists,...requests.lists,...value.lists},members={}
 for(const u of users){lists['diagnostic:user:'+u.id]=[u.id]}
 for(const u of users)members[u.id]={id:u.id,source:u.source,...visits.members[u.id]}
 const paths=r.paths.slice(0,100)
 for(const p of paths)lists['path:'+p.path_key]=p.user_ids
 lists.other=r.paths.slice(100).flatMap(p=>p.user_ids);lists.other=[...new Set(lists.other)]
 for(const n of r.nodes)lists['node:'+n.name]=n.user_ids
 for(const l of r.links)lists['link:'+l.link_key]=l.user_ids
 for(const [k,v]of Object.entries(r.terminal_counts))lists['terminal:'+k]=v.user_ids
 // Graph only the top12 paths, with a clearly labelled denominator and coverage.
 const graphPaths=r.paths.slice(0,12),nodes=new Map(),links=new Map()
 for(const p of graphPaths){const seq=[...p.types,p.terminal].map((type,stage)=>({name:stage+':'+type,type,stage}));for(const n of seq)nodes.set(n.name,n)
  for(let i=0;i<seq.length-1;i++){const key=seq[i].name+'>'+seq[i+1].name;if(!links.has(key))links.set(key,{source:seq[i].name,target:seq[i+1].name,value:0,link_key:key});links.get(key).value+=p.sessions}
 }
 // Graph links and nodes drill into graph-visible paths, not all unrelated paths.
 for(const l of links.values())lists['graph:link:'+l.link_key]=[...new Set(graphPaths.filter(p=>[...p.types,p.terminal].some((t,i)=>i<[...p.types,p.terminal].length-1&&i+':'+t===l.source&&(i+1)+':'+[...p.types,p.terminal][i+1]===l.target)).flatMap(p=>p.user_ids))]
 for(const n of nodes.values())lists['graph:node:'+n.name]=[...new Set(graphPaths.filter(p=>[...p.types,p.terminal][n.stage]===n.type).flatMap(p=>p.user_ids))]
 const {pathDiagnostics,createEventResolver}=require('./pathDiagnostics'),diagnostics={},resolveEvent=createEventResolver()
 const visibleKeys=new Set(graphPaths.map(p=>p.path_key)),nodeSessions=new Map(),linkSessions=new Map(),terminalSessions=new Map(Object.keys(r.terminal_counts).map(t=>[t,[]]))
 // Index each selected session once rather than rescanning it for every node/edge.
 for(const session of r.diagnostic_sessions){
  terminalSessions.get(session.terminal).push(session)
  if(!visibleKeys.has(JSON.stringify([session.types,session.terminal])))continue
  const seq=[...session.types,session.terminal]
  for(let stage=0;stage<seq.length;stage++){
   const name=stage+':'+seq[stage]
   if(!nodeSessions.has(name))nodeSessions.set(name,[])
   nodeSessions.get(name).push(session)
   if(stage){const key=(stage-1)+':'+seq[stage-1]+'>'+name;if(!linkSessions.has(key))linkSessions.set(key,[]);linkSessions.get(key).push(session)}
  }
 }
 const terminalTypes=new Set(['reached','end','pending','boundary','more'])
 for(const n of nodes.values())diagnostics['graph:node:'+n.name]=pathDiagnostics(nodeSessions.get(n.name)||[],terminalTypes.has(n.type)?null:n.stage,resolveEvent)
 for(const l of links.values()){
  const stage=Number(l.target.split(':')[0]),type=l.target.split(':')[1]
  diagnostics['graph:link:'+l.link_key]=pathDiagnostics(linkSessions.get(l.link_key)||[],terminalTypes.has(type)?null:stage,resolveEvent)
 }
 for(const [terminal,matches]of terminalSessions)diagnostics['terminal:'+terminal]=pathDiagnostics(matches,null,resolveEvent)
 const graphSessions=graphPaths.reduce((n,p)=>n+p.sessions,0)
 return {members,lists,payload:{cross_day:crossDay.payload,path_direction:body.path_direction||'after',details_available:details,home_bounce:bounce.payload,request_diagnostics:requests.payload,value_diagnostics:value.payload,path_diagnostics:diagnostics,page_visits:visits.payload,sessions:r.sessions,users:r.users,inferred_sessions:r.inferred_sessions,average_steps:r.average_steps,terminals:Object.fromEntries(Object.entries(r.terminal_counts).map(([k,v])=>[k,{sessions:v.sessions,users:v.user_ids.length,list_key:'terminal:'+k}])),paths:paths.map(({user_ids,...p})=>({...p,list_key:'path:'+p.path_key})),path_count:r.paths.length,other_users:lists.other.length,graph:{sessions:graphSessions,coverage:r.sessions?graphSessions/r.sessions:null,nodes:[...nodes.values()].map(n=>({...n,list_key:'graph:node:'+n.name,users:lists['graph:node:'+n.name].length})),links:[...links.values()].map(l=>({...l,list_key:'graph:link:'+l.link_key,users:lists['graph:link:'+l.link_key].length}))},start:body.start,end:body.end,as_of:Date.parse(s.as_of),context_scope:'complete_relevant_observed',user_pool:'observed_sessions'}}
}
module.exports={pathInsights,validatePaths}

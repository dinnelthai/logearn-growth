// Strip query strings/fragments; page paths are diagnostic, never proof of exit.
function safePage(value){
 if(typeof value!=='string'||!value.trim())return null
 try{const u=new URL(value,'https://relative.invalid');if(!['http:','https:'].includes(u.protocol))return null;return (u.hostname==='relative.invalid'?'':u.origin)+u.pathname}catch{return null}
}
function entryPage(value){
 try{const path=new URL(value,'https://relative.invalid').pathname;if(/^\/(?:cn|en)\/[^/]+\/tokens\/[^/]+\/?$/.test(path))return 'Token 详情页';if(/^\/(?:cn|en)\/[^/]+\/address\/[^/]+\/?$/.test(path))return '钱包地址详情页';return value}catch{return value}
}
function pageVisits(users,{start,end,asOf}){
 const entries=new Map(),lists={},members={},records=[],all=new Set(),single=new Set(),tokenNoAnalysis=new Set();let sessions=0,missing=0,contextSessions=0
 for(const u of users){const durations=new Map();for(const e of u.events)if(e.type==='page_end'&&e.t<=asOf&&e.page_visit_id&&e.duration_ms!=null&&Number.isFinite(Number(e.duration_ms))&&Number(e.duration_ms)>=0)durations.set(e.page_visit_id,Math.max(durations.get(e.page_visit_id)||0,e.duration_ms));const groups=new Map();let fallback=0,last=-Infinity
  for(const e of [...u.events].filter(e=>e.type!=='page_end').sort((a,b)=>a.t-b.t)){if(e.t-last>=1800000)fallback++;last=e.t;const key=e.session_id||'inferred:'+fallback;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e)}
  for(const es of groups.values()){
   if(es[0].t<start||es[0].t>=end)continue
   const events=es.filter(e=>e.t<end&&e.t<=asOf),explicitPages=events.filter(e=>e.type==='page_view'&&e.page_url),pages=explicitPages.length?explicitPages:events.filter(e=>e.page_url).filter((e,i,a)=>i===0||e.page_url!==a[i-1].page_url)
   if(!explicitPages.length&&pages.length)contextSessions++
   if(!pages.length){missing++;continue}sessions++;all.add(u.id)
   const entry=entryPage(pages[0].page_url),analysis=events.some(e=>['chip','chip_drilldown'].includes(e.type)),core=events.some(e=>!(e.type==='login'&&e.login_type==='auto_restore')&&!['page_view','app_open','first_visit','login_click','token','callouts','signals','popular','fomo'].includes(e.type)),mature=asOf-events.at(-1).t>=1800000&&!es.some(e=>e.t>=end)
   const idle=explicitPages.length>0&&pages.length===1&&!core&&mature
   if(idle)single.add(u.id);if(events.some(e=>e.type==='token')&&!analysis&&mature)tokenNoAnalysis.add(u.id)
   if(!entries.has(entry))entries.set(entry,{url:entry,sessions:0,users:new Set(),single:new Set(),analysis:new Set(),pending:0,device_sessions:[]})
   const info=require('./deviceInfo').deviceInfo(pages[0]);
   const contextOnly=!explicitPages.length&&pages.length===1&&!core&&mature
   const state=idle?'idle':contextOnly?'context':!mature?'pending':'continued'
   const r=entries.get(entry);r.device_sessions.push({id:u.id,info,state,explicit:explicitPages.length>0});
   const profiles=members[u.id]?.entry_sessions||[];profiles.push({...info,entry_page:entry,entry_at:pages[0].t,last_observed_at:events.at(-1).t,observation_status:state});
   if(!members[u.id]||pages[0].t<members[u.id].entry_at)members[u.id]={...info,entry_page:entry,entry_at:pages[0].t,last_observed_at:events.at(-1).t,observation_status:state};members[u.id].entry_sessions=profiles;
   r.sessions++;r.users.add(u.id);if(idle)r.single.add(u.id);if(analysis)r.analysis.add(u.id);if(!mature)r.pending++
   for(const p of pages)records.push({user_id:u.id,session_id:p.session_id||null,t:p.t,url:p.page_url,record_source:explicitPages.length?'页面浏览':'业务事件所在页面',page_visit_id:p.page_visit_id??null,page_name:p.page_name??null,view_mode:p.view_mode??null,navigation_source:p.navigation_source??null,previous_page_visit_id:p.previous_page_visit_id??null,previous_page_path:safePage(p.previous_page_path),...require('./deviceInfo').deviceInfo(p),duration_ms:durations.get(p.page_visit_id)??p.duration_ms??null})
  }
 }
 const rows=[...entries.values()].sort((a,b)=>b.sessions-a.sessions).slice(0,100).map((r,i)=>{const key='url:entry:'+i;lists[key]=[...r.users];lists[key+':single']=[...r.single];return {url:r.url,sessions:r.sessions,users:r.users.size,single_users:r.single.size,analysis_users:r.analysis.size,pending:r.pending,list_key:key,device_breakdown:deviceBreakdown(r.device_sessions,key,lists)}})
 for(const r of records.sort((a,b)=>b.t-a.t).slice(0,1000))lists['url:user:'+r.user_id]=[r.user_id]
 lists['url:all']=[...all];lists['url:single']=[...single];lists['url:token_no_analysis']=[...tokenNoAnalysis]
 return {members,lists,payload:{visit_dimensions:visitDimensions(records),sessions,context_sessions:contextSessions,users:all.size,missing_sessions:missing,single_users:single.size,token_no_analysis_users:tokenNoAnalysis.size,entries:rows,records:records.sort((a,b)=>b.t-a.t).slice(0,1000),records_truncated:records.length>1000}}
}
module.exports={safePage,entryPage,pageVisits}

function deviceBreakdown(sessions,prefix,lists){
 const dimensions={device:'设备',browser:'浏览器',os:'操作系统',environment:'浏览器环境'}
 return Object.fromEntries(Object.keys(dimensions).map(dim=>{
  const groups=new Map()
  for(const s of sessions){const label=s.info[dim];if(!groups.has(label))groups.set(label,[]);groups.get(label).push(s)}
  const rows=[...groups].map(([label,ss],i)=>{
   const base=prefix+':device:'+dim+':'+i,sets={all:new Set(),mature:new Set(),idle:new Set(),context:new Set(),pending:new Set(),eligible:new Set(),context_eligible:new Set()}
   for(const s of ss){if(!s.explicit&&s.state!=='pending')sets.context_eligible.add(s.id);if(s.explicit&&s.state!=='pending')sets.eligible.add(s.id);sets.all.add(s.id);sets[s.state==='continued'?'mature':s.state].add(s.id);if(s.state!=='pending')sets.mature.add(s.id)}
   for(const [name,set]of Object.entries(sets))lists[base+':'+name]=[...set]
   return {label,list_key:base,users:sets.all.size,mature_users:sets.mature.size,eligible_users:sets.eligible.size,context_eligible_users:sets.context_eligible.size,idle_users:sets.idle.size,context_users:sets.context.size,pending_users:sets.pending.size,idle_rate:sets.eligible.size?sets.idle.size/sets.eligible.size:null,context_rate:sets.context_eligible.size?sets.context.size/sets.context_eligible.size:null}
  }).sort((a,b)=>(b.idle_users+b.context_users)-(a.idle_users+a.context_users)||b.users-a.users)
  return [dim,rows]
 }))
}

function visitDimensions(records){
 const dimensions={view_mode:r=>r.view_mode||'unknown',navigation_source:r=>r.navigation_source||'unknown',viewport:r=>r.viewport_width==null?'unknown':r.viewport_width<768?'narrow':r.viewport_width<1200?'medium':'wide'}
 return Object.fromEntries(Object.entries(dimensions).map(([dimension,key])=>{
  const groups=new Map()
  for(const r of records){if(r.record_source!=='页面浏览')continue;const value=key(r);if(!groups.has(value))groups.set(value,{value,visits:0,users:new Set(),duration_visits:0,duration_ms:0});const g=groups.get(value);g.visits++;g.users.add(r.user_id);if(r.duration_ms!=null){g.duration_visits++;g.duration_ms+=Number(r.duration_ms)}}
  return [dimension,[...groups.values()].map(g=>({...g,users:g.users.size,average_duration_ms:g.duration_visits?g.duration_ms/g.duration_visits:null})).sort((a,b)=>b.visits-a.visits)]
 }))
}

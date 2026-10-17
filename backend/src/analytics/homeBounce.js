const {observedSessions,IDLE_MS}=require('./observedSessions')
const {safePage}=require('./pageVisits')
const ACTIVE=new Set(['chip','chip_drilldown','trade_submitted','ai'])
function isHome(e){if(e.type!=='page_view'||e.view_mode!=='page')return false;const url=safePage(e.page_url);if(!url)return false;return /^\/(?:cn\/?|en\/?)?$/.test(new URL(url,'https://relative.invalid').pathname)}
function homeBounce(users,{start,end,asOf}){
 const samples=[],lists={},buckets={bounced:[],engaged:[],pending:[],unknown:[]}
 for(const u of users)for(const group of observedSessions(u.events,asOf)){
  const pages=group.events.filter(e=>e.type==='page_view'),first=pages[0],entryEvent=group.events.find(e=>!['page_end','page_engaged'].includes(e.type)&&!e.diagnostic)
  if(!entryEvent||entryEvent.t<start||entryEvent.t>=end||!first||!isHome(first)||first.t<start||first.t>=end)continue
  const events=group.events.filter(e=>e.t>=first.t),checkpoints=events.filter(e=>['page_engaged','page_end'].includes(e.type)&&e.page_visit_id===first.page_visit_id)
  const times=checkpoints.map(e=>e.duration_ms).filter(x=>x!=null&&Number.isFinite(Number(x))&&Number(x)>=0).map(Number)
  const duration=times.length?Math.max(...times):null
  const engaged=!!first.page_visit_id&&(events.some(e=>e.type==='page_engaged'&&e.page_visit_id===first.page_visit_id)||duration>=10000&&duration!=null||pages.some(e=>e.page_visit_id&&e.page_visit_id!==first.page_visit_id)||events.some(e=>ACTIVE.has(e.type)||e.type==='login'&&e.login_type==='manual'))
  const closed=asOf-group.last>=IDLE_MS
  // Only explicit visit-end evidence can establish a short visit; hiding/pagehide is ambiguous.
  const shortEnd=checkpoints.some(e=>e.type==='page_end'&&['route_leave','unmount'].includes(e.end_reason)&&e.duration_ms!=null&&Number(e.duration_ms)>=0&&Number(e.duration_ms)<10000)
  const state=!closed?'pending':!first.page_visit_id?'unknown':engaged?'engaged':shortEnd&&duration!=null&&duration<10000?'bounced':'unknown'
  const sample={user_id:u.id,entry_at:first.t,last_observed_at:group.last,page_visit_id:first.page_visit_id,url:first.page_url,state,duration_ms:duration,source:u.source||'未知',device:require('./deviceInfo').deviceInfo(first).device,viewport:first.viewport_width==null?'unknown':Number(first.viewport_width)<768?'narrow':Number(first.viewport_width)<1200?'medium':'wide',app_version:first.app_version||'unknown',diagnostics_version:first.properties?.diagnostics_version||'unknown'}
  samples.push(sample);buckets[state].push(u.id)
 }
 function summary(rows){const counts=Object.fromEntries(Object.keys(buckets).map(k=>[k,rows.filter(r=>r.state===k).length])),denominator=counts.bounced+counts.engaged;return {sessions:rows.length,engaged_users:new Set(rows.filter(r=>r.state==='engaged').map(r=>r.user_id)).size,...counts,denominator,bounce_rate:denominator?counts.bounced/denominator:null}}
 for(const [state,ids]of Object.entries(buckets))lists['bounce:'+state]=[...new Set(ids)]
 const dimensions=Object.fromEntries(['source','device','viewport','app_version','diagnostics_version'].map(dim=>{const values=[...new Set(samples.map(r=>r[dim]))];return [dim,values.map((value,i)=>{const rows=samples.filter(r=>r[dim]===value),key='bounce:'+dim+':'+i;lists[key]=[...new Set(rows.map(r=>r.user_id))];return {value,...summary(rows),list_key:key}}).sort((a,b)=>b.sessions-a.sessions)]}))
 return {lists,payload:{...summary(samples),dimensions,available:samples.length>0,records:samples.sort((a,b)=>b.entry_at-a.entry_at).slice(0,100),records_truncated:samples.length>100,as_of:asOf,definition:'首页主页面 /、/cn、/en；同标签页30分钟无活动分段，观察结束且可判定会话为分母；缺少结束证据保持未知，pagehide不证明退出。'}}
}
module.exports={homeBounce,isHome}

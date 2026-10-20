const {requestDiagnostics}=require('./requestDiagnostics')
const {validateGrowth}=require('./growthInsights')
const inRange=(t,a,b)=>Number.isFinite(t)&&t>=a&&t<b
const isAnalysis=e=>e.type==='chip'||['chip_analysis_viewed','chip_analysis_drilldown'].includes(e.raw_name)
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]
// Average all replacement orders so a chosen order cannot determine the explanation.
function factorContributions(before,after){
 const product=a=>a.reduce((n,v)=>n*v,1),effects=[0,0,0]
 for(const order of permutations){const values=before.slice();for(const i of order){const old=product(values);values[i]=after[i];effects[i]+=(product(values)-old)/6}}
 return effects
}
const REASONS={
 request_success_no_north:'请求成功，未观测筹码查看/下钻',
 analysis_failed:'最近分析请求明确失败',analysis_cancelled:'最近分析请求明确取消',analysis_empty:'最近分析请求为空结果',
 analysis_pending:'最近分析请求仍在观察',analysis_unknown:'最近分析请求结果未知',analysis_conflict:'最近分析请求证据冲突',
 login_failed:'最近登录尝试明确失败',login_cancelled:'最近登录尝试明确取消',login_pending:'最近登录尝试仍在观察',login_unknown:'最近登录尝试结果未知',login_conflict:'最近登录尝试证据冲突',
 token_no_request:'浏览Token，未观测分析发起',logged_no_analysis:'有登录证据，未观测分析',visit_no_login:'有访问，未观测登录证据',no_visit:'未观测页面访问',
}
function conversionLoss(users,b,s){
 validateGrowth(b)
 const start=b.start,end=Math.min(b.end,Date.parse(s.as_of)+1),previousStart=start-(end-start)
 if(end<=start)throw Object.assign(new Error('统计期尚未到达数据截至时间'),{status:400})
 const lists={},members=Object.fromEntries(users.map(u=>[u.id,{id:u.id,source:u.source||'未知'}]))
 const put=(key,ids)=>{lists[key]=[...new Set(ids)];return lists[key].length}
 function period(a,z,prefix){
  const visited=[],logged=[],sequenced=[],analyzed=[],outside=[],byUser=new Map()
  for(const u of users){
   const es=u.events.filter(e=>inRange(e.t,a,z)).slice().sort((x,y)=>x.t-y.t||String(x.event_id||'').localeCompare(String(y.event_id||'')))
   const page=es.find(e=>e.type==='page_view')
   const auth=page?es.find(e=>e.type==='page_view'&&e.logged_in&&e.t>=page.t||e.type==='login'&&e.t>page.t):null
   const chip=auth?es.find(e=>isAnalysis(e)&&e.t>auth.t):null
   const any=es.some(isAnalysis)
   if(page)visited.push(u.id);if(auth)logged.push(u.id);if(chip)sequenced.push(u.id);if(any)analyzed.push(u.id);if(any&&!chip)outside.push(u.id)
   byUser.set(u.id,{page,auth,chip,any,token:es.some(e=>e.type==='token')})
  }
  const payload={start:a,end:z,visitors:put(prefix+':visitors',visited),logged:put(prefix+':logged',logged),sequenced:put(prefix+':sequenced',sequenced),analyzed:put(prefix+':analyzed',analyzed),outside:put(prefix+':outside',outside),list_key:prefix}
  payload.login_rate=payload.visitors?payload.logged/payload.visitors:null
  payload.analysis_rate=payload.logged?payload.sequenced/payload.logged:null
  return {payload,byUser}
 }
 const current=period(start,end,'loss:current'),previous=period(previousStart,start,'loss:previous'),c=current.payload,p=previous.payload
 const lost=users.filter(u=>previous.byUser.get(u.id).any&&!current.byUser.get(u.id).any)
 const diagnostics=requestDiagnostics(users,{start,end,asOf:end-1})
 const relevant=r=>r.started_at<end&&(r.started_at>=start||inRange(r.finished_at,start,end))
 const groupRows=rows=>{const map=new Map();for(const r of rows.filter(relevant)){if(!map.has(r.user_id))map.set(r.user_id,[]);map.get(r.user_id).push(r)}for(const rows of map.values())rows.sort((a,b)=>b.started_at-a.started_at||a.id.localeCompare(b.id));return map}
 const requests=groupRows(diagnostics.analysis_rows),logins=groupRows(diagnostics.login_rows)
 const groups=Object.fromEntries(Object.keys(REASONS).map(k=>[k,[]]))
 for(const u of lost){
  const seen=current.byUser.get(u.id),rs=requests.get(u.id)||[],ls=logins.get(u.id)||[]
  let reason
  if(rs.some(r=>r.state==='success'&&inRange(r.finished_at,start,end)))reason='request_success_no_north'
  else if(rs.length)reason='analysis_'+rs[0].state
  else if(ls.length&&ls[0].state!=='success')reason='login_'+ls[0].state
  else if(seen.token)reason='token_no_request'
  else if(seen.auth)reason='logged_no_analysis'
  else if(seen.page)reason='visit_no_login'
  else reason='no_visit'
  if(!groups[reason])reason='analysis_unknown'
  groups[reason].push(u.id)
 }
 const reasons=Object.entries(groups).map(([key,ids])=>({key,label:REASONS[key],users:put('loss:reason:'+key,ids),list_key:'loss:reason:'+key})).sort((a,b)=>b.users-a.users)
 const available=[c.login_rate,c.analysis_rate,p.login_rate,p.analysis_rate].every(x=>x!=null)
 const effects=available?factorContributions([p.visitors,p.login_rate,p.analysis_rate],[c.visitors,c.login_rate,c.analysis_rate]):null
 const attribution={available,reason:available?null:'两期访问或登录证据分母不足，不拆分不存在的比例',delta:c.analyzed-p.analyzed,sequenced_delta:c.sequenced-p.sequenced,outside_delta:c.outside-p.outside,
  factors:effects?['访问人数变化','访问后登录证据覆盖变化','登录后分析覆盖变化'].map((label,i)=>({label,effect:effects[i]})):[]}
 const list_periods=Object.fromEntries(Object.keys(lists).filter(k=>k.startsWith('loss:previous:')).map(k=>[k,{start:previousStart,end:start}]))
 return {lists,members,payload:{start,end,previous_start:previousStart,previous_end:start,as_of:Date.parse(s.as_of),source:b.source||'all',current:c,previous:p,attribution,list_periods,
  lost_users:put('loss:absent',lost.map(u=>u.id)),reasons,diagnostic_availability:{analysis:diagnostics.payload.families.analysis.available,login:diagnostics.payload.families.login.available},candidate_count:users.length,truncated:false,
  definition:'按用户及期间内严格先后证据拆解：页面访问→已登录证据→筹码查看/下钻；自带账号的页面可同时证明访问与登录。允许同一用户跨访问，但不宣称同一会话或24小时漏斗。两期等时长，结果仅为已观测变化，不证明业务因果或确认流失。请求线索包括本期发起或本期出现终态，状态只使用截至本期期末的证据；没有新事件不能证明未发起。'}}
}
module.exports={conversionLoss,factorContributions,REASONS}

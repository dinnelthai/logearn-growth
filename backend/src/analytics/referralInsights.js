const {businessSignals}=require('./segmentInsights')
const DAY=86400000
const order=r=>r.invitation_order??r.invitation_at*1000
function validateReferral(body){
 if(body.scope&&!['period','all'].includes(body.scope)||body.quality&&!['all','business','value','used','contactable'].includes(body.quality)||body.window_days!=null&&![7,28].includes(Number(body.window_days))||body.inviter!=null&&!/^(?:user:)?\d{1,20}$/.test(String(body.inviter)))throw Object.assign(new Error('未知推荐筛选条件'),{status:400})
}
function computeReferralInsights(input,relations,{start,end,asOf,factsAsOf,scope='all',quality='all',inviter=null,source='all',windowDays=28,audience=null}){
 const accounts=new Map(input.filter(u=>u.account_id!=null).map(u=>[String(u.account_id),businessSignals(u,factsAsOf)])),members={},lists={}
 const put=(key,ids)=>{lists[key]=[...new Set(ids)];return lists[key].length},id=u=>'user:'+u
 for(const [key,u]of accounts)members[id(key)]={id:id(key),source:u.source||'未知',registered:true,telegram_bound:!!u.telegram_bound,email_bound:!!u.email_bound,trade_count:u.trade_count,signal_tier:u.signal_tier}
 const grouped=new Map(),anomalies=[],qualityCounts={}
 function reject(r,reason){qualityCounts[reason]=(qualityCounts[reason]||0)+1;const key='relation:'+r.id;members[key]={id:key,registered:false,source:'关系异常',invitee_id:r.user_id,inviter_id:r.level1_user_id,bound_at:r.invitation_at,reason};anomalies.push(key)}
 for(const r of relations){
  if(!r.is_valid){reject(r,'无效关系');continue}
  if(!Number.isFinite(r.invitation_at)||r.invitation_at>factsAsOf){reject(r,'绑定时间异常');continue}
  if(r.level1_user_id===r.user_id){reject(r,'自邀关系');continue}
  if(!r.level1_user_id){reject(r,'缺一级推荐人');continue}
  if(r.level1_user_id==='0'){reject(r,'推荐人ID=0（身份未确认）');continue}
  if(!accounts.has(r.level1_user_id)){reject(r,'推荐人未匹配账号');continue}
  if(!accounts.has(r.user_id)){reject(r,'被邀请人未匹配账号');continue}
  if(accounts.get(r.user_id).created_at>r.invitation_at){reject(r,'注册晚于绑定');continue}
  if(!grouped.has(r.user_id))grouped.set(r.user_id,[]);grouped.get(r.user_id).push(r)
 }
 const valid=new Map()
 for(const [uid,rs]of grouped){const first=rs.reduce((n,r)=>Math.min(n,order(r)),Infinity),earliest=rs.filter(r=>order(r)===first)
  if(new Set(earliest.map(r=>r.level1_user_id)).size>1){rs.forEach(r=>reject(r,'同时间推荐人冲突'));continue}
  const chosen=earliest.sort((a,b)=>a.id.localeCompare(b.id))[0];valid.set(uid,chosen)
  rs.filter(r=>r!==chosen).forEach(r=>reject(r,'重复或晚绑定关系'))
 }
 // Detect directed cycles in linear time; exclude every member of a cycle.
 const done=new Set(),cycles=new Set()
 for(const uid of valid.keys()){if(done.has(uid))continue;const path=[],positions=new Map();let next=uid
  while(valid.has(next)&&!done.has(next)&&!positions.has(next)){positions.set(next,path.length);path.push(next);next=valid.get(next).level1_user_id}
  if(positions.has(next))path.slice(positions.get(next)).forEach(x=>cycles.add(x));path.forEach(x=>done.add(x))
 }
 for(const uid of cycles){reject(valid.get(uid),'循环关系');valid.delete(uid)}
 const all=[...valid.values()],children=new Map()
 for(const r of all){if(!children.has(r.level1_user_id))children.set(r.level1_user_id,[]);children.get(r.level1_user_id).push(r)}
 for(const [uid,rs]of children){members[id(uid)].children_count=put('children:'+uid,rs.map(r=>id(r.user_id)));put('profile:'+uid,[id(uid)])}
 const matching=r=>{const u=accounts.get(r.user_id);return (source==='all'||u.source===source)&&(!audience||audience.includes(id(r.user_id)))&&(!inviter||r.level1_user_id===String(inviter).replace(/^user:/,''))&&(quality==='all'||quality==='business'&&u.business_signal||quality==='value'&&u.value_signal||quality==='used'&&u.recent_used||quality==='contactable'&&u.value_signal&&u.contactable)}
 const chosen=all.filter(r=>(scope==='all'||r.invitation_at>=start&&r.invitation_at<end)&&matching(r)),cohortStart=scope==='all'?0:start,cohortEnd=scope==='all'?factsAsOf+1:Math.min(end,factsAsOf+1)
 const flag=r=>{const u=accounts.get(r.user_id),afterAnalysis=u.last_chip_at!=null&&u.last_chip_at*1000>=order(r)&&u.last_chip_at<=asOf,afterStrategy=u.last_strategy_at!=null&&u.last_strategy_at*1000>=order(r)&&u.last_strategy_at<=asOf
  const next=(children.get(r.user_id)||[]).filter(c=>order(c)>order(r)&&c.invitation_at<=factsAsOf)
  return {...r,u,analysis:afterAnalysis,strategy:afterStrategy,used:afterAnalysis||afterStrategy,trade:r.after_trade_count>0,value:u.value_signal,contactable:u.value_signal&&u.contactable,next,continued:next.length>0,
   nearby:u.created_at>=r.invitation_at-DAY&&u.created_at<=r.invitation_at,stored:u.created_at<r.invitation_at-DAY}
 }
 for(const r of all){const f=flag(r);Object.assign(members[id(r.user_id)],{bound_at:r.invitation_at,inviter_id:r.level1_user_id,after_analysis:f.analysis,after_strategy:f.strategy,after_trade_count:r.after_trade_count,continued:f.continued})}
 const rows=chosen.map(flag),fields=['analysis','strategy','used','trade','value','contactable','continued','nearby','stored'],summary={users:put('bound',rows.map(r=>id(r.user_id))),inviters:put('inviters',rows.map(r=>id(r.level1_user_id)))}
 for(const field of fields)summary[field]=put(field,rows.filter(r=>r[field]).map(r=>id(r.user_id)))
 for(const r of rows)Object.assign(members[id(r.user_id)],{bound_at:r.invitation_at,inviter_id:r.level1_user_id,after_analysis:r.analysis,after_strategy:r.strategy,after_trade_count:r.after_trade_count,continued:r.continued})
 const byInviter=new Map()
 for(const r of rows){if(!byInviter.has(r.level1_user_id))byInviter.set(r.level1_user_id,[]);byInviter.get(r.level1_user_id).push(r)}
 const ranking=[...byInviter].map(([uid,rs])=>{const key='inviter:'+uid,row={id:id(uid),inviter_id:uid,list_key:key,users:put(key,rs.map(r=>id(r.user_id))),telegram_bound:members[id(uid)].telegram_bound,email_bound:members[id(uid)].email_bound}
  for(const field of fields)row[field]=put(key+':'+field,rs.filter(r=>r[field]).map(r=>id(r.user_id)))
  row.next_generation=put(key+':next',rs.flatMap(r=>r.next.map(c=>id(c.user_id))));row.unobserved=put(key+':unobserved',rs.filter(r=>!r.used).map(r=>id(r.user_id)));return row
 }).sort((a,b)=>b.users-a.users||a.id.localeCompare(b.id))
 const days=new Map(),weeks=new Map()
 for(const r of rows){const day=new Date(r.invitation_at+25200000).toISOString().slice(0,10),d=Math.floor((r.invitation_at+25200000)/DAY),week=new Date((d-(d+3)%7)*DAY).toISOString().slice(0,10)
  if(!days.has(day))days.set(day,[]);days.get(day).push(r);if(!weeks.has(week))weeks.set(week,[]);weeks.get(week).push(r)
 }
 function bucket(key,label,rs){const v={label,list_key:key,users:put(key,rs.map(r=>id(r.user_id))),inviters:put(key+':inviters',rs.map(r=>id(r.level1_user_id)))};for(const f of ['analysis','strategy','trade','continued'])v[f]=put(key+':'+f,rs.filter(r=>r[f]).map(r=>id(r.user_id)));return v}
 const daily=[...days].sort(([a],[b])=>a.localeCompare(b)).map(([d,rs])=>bucket('day:'+d,d,rs)),cohorts=[...weeks].sort(([a],[b])=>b.localeCompare(a)).map(([d,rs])=>bucket('week:'+d,d,rs))
 const globalParents=new Set(all.map(r=>r.level1_user_id)),globalNext=all.filter(r=>{const p=valid.get(r.level1_user_id);return p&&order(r)>order(p)}),globalReinviters=new Set(globalNext.map(r=>r.level1_user_id))
 const global={registered:put('global:registered',[...accounts.keys()].map(id)),inviters:put('global:inviters',[...globalParents].map(id)),bound:put('global:bound',all.map(r=>id(r.user_id))),reinviters:put('global:reinviters',[...globalReinviters].map(id)),next_generation:put('global:next',globalNext.map(r=>id(r.user_id)))}
 global.simultaneous=put('global:simultaneous',all.filter(r=>valid.has(r.level1_user_id)&&order(valid.get(r.level1_user_id))===order(r)).map(r=>id(r.user_id)))
 global.participation_rate=global.registered?global.inviters/global.registered:null;global.continuation_rate=global.bound?global.reinviters/global.bound:null;global.output=global.bound?global.next_generation/global.bound:null
 const next=rows.flatMap(r=>r.next),nextIds=new Set(next.map(r=>r.user_id));summary.next_generation=put('next',[...nextIds].map(id));summary.next_used=put('next:used',next.filter(r=>flag(r).used).map(r=>id(r.user_id)))
 // Fixed follow-up window retains non-recommenders in the cohort denominator.
 const fixedNext=rows.flatMap(r=>r.next.filter(c=>c.invitation_at<r.invitation_at+windowDays*DAY)),fixedIds=new Set(fixedNext.map(r=>r.user_id))
 const window={days:windowDays,users:summary.users,next_generation:put('window:next',[...fixedIds].map(id)),new_nearby:put('window:nearby',fixedNext.filter(r=>flag(r).nearby).map(r=>id(r.user_id))),pending:put('window:pending',rows.filter(r=>r.invitation_at+windowDays*DAY>factsAsOf).map(r=>id(r.user_id))),coverage:'partial',confirmed_new_registration_rate:null}
 window.observed_output=window.users?window.next_generation/window.users:null
 for(const reason of Object.keys(qualityCounts))put('anomaly:'+reason,anomalies.filter(key=>members[key].reason===reason))
 const matchedAnomalies=anomalies.filter(key=>{const r=members[key];return scope==='all'||r.bound_at>=start&&r.bound_at<end});put('anomalies',matchedAnomalies)
 return {members,lists,payload:{summary,global,window,ranking,daily,cohorts,quality:{counts:qualityCounts,total:anomalies.length,selected:matchedAnomalies.length,scope:'累计全量关系'},start:cohortStart,end:cohortEnd,scope,filter_quality:quality,as_of:asOf,facts_as_of:new Date(factsAsOf).toISOString(),user_pool:'matched_referral_accounts',coverage_reason:'行为历史覆盖未确认；新增绑定不等于新增获客；当前关系不证明历史归因。'}}
}
module.exports={computeReferralInsights,validateReferral}

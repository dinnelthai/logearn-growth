const name=e=>e.raw_name||e.type
const VERSION='referral-registration'
const EFFECTIVE_FROM=Date.parse('2026-10-17T03:50:45Z')
// Use existing referral evidence and session identity; no new web fields required.
function inviteRegistration(users,relations,accounts,b,asOf,{factsAvailable=true,registrationAvailable=true,effectiveFrom=EFFECTIVE_FROM}={}){
 const window=Number(b.hours||24)*3600000,accountMap=new Map(accounts.map(a=>[a.id,a])),codes=new Map(),flows=new Map(),rows=[],lists={}
 for(const a of accounts)if(a.code_key){if(!codes.has(a.code_key))codes.set(a.code_key,[]);codes.get(a.code_key).push(a.id)}
 const relationsByUser=new Map()
 for(const r of relations){if(!relationsByUser.has(r.invitee))relationsByUser.set(r.invitee,[]);relationsByUser.get(r.invitee).push(r)}
 for(const u of users)for(const e of u.events){
  if(e.t>asOf||e.t<effectiveFrom||!['invite_link_visited','page_viewed','first_visit_captured'].includes(name(e))||(!e.referral_key&&name(e)!=='invite_link_visited'))continue
  const id=JSON.stringify([u.id,e.session_id||'',e.anonymous_id||'',e.referral_key])
  if(flows.has(id))continue
  const sameVisit=x=>e.session_id?x.session_id===e.session_id&&(!e.anonymous_id||x.anonymous_id===e.anonymous_id):e.anonymous_id?x.anonymous_id===e.anonymous_id:e.actor_user_id!=null&&String(x.actor_user_id)===String(e.actor_user_id)
  flows.set(id,{id:e.event_id||'entry:'+u.id+':'+e.t,owners:new Set([u.id]),entries:[e],events:u.events.filter(x=>x.t<=asOf&&sameVisit(x)),u})
 }
 for(const f of flows.values()){
  const entries=f.entries
  const entry=entries[0];if(!entry||entry.t<b.start||entry.t>=b.end)continue
  const end=entry.t+window,p=entry.properties,events=f.events.filter(e=>e.t>=entry.t&&e.t<end).sort((a,b)=>a.t-b.t)
  const logins=events.filter(e=>e.actor_user_id!=null&&(name(e)==='login_attempt_finished'&&e.properties?.outcome==='success'||name(e)==='login_succeeded'&&e.properties?.login_type==='manual'))
  const actorIds=new Set(logins.map(e=>String(e.actor_user_id))),login=logins[0],uid=login?String(login.actor_user_id):null
  const account=uid?accountMap.get(uid):null,owners=entry.referral_key?codes.get(entry.referral_key)||[]:[],inviter=owners.length===1?owners[0]:null
  const rs=uid?relationsByUser.get(uid)||[]:[],valid=rs.filter(r=>r.valid&&Number.isFinite(r.bound_at)&&r.bound_at<=asOf)
  let state='login_pending',relation=null
  if(f.owners.size!==1||actorIds.size>1||uid&&f.u.id!=='user:'+uid||new Set(entries.map(e=>e.referral_key||'')).size>1)state='conflict'
  else if(!factsAvailable||!registrationAvailable)state='facts_unavailable'
  else if(!entry.referral_key)state='code_missing'
  else if(owners.length>1)state='code_ambiguous'
  else if(!inviter)state='code_unresolved'
  else if(login){
   if(!account||!Number.isFinite(account.created_at))state='account_pending'
   else if(account.created_at<entry.t)state=events.some(e=>name(e)==='login_succeeded'&&e.properties?.is_new_user===true)?'time_conflict':'existing_account'
   else if(account.created_at>login.t||account.created_at>=end)state='time_conflict'
   else if(inviter===uid)state='self_invite'
   else if(rs.some(r=>r.has_rebinding))state='relation_changed'
   else if(valid.length>1)state='relation_conflict'
   else if(!valid.length)state=rs.length?'relation_invalid':'binding_pending'
   else{
    relation=valid[0]
    if(relation.inviter!==inviter)state='inviter_mismatch'
    else if(relation.bound_at<account.created_at||relation.bound_at<entry.t||relation.bound_at>=end)state='time_conflict'
    else state='registered'
   }
  }
  const link=p.referral_link_id||'unknown',campaign=p.campaign_id??p.activity_id??'unknown'
  const analysis=state==='registered'?f.u.events.find(e=>['chip_analysis_viewed','chip_analysis_drilldown'].includes(name(e))&&e.t>=relation.bound_at&&e.t<end&&e.t<=asOf):null
  rows.push({id:f.id,user_id:f.u.id,source:f.u.source,state,visited_at:entry.t,login_at:login?.t??null,account_created_at:account?.created_at??null,inviter:inviter||'unknown',actual_inviter:valid.length===1?valid[0].inviter:null,link,campaign,relation_id:state==='registered'?relation.id:null,bound_at:state==='registered'?relation.bound_at:null,account_confirmed:!!login,new_account:!!account&&account.created_at>=entry.t&&account.created_at<=login?.t,registered:state==='registered',analysed:!!analysis,analysis_at:analysis?.t??null,mature:asOf>=end})
 }
 // Multiple entry flows that claim the same registration cannot each take credit.
 const candidates=new Map()
 for(const r of rows)if(r.registered){if(!candidates.has(r.user_id))candidates.set(r.user_id,[]);candidates.get(r.user_id).push(r)}
 for(const rs of candidates.values())if(rs.length>1)for(const r of rs)Object.assign(r,{state:'ambiguous',registered:false,analysed:false,relation_id:null,bound_at:null,analysis_at:null})
 const filtered=rows.filter(r=>(!b.inviter||b.inviter==='all'||r.inviter===b.inviter.replace(/^user:/,''))&&(!b.link||b.link==='all'||r.link===b.link)&&(!b.campaign||b.campaign==='all'||r.campaign===b.campaign))
 const put=(key,rs)=>{lists[key]=[...new Set(rs.map(r=>r.user_id))];return lists[key].length}
 const steps=[['visited','邀请入口',()=>true],['account','登录身份确认',r=>r.account_confirmed],['new_account','本次新注册账号',r=>r.new_account],['registered','注册邀请成功',r=>r.registered],['analysed','成功邀请后分析',r=>r.analysed]].map(([key,label,fn])=>{const selected=filtered.filter(fn),list_key='invite:registration:'+key;return {key,label,entries:selected.length,users:put(list_key,selected),list_key}})
 const states=[...new Set(filtered.map(r=>r.state))].map(state=>{const selected=filtered.filter(r=>r.state===state),list_key='invite:registration:state:'+state;return {state,entries:selected.length,users:put(list_key,selected),list_key}})
 const records=filtered.filter(r=>!b.status||b.status==='all'||r.state===b.status).sort((a,b)=>b.visited_at-a.visited_at)
 const mature=filtered.filter(r=>r.mature&&!['conflict','ambiguous','facts_unavailable'].includes(r.state))
 const available=factsAvailable&&registrationAvailable
 return {lists,payload:{version:VERSION,effective_from:effectiveFrom,available:filtered.length>0,facts_available:available,entries:filtered.length,steps,states,success_users:steps[3].users,mature_entries:mature.length,success_rate:available&&mature.length?mature.filter(r=>r.registered).length/mature.length:null,records:records.slice(0,100),record_total:records.length,records_truncated:records.length>100}}
}
module.exports={inviteRegistration,VERSION,EFFECTIVE_FROM}

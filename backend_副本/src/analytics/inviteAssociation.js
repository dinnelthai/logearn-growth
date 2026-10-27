const {createHash}=require('node:crypto')
const name=e=>e.raw_name||e.type
const referralKey=value=>value==null||!String(value).trim()?null:createHash('sha256').update(String(value).trim()).digest('hex')
function referralKeyFromUrl(value){
 if(!value)return null
 try{const url=new URL(value,'https://logearn.com');if(url.hostname!=='logearn.com'&&!url.hostname.endsWith('.logearn.com'))return null;return referralKey(url.searchParams.get('referral'))}catch{return null}
}
// This is evidence association, separate from the explicitly instrumented validation funnel.
function inviteAssociation(users,relations,b,asOf,{factsAvailable=true}={}){
 const window=Number(b.hours||24)*3600000,rows=[],lists={},byUser=new Map(relations.map(r=>['user:'+r.invitee,r]))
 const flowOwners=new Map()
 for(const u of users)for(const e of u.events){const f=e.properties?.invite_flow_id;if(f){if(!flowOwners.has(f))flowOwners.set(f,new Set());flowOwners.get(f).add(u.id)}}
 for(const u of users){
  const events=u.events.filter(e=>e.t<=asOf).slice().sort((a,b)=>a.t-b.t||String(a.event_id||'').localeCompare(String(b.event_id||''))),entries=[],byFlow=new Map(),byPage=new Map()
  for(const e of events){
   const n=name(e),p=e.properties||{}
   if(n!=='invite_link_visited'&&(!['page_viewed','first_visit_captured'].includes(n)||!e.referral_key))continue
   const flow=p.invite_flow_id||null
   // Repeated explicit flow events are one entry. Historical first-visit + page-view
   // reports in the same tab at entry are two observations, not two visits.
   let existing=flow?byFlow.get(flow):null
   const pageKey=p.page_visit_id&&JSON.stringify([e.anonymous_id,e.session_id,p.page_visit_id])
   if(!existing&&pageKey){const page=byPage.get(pageKey);if(page&&!(flow&&page.flow&&flow!==page.flow)&&!(page.key&&e.referral_key&&page.key!==e.referral_key))existing=page}
   if(!existing)for(let i=entries.length-1;i>=0;i--){const r=entries[i];if(e.t-r.e.t>30000)break;if(!flow&&!r.flow&&e.session_id&&r.e.session_id===e.session_id&&r.key===e.referral_key&&[name(r.e),n].includes('first_visit_captured')){existing=r;break}}
   if(existing){if(e.referral_key&&!existing.key)existing.key=e.referral_key;if(flow){existing.flow=flow;byFlow.set(flow,existing)}continue}
   const record={e,flow,key:e.referral_key||null};entries.push(record);if(flow)byFlow.set(flow,record);if(pageKey)byPage.set(pageKey,record)
  }
  const relation=byUser.get(u.id),peers=relation?entries.filter(x=>x.e.t<=relation.bound_at&&relation.bound_at<x.e.t+window):[],peerSet=new Set(peers)
  for(const entry of entries){
   const e=entry.e,p=e.properties||{};if(e.t<b.start||e.t>=b.end)continue
   const end=e.t+window,actor=e.actor_user_id==null?null:String(e.actor_user_id)
   const actorMatches=id=>id!=null&&u.id==='user:'+String(id)
   const login=events.find(x=>x.t>=e.t&&x.t<end&&((name(x)==='login_succeeded')||(name(x)==='login_attempt_finished'&&x.properties?.outcome==='success'))&&actorMatches(x.actor_user_id)&&(
    entry.flow?x.properties?.invite_flow_id===entry.flow:!!e.anonymous_id&&x.anonymous_id===e.anonymous_id))
   const account=actorMatches(actor)||!!login
   const reusedFlow=entry.flow&&flowOwners.get(entry.flow)?.size>1
   // With no backend flow key, two candidate entries cannot be disambiguated by proximity.
   const ambiguous=peers.length>1&&peerSet.has(entry)
   const inWindow=relation&&relation.bound_at>=e.t&&relation.bound_at<end
   const codeMatches=!!entry.key&&entry.key===relation?.referral_key
   const changed=!!relation?.has_rebinding
   const confirmed=!!(factsAvailable&&account&&inWindow&&codeMatches&&!ambiguous&&!changed&&!reusedFlow)
   const analysis=confirmed?events.find(x=>['chip_analysis_viewed','chip_analysis_drilldown'].includes(name(x))&&x.t>=relation.bound_at&&x.t<end):null
   const state=reusedFlow?'conflict':changed?'relation_changed':ambiguous?'ambiguous':confirmed?'matched':relation&&relation.bound_at<e.t?'preexisting':account&&inWindow&&!entry.key?'identity_only':account&&inWindow&&entry.key&&!codeMatches?'code_mismatch':!factsAvailable?'facts_unavailable':account?'account_only':'unresolved'
   const inviter=relation?.inviter||'unknown',link=p.referral_link_id||'unknown',campaign=p.campaign_id??p.activity_id??'unknown'
   if(b.inviter&&b.inviter!=='all'&&inviter!==b.inviter.replace(/^user:/,''))continue
   if(b.link&&b.link!=='all'&&link!==b.link||b.campaign&&b.campaign!=='all'&&campaign!==b.campaign)continue
   rows.push({id:entry.flow||e.event_id||'entry:'+u.id+':'+e.t,user_id:u.id,source:u.source,visited_at:e.t,login_at:login?.t??null,account_confirmed:account,account_evidence:actorMatches(actor)?'already_logged_in':login?entry.flow?'flow_login':'anonymous_login':'unknown',entry_evidence:entry.flow?'flow_event':'historical_referral_url',state,inviter,link,campaign,relation_id:confirmed?relation.id:null,bound_at:confirmed?relation.bound_at:null,relation_observed_at:relation?.bound_at??null,bound:confirmed,analysed:!!analysis,analysis_at:analysis?.t??null,mature:asOf>=end})
  }
 }
 const put=(key,rs)=>{lists[key]=[...new Set(rs.map(r=>r.user_id))];return lists[key].length}
 const steps=[['visited','邀请入口',()=>true],['account','身份确认',r=>r.account_confirmed],['bound','邀请码与关系匹配',r=>r.bound],['analysed','匹配绑定后分析',r=>r.analysed]].map(([key,label,filter])=>{const selected=rows.filter(filter),list_key='invite:association:'+key;return {key,label,entries:selected.length,users:put(list_key,selected),list_key}})
 const states=[...new Set(rows.map(r=>r.state))].map(state=>{const selected=rows.filter(r=>r.state===state),list_key='invite:association:state:'+state;return {state,entries:selected.length,users:put(list_key,selected),list_key}})
 const records=rows.filter(r=>!b.status||b.status==='all'||r.state===b.status).sort((a,b)=>b.visited_at-a.visited_at)
 return {lists,payload:{available:rows.length>0,steps,states,entries:rows.length,records:records.slice(0,100),record_total:records.length,records_truncated:records.length>100}}
}
module.exports={inviteAssociation,referralKey,referralKeyFromUrl}

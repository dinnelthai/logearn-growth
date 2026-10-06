export const SHARE_TYPES={invite:'主动邀请按钮',signal:'信号分享',multiplier:'倍数分享'}
const DAY=86400000
/** Independent period activity counts and first-bound invitation cohorts, joined by link ID. */
export function computeSharing(users,referrals,{startAt,endAt,asOf,sourceFilter='all'}) {
  const byId=new Map(users.map(u=>[u.id,u])),links=new Map(),seen=new Set()
  const linkFor=(id,inviter,type)=>{
    if(!links.has(id))links.set(id,{id,inviter:inviter??null,type:SHARE_TYPES[type]?type:null,clicks:0,shares:0,sharers:new Set(),visitors:new Set(),bound:new Set(),active:new Set(),pending:new Set()})
    const row=links.get(id);if(!row.inviter&&inviter)row.inviter=inviter;if(!row.type&&SHARE_TYPES[type])row.type=type;return row
  }
  const activity={clicks:0,shares:0,sharers:new Set(),visitors:new Set()}
  for(const u of users)for(const e of u.events) {
    if(!['share_click','share_complete','invite_visit'].includes(e.type)||!Number.isFinite(e.t)||e.t<startAt||e.t>=endAt||e.t>asOf||(sourceFilter!=='all'&&u.source!==sourceFilter))continue
    const eid=e._raw_event_id;if(eid&&seen.has(eid))continue;if(eid)seen.add(eid)
    const row=e.referral_link_id?linkFor(e.referral_link_id,e.inviter_user_id,e.share_type):null
    if(e.type==='share_click'){activity.clicks++;if(row)row.clicks++}
    if(e.type==='share_complete'){activity.shares++;activity.sharers.add(u.id);if(row){row.shares++;row.sharers.add(u.id)}}
    if(e.type==='invite_visit'){activity.visitors.add(u.id);if(row)row.visitors.add(u.id)}
  }
  const earliest=new Map()
  for(const r of referrals??[]) {
    const t=typeof r.bound_at==='number'?r.bound_at:Date.parse(r.bound_at)
    if(!Number.isFinite(t)||t>asOf||r.inviter_user_id===r.invitee_user_id)continue
    if(!earliest.has(String(r.invitee_user_id))||t<earliest.get(String(r.invitee_user_id)).t)earliest.set(String(r.invitee_user_id),{...r,t})
  }
  let unattributed=0
  for(const r of earliest.values()) {
    const u=byId.get('user:'+r.invitee_user_id)
    if(r.t<startAt||r.t>=endAt||(sourceFilter!=='all'&&u?.source!==sourceFilter))continue
    const row=linkFor(r.referral_link_id||'unattributed',r.referral_link_id?r.inviter_user_id:null,r.share_type)
    if(!r.referral_link_id)unattributed++
    const key=String(r.invitee_user_id);row.bound.add(key)
    if(u?.events.some(e=>e.type==='chip'&&e.t>r.t&&e.t<=r.t+7*DAY&&e.t<=asOf))row.active.add(key)
    else if(r.t+7*DAY>asOf)row.pending.add(key)
  }
  const rows=[...links.values()].map(r=>({...r,sharers:r.sharers.size,visitors:r.visitors.size,bound:r.bound.size,active:r.active.size,pending:r.pending.size})).sort((a,b)=>b.bound-a.bound||b.active-a.active||b.visitors-a.visitors||a.id.localeCompare(b.id))
  const types=Object.keys(SHARE_TYPES).map(type=>{const matching=rows.filter(r=>r.type===type);return{type,...Object.fromEntries(['clicks','shares','visitors','bound','active'].map(k=>[k,matching.reduce((n,r)=>n+r[k],0)]))}})
  return {...activity,sharers:activity.sharers.size,visitors:activity.visitors.size,links:rows,types,unattributed}
}

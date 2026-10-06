/** Deterministic referral relationships using existing mock users and real event times. */
export function createMockReferrals(users) {
  const candidates=users.filter(u=>u.source!=='邀请'&&u.events.length)
  let index=0
  return users.filter(u=>u.source==='邀请'&&u.events.length).flatMap(invitee=>{
    const boundAt=invitee.events[0].t-60000
    const eligible=candidates.filter(u=>u.id!==invitee.id&&Math.min(...u.events.map(e=>e.t))<boundAt)
    if(!eligible.length)return []
    const inviter=eligible[Number(invitee.id.replace(/\D/g,''))%Math.min(eligible.length,24)]
    const share_type=['invite','signal','multiplier'][index++%3],referral_link_id='link-'+inviter.id.replace(/^user:/,'')+'-'+share_type
    const context={referral_link_id,share_type,inviter_user_id:inviter.id.replace(/^user:/,''),share_method:share_type==='invite'?'copy_link':'share_card',content_id:share_type==='invite'?null:'content-'+index}
    const session_id='share-session-'+index
    inviter.events.push({type:'share_click',t:boundAt-120000,...context,session_id},{type:'share_complete',t:boundAt-110000,...context,session_id})
    if(index%4===0)inviter.events.push({type:'share_click',t:boundAt-90000,...context,session_id})
    invitee.events.push({type:'invite_visit',t:boundAt-30000,...context,session_id:invitee.events[0].session_id})
    if(index%3===0){const visitor=candidates.find(u=>u.id!==inviter.id&&Math.min(...u.events.map(e=>e.t))<boundAt);if(visitor)visitor.events.push({type:'invite_visit',t:boundAt-20000,...context,session_id:'link-visit-'+index})}
    return [{referral_link_id,share_type,inviter_user_id:inviter.id.replace(/^user:/,''),invitee_user_id:invitee.id.replace(/^user:/,''),bound_at:new Date(boundAt).toISOString()}]
  })
}

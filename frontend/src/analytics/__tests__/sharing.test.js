import {describe,it,expect} from 'vitest'
import {computeSharing} from '../sharing.js'
import {normalizeApiResponse} from '../normalize.js'
const DAY=86400000,opts={startAt:DAY,endAt:3*DAY,asOf:4*DAY}
const context={referral_link_id:'link-1',inviter_user_id:'a',share_type:'signal'}
describe('share and referral attribution',()=>{
 it('deduplicates visitors and first bindings, preserves pending and unattributed users',()=>{
  const users=[{id:'user:a',source:'SEO',events:[{type:'share_click',t:DAY+1,...context},{type:'share_complete',t:DAY+2,...context}]},{id:'user:b',source:'邀请',events:[{type:'invite_visit',t:DAY+3,...context},{type:'invite_visit',t:DAY+4,...context},{type:'chip',t:2*DAY}]},{id:'user:c',source:'邀请',events:[]}]
  const referrals=[{inviter_user_id:'a',invitee_user_id:'b',bound_at:DAY+5,...context},{inviter_user_id:'z',invitee_user_id:'b',bound_at:DAY+6,referral_link_id:'link-2'},{inviter_user_id:'a',invitee_user_id:'c',bound_at:DAY+7}]
  const r=computeSharing(users,referrals,opts)
  expect(r.visitors).toBe(1);expect(r.shares).toBe(1);expect(r.unattributed).toBe(1)
  expect(r.links.find(l=>l.id==='link-1')).toMatchObject({bound:1,active:1,pending:0,visitors:1})
  expect(r.links.find(l=>l.id==='unattributed')).toMatchObject({bound:1,pending:1})
  expect(r.links.some(l=>l.id==='link-2')).toBe(false)
 })
 it('does not reattribute historical invitees and excludes future events',()=>{
  const users=[{id:'user:b',source:'邀请',events:[{type:'invite_visit',t:5*DAY,...context}]}]
  const referrals=[{inviter_user_id:'a',invitee_user_id:'b',bound_at:0,referral_link_id:'old'},{inviter_user_id:'c',invitee_user_id:'b',bound_at:2*DAY,...context}]
  const r=computeSharing(users,referrals,opts);expect(r.links).toEqual([]);expect(r.visitors).toBe(0)
 })
 it('ingests real share events with link and content context',()=>{
  const r=normalizeApiResponse({events:[{event_id:'e1',event_name:'share_completed',user_id:'a',occurred_at:new Date(DAY+1).toISOString(),properties:{...context,content_id:'signal-1',share_method:'copy_link'}}],users:[],referrals:[],startAt:0,asOf:4*DAY})
  expect(r.users[0].events[0]).toMatchObject({type:'share_complete',referral_link_id:'link-1',content_id:'signal-1',share_method:'copy_link'})
 })
})

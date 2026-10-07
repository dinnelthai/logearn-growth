import {it,expect} from 'vitest'
import {normalizeApiResponse,resolveKey} from '../normalize.js'
import {validateEvents,validateUsers,validateReferrals} from '../inputQuality.js'
import {sourceCoverage,periodCoverage} from '../coverage.js'
const base=Date.parse('2026-10-01T00:00:00Z'),asOf=base+86400000
const event=(id,user,anonymous,t=base)=>({event_id:id,event_name:'login_succeeded',user_id:user,anonymous_id:anonymous,occurred_at:new Date(t).toISOString(),properties:{}})
const normalize=events=>normalizeApiResponse({events,users:[],startAt:base,asOf})
it('future/invalid/unknown events cannot stitch an observed anonymous identity',()=>{
 const anonymous={...event('anon',null,'a'),event_name:'chip_analysis_viewed'}
 for(const bad of [event('future','u','a',asOf+1),{...event('time','u','a'),occurred_at:'invalid'},{...event('unknown','u','a'),event_name:'invented'},{...event('numeric-string','u','a'),client_ts:String(base)}]){
  const data=normalize([anonymous,bad]);expect(data.users.map(u=>u.id)).toEqual(['anonymous:a']);expect(data.inputQuality.events.excluded).toBe(1)
 }
})
it('multiple owners retain anonymous events separately regardless of order, preserving explicit users',()=>{
 const events=[{...event('anon',null,'a'),event_name:'chip_analysis_viewed'},event('u1','u1','a',base+1),event('u2','u2','a',base+2)]
 for(const rows of [events,[...events].reverse()]){
  const data=normalize(rows);expect(data.users.map(u=>u.id).sort()).toEqual(['anonymous:a','user:u1','user:u2'])
  expect(data.users.find(u=>u.id==='anonymous:a').events[0].type).toBe('chip')
  expect(data.inputQuality.identity).toMatchObject({mergedAnonymousIds:0,conflictedAnonymousIds:1,unmergedAnonymousEvents:1,conflicts:[{anonymous_id:'a',user_ids:['u1','u2']}]})
 }
 expect(normalize(events.slice(0,2)).users.map(u=>u.id)).toEqual(['user:u1'])
})
it('valid events survive invalid duplicates; conflicting event IDs are quarantined before identity mapping',()=>{
 const good=event('same','u1','a'),bad={...good,occurred_at:'invalid',user_id:'bad'}
 expect(normalize([bad,good]).users.map(u=>u.id)).toEqual(['user:u1'])
 const conflicting=normalize([good,{...good,user_id:'u2'}]);expect(conflicting.users).toEqual([]);expect(conflicting.inputQuality.events).toMatchObject({conflictingRows:2,conflictingIds:1})
 const duplicate=validateEvents([good,{...good,properties:{}}],asOf);expect(duplicate.quality.duplicates).toBe(1)
})
it('filters malformed records and preserves unkeyed legacy order with explicit dedup limitations',()=>{
 const legacy={...event(null,'u',null),event_name:'chip_analysis_viewed'}
 const rows=[null,{...event('id',{},'a')},{...event('missing',null,null)},{...event('props','u',null),properties:[]},legacy,event('keyed','u',null)]
 const r=validateEvents(rows,asOf);expect(r.events.map(e=>e.event_id)).toEqual([null,'keyed'])
 expect(r.quality).toMatchObject({input:6,accepted:2,excluded:4,invalidRecord:1,invalidIdentity:1,missingIdentity:1,invalidContext:1,missingEventId:1})
 expect(resolveKey({},null)).toBeNull();expect(()=>validateEvents({},asOf)).toThrow('array')
})
it('invalid metadata cannot create user:undefined or grant bindings; within-source conflicts stay unknown',()=>{
 const rows=[null,{first_source:'X'},{user_id:'u',telegram_bound:'true',email_bound:false,first_analysis_at:new Date(asOf+1).toISOString(),first_source:[],preferred_language:7}]
 const r=validateUsers(rows,asOf);expect(r.users).toEqual([{user_id:'u',telegram_bound:null,email_bound:false,first_analysis_at:null,first_source:null,preferred_language:null}]);expect(r.quality).toMatchObject({invalidId:2,invalidFields:4})
 expect(validateUsers([{user_id:'u',preferred_language:'en'},{user_id:'u',preferred_language:'zh'}],asOf).quality.conflictingRows).toBe(2)
 const data=normalizeApiResponse({events:[],users:rows,startAt:base,asOf});expect(data.users.map(u=>u.id)).toEqual(['user:u']);expect(data.users[0].telegram_bound).toBeNull()
})
it('referral consumers receive the same validated first binding and unresolved ties do not pick an inviter',()=>{
 const row={inviter_user_id:'a',invitee_user_id:'b',bound_at:new Date(base).toISOString()}
 const r=validateReferrals([row,{...row},{...row,bound_at:new Date(base+1).toISOString()},null,{...row,invitee_user_id:'a'},{...row,bound_at:'invalid'},{...row,bound_at:new Date(asOf+1).toISOString()}],asOf)
 expect(r.referrals).toEqual([row]);expect(r.quality).toMatchObject({input:7,accepted:1,excluded:6,duplicates:1,superseded:1,invalidId:1,selfInvite:1,invalidTime:1,future:1})
 expect(validateReferrals([row,{...row,inviter_user_id:'other'}],asOf)).toMatchObject({referrals:[],quality:{conflictingInvitees:1,conflictingRows:2}})
 expect(validateReferrals(null,asOf).referrals).toBeNull()
})
it('rejects impossible snapshot ranges and malformed coverage never claims a partial valid range',()=>{
 expect(()=>normalizeApiResponse({events:[],users:[],startAt:asOf+1,asOf})).toThrow('range')
 expect(sourceCoverage(null,'events',asOf)).toBeNull();expect(periodCoverage({start:'invalid',end:asOf},base,asOf)).toBe('unknown')
})

it('typed optional context becomes unknown instead of leaking objects into attribution and correlation',()=>{
 const e={...event('typed','u','a'),chain:1,first_entry_source:[],properties:{strategy_run_id:{id:'fake'},token_visit_id:7,first_visit_at:base}}
 const r=validateEvents([e],asOf);expect(r.events[0]).toMatchObject({chain:'1',first_entry_source:null,properties:{strategy_run_id:null,token_visit_id:null,first_visit_at:new Date(base).toISOString()}});expect(r.quality.invalidFields).toBe(3)
 expect(validateEvents([{...e,event_name:['login_succeeded']}],asOf).quality.unknownType).toBe(1)
})

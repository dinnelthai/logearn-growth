import {RAW_EVENT_TYPES,MODULES} from './events.js'
export const validIdentity=value=>typeof value==='string'&&value.trim().length>0
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)
const canonical=value=>JSON.stringify(sort(value))
function sort(value){if(Array.isArray(value))return value.map(sort);if(object(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value}
export function eventTimestamp(event){return event.client_ts!=null?(typeof event.client_ts==='number'?event.client_ts:NaN):(typeof event.occurred_at==='string'?Date.parse(event.occurred_at):NaN)}
export function validateEvents(input,asOf){
 if(!Array.isArray(input))throw new TypeError('Events must be an array')
 const quality={input:input.length,accepted:0,invalidRecord:0,invalidIdentity:0,missingIdentity:0,invalidContext:0,unknownType:0,invalidTime:0,future:0,duplicates:0,conflictingRows:0,conflictingIds:0,missingEventId:0,invalidFields:0,excluded:0}
 const groups=new Map(),unkeyed=[],positions=new Map()
 for(const raw of input){
  if(!object(raw)){quality.invalidRecord++;continue}
  if(['user_id','anonymous_id','event_id'].some(k=>raw[k]!=null&&raw[k]!==''&&!validIdentity(raw[k]))){quality.invalidIdentity++;continue}
  if(!validIdentity(raw.user_id)&&!validIdentity(raw.anonymous_id)){quality.missingIdentity++;continue}
  if((raw.properties!=null&&!object(raw.properties))||(raw.session_id!=null&&!validIdentity(raw.session_id))){quality.invalidContext++;continue}
  if(typeof raw.event_name!=='string'||!Object.hasOwn(RAW_EVENT_TYPES,raw.event_name)||(raw.event_name==='module_viewed'&&(typeof raw.properties?.module!=='string'||!Object.hasOwn(MODULES,raw.properties.module)))){quality.unknownType++;continue}
  const t=eventTimestamp(raw)
  if(!Number.isFinite(t)){quality.invalidTime++;continue}
  if(t>asOf){quality.future++;continue}
  const clean={...raw,properties:{...(raw.properties??{})}}
  positions.set(clean,positions.size)
  const fields=['first_entry_source','session_entry_source','referrer','first_referrer_url','first_landing_url','trade_id','trade_attempt_id','strategy_type','strategy_run_id','result_id','token_address','token_visit_id','entry_module','module','referral_link_id','inviter_user_id','share_type','share_method','content_id','item_id']
  for(const target of [clean,clean.properties]){
    if(target.first_visit_at!=null){const t=typeof target.first_visit_at==='number'?target.first_visit_at:typeof target.first_visit_at==='string'?Date.parse(target.first_visit_at):NaN;if(Number.isFinite(t)&&t<=asOf)target.first_visit_at=new Date(t).toISOString();else{target.first_visit_at=null;quality.invalidFields++}}
    for(const key of fields)if(target[key]!=null&&typeof target[key]!=='string'){target[key]=null;quality.invalidFields++}
    if(target.chain!=null){if(typeof target.chain==='number'&&Number.isFinite(target.chain))target.chain=String(target.chain);else if(typeof target.chain!=='string'){target.chain=null;quality.invalidFields++}}
  }
  if(!validIdentity(raw.event_id)){unkeyed.push(clean);continue}
  if(!groups.has(raw.event_id))groups.set(raw.event_id,[])
  groups.get(raw.event_id).push(clean)
 }
 const events=[...unkeyed]
 for(const group of groups.values()){
  if(new Set(group.map(canonical)).size>1){quality.conflictingIds++;quality.conflictingRows+=group.length;continue}
  events.push(group[0]);quality.duplicates+=group.length-1
 }
 events.sort((a,b)=>positions.get(a)-positions.get(b))
 quality.accepted=events.length;quality.missingEventId=unkeyed.length;quality.excluded=quality.input-quality.accepted
 return {events,quality}
}
/** Conflicted anonymous keys never choose an arbitrary account. */
export function resolveIdentities(events){
 const owners=new Map()
 for(const e of events)if(validIdentity(e.user_id)&&validIdentity(e.anonymous_id)){
  if(!owners.has(e.anonymous_id))owners.set(e.anonymous_id,new Set())
  owners.get(e.anonymous_id).add(e.user_id)
 }
 const map=new Map(),conflicts=[]
 for(const [anonymousId,ids] of owners){
  if(ids.size===1)map.set(`anonymous:${anonymousId}`,`user:${[...ids][0]}`)
  else conflicts.push({anonymous_id:anonymousId,user_ids:[...ids].sort()})
 }
 const conflicted=new Set(conflicts.map(c=>c.anonymous_id))
 return {map,quality:{mergedAnonymousIds:map.size,conflicts:conflicts.sort((a,b)=>a.anonymous_id.localeCompare(b.anonymous_id)),conflictedAnonymousIds:conflicts.length,unmergedAnonymousEvents:events.filter(e=>!validIdentity(e.user_id)&&conflicted.has(e.anonymous_id)).length}}
}
/** Invalid metadata fields become unknown; never invent a registered account ID. */
export function validateUsers(input,asOf){
 if(input==null)return {users:[],quality:null}
 if(!Array.isArray(input))throw new TypeError('Users must be an array')
 const quality={input:input.length,accepted:0,invalidId:0,duplicates:0,conflictingRows:0,conflictingIds:0,invalidFields:0,excluded:0},groups=new Map()
 for(const raw of input){
  if(!object(raw)||!validIdentity(raw.user_id)){quality.invalidId++;continue}
  const row={...raw}
  for(const k of ['created_at','first_analysis_at'])if(row[k]!=null){const t=typeof row[k]==='number'?row[k]:typeof row[k]==='string'?Date.parse(row[k]):NaN;if(!Number.isFinite(t)||t>asOf){row[k]=null;quality.invalidFields++}}
  for(const k of ['first_source','preferred_language','first_analysis_entry_module'])if(row[k]!=null&&typeof row[k]!=='string'){row[k]=null;quality.invalidFields++}
  for(const k of ['telegram_bound','email_bound','is_partner'])if(row[k]!=null&&typeof row[k]!=='boolean'){row[k]=null;quality.invalidFields++}
  if(!groups.has(row.user_id))groups.set(row.user_id,[])
  groups.get(row.user_id).push(row)
 }
 const users=[]
 for(const group of groups.values()){
  if(new Set(group.map(canonical)).size>1){quality.conflictingIds++;quality.conflictingRows+=group.length;continue}
  users.push(group[0]);quality.duplicates+=group.length-1
 }
 quality.accepted=users.length;quality.excluded=quality.input-quality.accepted
 return {users,quality}
}

export function validateReferrals(input,asOf){
 if(input==null)return {referrals:null,quality:null}
 if(!Array.isArray(input))throw new TypeError('Referrals must be an array')
 const quality={input:input.length,accepted:0,invalidId:0,selfInvite:0,invalidTime:0,future:0,duplicates:0,superseded:0,conflictingRows:0,conflictingInvitees:0,invalidFields:0,excluded:0},groups=new Map()
 for(const raw of input){
  if(!object(raw)||!validIdentity(raw.inviter_user_id)||!validIdentity(raw.invitee_user_id)){quality.invalidId++;continue}
  if(raw.inviter_user_id===raw.invitee_user_id){quality.selfInvite++;continue}
  const t=typeof raw.bound_at==='number'?raw.bound_at:typeof raw.bound_at==='string'?Date.parse(raw.bound_at):NaN
  if(!Number.isFinite(t)){quality.invalidTime++;continue}
  if(t>asOf){quality.future++;continue}
  const row={...raw,bound_at:new Date(t).toISOString()}
  for(const k of ['referral_link_id','share_type'])if(row[k]!=null&&!validIdentity(row[k])){row[k]=null;quality.invalidFields++}
  if(!groups.has(row.invitee_user_id))groups.set(row.invitee_user_id,[])
  groups.get(row.invitee_user_id).push(row)
 }
 const referrals=[]
 for(const group of groups.values()){
  group.sort((a,b)=>Date.parse(a.bound_at)-Date.parse(b.bound_at))
  const firstTime=group[0].bound_at,earliest=group.filter(r=>r.bound_at===firstTime)
  // Contradictory first binding facts cannot be resolved by array order.
  if(new Set(earliest.map(canonical)).size>1){quality.conflictingInvitees++;quality.conflictingRows+=group.length;continue}
  const seen=new Set([canonical(group[0])]);referrals.push(group[0])
  for(const row of group.slice(1)){const key=canonical(row);if(seen.has(key))quality.duplicates++;else{quality.superseded++;seen.add(key)}}
 }
 quality.accepted=referrals.length;quality.excluded=quality.input-quality.accepted
 return {referrals,quality}
}

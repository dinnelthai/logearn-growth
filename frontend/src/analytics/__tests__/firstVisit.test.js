import {describe,it,expect} from 'vitest'
import {createTracker} from '../../tracking/client.js'
import {cleanEntryUrl} from '../../tracking/firstVisit.js'
import {normalizeApiResponse} from '../normalize.js'
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}}
function fixture(){let t=Date.parse('2026-10-01T00:00:00Z'),id=0;const events=[],options={persistentStorage:memory(),storage:memory(),send:e=>events.push(e),now:()=>t++,uuid:()=>`id-${++id}`};return {events,options,recreate:()=>createTracker(options),advance:()=>{t+=31*60000}}}
const input={referrer:'https://x.com/post/1?secret=abc#fragment',landingUrl:'https://app.example.com/analysis?token=secret#auth'}
describe('first external entry capture',()=>{
 it('keeps sanitized first entry through refresh, new session and login',async()=>{
  const f=fixture(),entry=await f.recreate().captureFirstVisit(input)
  expect(entry.properties).toEqual({first_referrer_url:'https://x.com/post/1',first_landing_url:'https://app.example.com/analysis',first_visit_at:entry.occurred_at})
  f.advance();const fresh=f.recreate()
  expect(await fresh.captureFirstVisit({...input,referrer:'https://t.me/group'})).toBeNull()
  fresh.identify('u1');const login=await fresh.track('login_succeeded')
  expect(login.anonymous_id).toBe(entry.anonymous_id);expect(login.session_id).not.toBe(entry.session_id)
  const data=normalizeApiResponse({events:f.events,users:[],referrals:[],timezone:'Asia/Bangkok',startAt:0,asOf:Date.parse(login.occurred_at)+1})
  expect(data.users).toHaveLength(1);expect(data.users[0].id).toBe('user:u1')
  expect(data.users[0].channelFact.referrer).toBe('https://x.com/post/1')
 })
 it('locks empty and non-HTTP referrers as unknown',async()=>{
  for(const referrer of ['', 'android-app://com.app']){const f=fixture();expect((await f.recreate().captureFirstVisit({...input,referrer})).properties.first_referrer_url).toBeNull();expect(await f.recreate().captureFirstVisit(input)).toBeNull();expect(f.events).toHaveLength(1)}
 })
 it('skips own hosts and only explicitly configured subdomains',async()=>{
  const f=fixture(),tracker=createTracker({...f.options,ownHosts:['www.example.com'],subdomainRoots:['example.com']})
  for(const referrer of ['https://app.example.com/a','https://www.example.com/','https://docs.example.com/'])expect(await tracker.captureFirstVisit({...input,referrer})).toBeNull()
  expect(f.events).toHaveLength(0)
  expect(await tracker.captureFirstVisit({...input,referrer:'https://example.com.evil.test/'})).not.toBeNull()
  expect(await fixture().recreate().captureFirstVisit({...input,referrer:'https://docs.example.com/'})).not.toBeNull()
 })
 it('retries failed sends with original ID, time, URL and identity',async()=>{
  const f=fixture(),attempts=[],options={...f.options,send:e=>{attempts.push(structuredClone(e));e.properties.first_referrer_url='mutated';if(attempts.length===1)throw Error('offline')}}
  await expect(createTracker(options).captureFirstVisit(input)).rejects.toThrow('offline')
  f.advance();const fresh=createTracker(options);fresh.identify('u2');await fresh.captureFirstVisit({...input,referrer:'https://t.me/'})
  expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual(attempts[0])
 })
 it('deduplicates concurrent calls in memory when storage is unavailable',async()=>{
  const f=fixture(),denied={getItem(){throw Error('denied')},setItem(){throw Error('denied')}},tracker=createTracker({...f.options,persistentStorage:denied,storage:denied})
  const a=tracker.captureFirstVisit(input),b=tracker.captureFirstVisit(input);expect(a).toBe(b);await a
  expect(await tracker.captureFirstVisit(input)).toBeNull();expect(f.events).toHaveLength(1)
 })
 it('keeps anonymous identity across tabs with separate sessions',async()=>{
  const f=fixture(),first=await f.recreate().captureFirstVisit(input),tab=createTracker({...f.options,storage:memory()}),next=await tab.track('login_succeeded')
  expect(next.anonymous_id).toBe(first.anonymous_id);expect(next.session_id).not.toBe(first.session_id);expect(await tab.captureFirstVisit(input)).toBeNull()
 })
 it('cleans credentials and rejects malformed landing before saving',async()=>{
  expect(cleanEntryUrl('https://user:password@x.com/p?email=a#key')).toBe('https://x.com/p')
  const f=fixture(),tracker=f.recreate();await expect(tracker.captureFirstVisit({...input,landingUrl:'file:///tmp/file'})).rejects.toThrow('HTTP(S)');expect(f.events).toHaveLength(0);expect(await tracker.captureFirstVisit(input)).not.toBeNull()
 })
})

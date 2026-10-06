import {describe,it,expect,vi,afterEach} from 'vitest'
import {loadConfig,saveConfig} from '../configStorage.js'
import {computeRetention} from '../retention.js'
import {computeReferral} from '../referral.js'
import {fetchAllAnalyticsData} from '../../api/analytics.js'
const DAY=86400000,BASE=Date.parse('2026-09-01T00:00:00+07:00')
const config={mode:'retention',steps:['login','token','ai','chip'],range:14,hours:24,source:'all',strategy:'all',initial:'chip',returning:'chip'}
afterEach(()=>vi.unstubAllGlobals())
describe('persistent config',()=>{
 it('restores saved settings and rejects corrupt or outdated values',()=>{
  let value=null;const storage={getItem:()=>value,setItem:(_,v)=>value=v}
  saveConfig(storage,config);expect(loadConfig(storage)).toEqual(config)
  value='invalid';expect(loadConfig(storage)).toBeNull()
  value=JSON.stringify({...config,steps:['removed-event']});expect(loadConfig(storage)).toBeNull()
 })
 it('reports storage failure without claiming a successful save',()=>{
  expect(()=>saveConfig({setItem:()=>{throw Error('blocked')}},config)).toThrow('blocked')
 })
})
describe('shared calendar-day retention',()=>{
 it('does not re-enroll historical users as newly activated',()=>{
  const users=[{id:'u',events:[{type:'chip',t:BASE-DAY},{type:'chip',t:BASE+1000}]}]
  expect(computeRetention(users,{startAt:BASE,endAt:BASE+DAY,asOf:BASE+3*DAY}).daily).toEqual([])
 })
 it('starts D1 at local midnight and flags the incomplete observation day',()=>{
  const users=[{id:'u',events:[{type:'chip',t:BASE+23*3600000},{type:'chip',t:BASE+DAY+1000}]}]
  const period=computeRetention(users,{startAt:BASE,endAt:BASE+DAY,asOf:BASE+DAY+2000}).daily[0].periods[0]
  expect(period.retained_users).toBe(1);expect(period.complete).toBe(false)
 })
})
describe('referral cohorts',()=>{
 it('uses the earliest binding even if records arrive out of order',()=>{
  const refs=[{inviter_user_id:'b',invitee_user_id:'c',bound_at:BASE+DAY},{inviter_user_id:'a',invitee_user_id:'c',bound_at:BASE-DAY}]
  expect(computeReferral([],refs,{startAt:BASE,endAt:BASE+2*DAY}).bound_invitees).toBe(0)
 })
 it('ignores future activation and counts pending observation windows',()=>{
  const refs=[{inviter_user_id:'a',invitee_user_id:'c',bound_at:BASE}]
  const users=[{id:'user:c',source:'SEO',events:[{type:'chip',t:BASE+3*DAY}]}]
  const r=computeReferral(users,refs,{startAt:BASE,endAt:BASE+DAY,asOf:BASE+DAY})
  expect(r.activated_invitees).toBe(0);expect(r.pending_invitees).toBe(1)
 })
})
describe('API availability',()=>{
 it('keeps successful core data when optional endpoints fail',async()=>{
  vi.stubGlobal('fetch',vi.fn(async url=>({ok:!url.includes('/trades')&&!url.includes('/referrals'),status:404,statusText:'Not Found',json:async()=>url.includes('/events')?{events:[]}:{users:[]}})))
  const result=await fetchAllAnalyticsData(BASE,BASE+DAY)
  expect(result.trades).toBeNull();expect(result.referrals).toBeNull();expect(result.availability.trades).toBe('error')
 })
 it('rejects malformed core data rather than silently turning it into zero',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({})})))
  await expect(fetchAllAnalyticsData(BASE,BASE+DAY)).rejects.toThrow('格式无效')
 })
})

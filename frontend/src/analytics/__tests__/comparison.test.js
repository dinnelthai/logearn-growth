import {describe,it,expect} from 'vitest'
import {computeComparison,entryFor} from '../comparison.js'
import {midnight} from '../cohorts.js'
const DAY=86400000,base=midnight(100*DAY),asOf=base+10*DAY
const user=(id,language,events,fields={})=>({id:'user:'+id,source:'SEO',preferred_language:language,events,...fields})
const event=(type,day,fields={})=>({type,t:base+day*DAY+1000,...fields})
const options={startAt:base,endAt:base+9*DAY,asOf}
describe('population comparison',()=>{
 it('combines filters and uses each group as metric denominator with unknown separate',()=>{
  const users=[user('1','zh',[event('chip',0),event('chip',1)],{telegram_bound:true}),user('2','en',[event('ai',0)],{telegram_bound:true}),user('3',null,[],{telegram_bound:false})]
  const all=computeComparison(users,options)
  expect(all.rows).toHaveLength(3)
  expect(all.rows.find(r=>r.key==='zh').analyzed).toHaveLength(1)
  const selected=computeComparison(users,{...options,dimension:'source',filters:{language:'zh',telegram:'bound'}})
  expect(selected.pool).toHaveLength(1)
  expect(selected.rows[0].label).toBe('SEO')
  expect(selected.retentionAllowed).toBe(false)
 })
 it('retains only complete observation days and compares the same D0 cohort',()=>{
  const users=[user('1','zh',[event('chip',0),event('chip',7)]),user('2','en',[event('chip',0)]),user('3','en',[event('chip',8)])]
  const result=computeComparison(users,{...options,cohortDay:base})
  expect(result.rows.find(r=>r.key==='zh').retention[6].rate).toBe(1)
  expect(result.rows.find(r=>r.key==='en').retention[6].rate).toBe(0)
  expect(result.rows.find(r=>r.key==='en').cohort).toHaveLength(1)
  const pending=computeComparison(users,{...options,cohortDay:base+8*DAY})
  expect(pending.rows.find(r=>r.key==='en').retention[6]).toMatchObject({rate:null,pending:1})
 })
 it('joins entry only through explicit context and never nearby unrelated tokens',()=>{
  const u=user('1','zh',[event('token',0,{token_visit_id:'other',entry_module:'fomo'}),event('chip',1,{token_visit_id:'visit'})])
  expect(entryFor(u,asOf)).toBe('unknown')
  u.events.push(event('token',0,{token_visit_id:'visit',entry_module:'signals'}))
  expect(entryFor(u,asOf)).toBe('signals')
 })
 it('deduplicates transaction and inviter user counts, preserves unavailable data',()=>{
  const users=[user('1','zh',[event('chip',0)])]
  const result=computeComparison(users,{...options,trades:[{user_id:'user:1',confirmed_at:base+1000,status:'confirmed',volume_usd:1},{user_id:'user:1',confirmed_at:base+2000,status:'confirmed',volume_usd:2}],referrals:[{inviter_user_id:'1',invitee_user_id:'2',bound_at:base+1000}]})
  expect(result.rows[0].traders).toHaveLength(1)
  expect(result.rows[0].inviters).toHaveLength(1)
  expect(computeComparison(users,options).rows[0].traders).toBeNull()
 })
 it('excludes users registered after period end and limits behavior to the selected range',()=>{
  const users=[user('1','zh',[event('chip',-1)]),user('2','en',[],{created_at:new Date(base+9*DAY).toISOString()})]
  const r=computeComparison(users,options)
  expect(r.pool).toHaveLength(1)
  expect(r.rows[0].analyzed).toHaveLength(0)
 })
})

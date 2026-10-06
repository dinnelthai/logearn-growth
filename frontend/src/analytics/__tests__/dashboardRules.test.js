import { describe, it, expect } from 'vitest'
import { classifyUser } from '../segmentation.js'
import { computeFunnel } from '../funnel.js'
const DAY=86400000, now=100*DAY
const user=events=>({id:'u1',source:'SEO',events})
describe('dashboard rules',()=>{
 it('recognizes a genuine return after a 28 day gap',()=>{
  expect(classifyUser(user([{type:'chip',t:now-60*DAY},{type:'chip',t:now-DAY}]),now)).toBe('回流')
 })
 it('does not treat repeated use of one strategy as two strategies',()=>{
  const events=[{type:'chip',t:now-10*DAY},{type:'chip',t:now-DAY},{type:'ai',t:now-DAY,strategy:'same'},{type:'ai',t:now,strategy:'same'}]
  expect(classifyUser(user(events),now)).toBe('分析型')
  expect(classifyUser(user([...events,{type:'ai',t:now,strategy:'other'}]),now)).toBe('策略型')
 })
 it('ignores future analysis when classifying a user',()=>{
  expect(classifyUser(user([{type:'chip',t:now+DAY}]),now)).toBe('未激活')
 })
 it('completed four-step conversion is not pending while its window is open',()=>{
  const events=['login','token','ai','chip'].map((type,i)=>({type,t:now+i*1000}))
  const result=computeFunnel([user(events)],{steps:['login','token','ai','chip'],startAt:now,endAt:now+DAY,asOf:now+4000})
  expect(result.total_converted).toBe(1)
  expect(result.pending_count).toBe(0)
 })
})

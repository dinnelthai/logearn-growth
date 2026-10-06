import {describe,it,expect} from 'vitest'
import {groupFunnels,groupTrends} from '../comparisonViews.js'
const DAY=86400000,base=100*DAY
const u=(id,events,fields={})=>({id,events,...fields})
describe('funnel and trend comparisons',()=>{
 it('keeps partial windows pending, permits observed conversion beyond entry range, rejects future events',()=>{
  const people=[u('a',[{type:'login',t:base+100},{type:'token',t:base+200},{type:'chip',t:base+DAY+50}]),u('b',[{type:'login',t:base+DAY-100},{type:'token',t:base+DAY-50},{type:'chip',t:base+2*DAY}])]
  const [r]=groupFunnels([{label:'A',people}],{startAt:base,endAt:base+DAY,asOf:base+DAY+100,hours:24})
  expect(r.stages[2].reached.map(u=>u.id)).toEqual(['a'])
  expect(r.pending.map(u=>u.id)).toEqual(['b'])
  expect(r.stages[1].lost).toHaveLength(0)
 })
 it('counts completed dropoffs and handles empty entry samples',()=>{
  const [r]=groupFunnels([{label:'A',people:[u('a',[{type:'login',t:base}])]}],{startAt:base,endAt:base+DAY,asOf:base+2*DAY,hours:1})
  expect(r.stages[0].lost).toHaveLength(1)
  expect(r.pending).toHaveLength(0)
  const [empty]=groupFunnels([{label:'B',people:[]}],{startAt:base,endAt:base+DAY,asOf:base+2*DAY})
  expect(empty.entered).toBe(0)
 })
 it('uses daily existing user denominator, deduplicates analyses, preserves missing denominator',()=>{
  const groups=[{label:'A',people:[u('a',[{type:'chip',t:base+100},{type:'chip',t:base+200}],{created_at:base}),u('b',[{type:'chip',t:base+DAY+100}],{created_at:base+DAY})]},{label:'empty',people:[]}]
  const result=groupTrends(groups,{startAt:base,endAt:base+2*DAY,asOf:base+3*DAY})
  expect(result[0].days[0].active).toHaveLength(1)
  expect(result[0].days[0].rate).toBe(1)
  expect(result[0].days[1].rate).toBe(.5)
  expect(result[1].days[0].rate).toBeNull()
 })
})

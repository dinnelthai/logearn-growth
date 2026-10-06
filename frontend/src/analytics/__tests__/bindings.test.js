import {describe,it,expect} from 'vitest'
import {bindingGroups} from '../bindings.js'
import {normalizeApiResponse} from '../normalize.js'
import {computeSegmentation} from '../segmentation.js'
describe('account binding tags',()=>{
 it('allows both tags and keeps unknown distinct from unbound',()=>{
  const users=[{id:'a',events:[],telegram_bound:true,email_bound:true},{id:'b',events:[],telegram_bound:false,email_bound:null},{id:'c',events:[],telegram_bound:'true',email_bound:false}]
  const result=bindingGroups(users)
  expect(result.telegram_bound.users.map(u=>u.id)).toEqual(['a'])
  expect(result.telegram_bound.unknown).toBe(1)
  expect(result.email_bound.unknown).toBe(1)
  expect(computeSegmentation(users,{asOf:1000}).tags).toMatchObject({telegram_bound:1,email_bound:1,telegram_binding_unknown:1})
 })
 it('retains bound registered accounts without events and validates boolean metadata',()=>{
  const result=normalizeApiResponse({events:[],users:[{user_id:'a',first_source:'SEO',telegram_bound:true,email_bound:true},{user_id:'b',telegram_bound:'false',email_bound:false}],referrals:[],startAt:0,asOf:1000})
  expect(result.users).toHaveLength(2)
  expect(result.users[0]).toMatchObject({id:'user:a',telegram_bound:true,email_bound:true,events:[]})
  expect(result.users[1].telegram_bound).toBeNull()
  expect(computeSegmentation(result.users,{asOf:1000}).segmentUsers['未激活']).toHaveLength(2)
 })
})

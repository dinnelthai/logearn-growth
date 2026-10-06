import {describe,it,expect} from 'vitest'
import {computePaths} from '../paths.js'
const MIN=60000,BASE=Date.parse('2026-10-01T00:00:00+07:00')
const event=(type,minute,session_id)=>({type,t:BASE+minute*MIN,session_id})
const user=events=>({id:'u',source:'SEO',events})
const opts={startAt:BASE,endAt:BASE+1440*MIN,asOf:BASE+1440*MIN}
describe('behavior paths',()=>{
 it('keeps explicit sessions together across long gaps and separates session IDs',()=>{
  const r=computePaths([user([event('login',0,'a'),event('token',90,'a'),event('chip',100,'a'),event('login',110,'b')])],opts)
  expect(r.sessions).toBe(2);expect(r.users).toBe(1);expect(r.inferred_sessions).toBe(0)
  expect(r.paths.some(p=>p.types.join(',')==='login,token,chip')).toBe(true)
 })
 it('splits inferred sessions at the 30 minute idle boundary',()=>{
  const r=computePaths([user([event('login',0),event('token',29),event('chip',59)])],opts)
  expect(r.sessions).toBe(2);expect(r.inferred_sessions).toBe(2)
 })
 it('collapses adjacent duplicates but preserves revisits without cyclic links',()=>{
  const r=computePaths([user([event('token',0,'a'),event('token',1,'a'),event('chip',2,'a'),event('token',3,'a')])],opts)
  expect(r.paths[0].types).toEqual(['token','chip','token'])
  expect(r.links.every(l=>Number(l.target.split(':')[0])>Number(l.source.split(':')[0]))).toBe(true)
 })
 it('anchors the first selected behavior and censors the date range',()=>{
  const r=computePaths([user([event('login',-1,'a'),event('token',1,'a'),event('chip',11,'a')])],{...opts,endAt:BASE+10*MIN,startEvent:'token'})
  expect(r.sessions).toBe(1);expect(r.paths[0].terminal).toBe('boundary');expect(r.paths[0].types).toEqual(['token'])
 })
 it('truncates long paths and keeps incoming/outgoing session counts equal',()=>{
  const r=computePaths([user([event('login',0,'a'),event('token',1,'a'),event('ai',2,'a'),event('chip',3,'a'),event('trade',4,'a')])],{...opts,maxSteps:3})
  expect(r.paths[0].terminal).toBe('more')
  expect(r.links.every(l=>l.value===1)).toBe(true)
 })
 it('ignores future events, respects source filters, and marks recent observations pending',()=>{
  const u=user([event('login',0,'a'),event('token',20,'a')])
  const r=computePaths([u],{...opts,asOf:BASE+10*MIN})
  expect(r.paths[0].terminal).toBe('pending');expect(r.paths[0].types).toEqual(['login'])
  expect(computePaths([u],{...opts,sourceFilter:'Bot'}).sessions).toBe(0)
 })
})

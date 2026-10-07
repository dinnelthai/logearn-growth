import {it,expect} from 'vitest'
import {createAudience,audienceUsers,audiencePeriod} from '../audience.js'
import {computeFunnel} from '../funnel.js'
import {computePaths} from '../paths.js'
import {buildCohorts} from '../cohorts.js'
const DAY=86400000,start=Date.parse('2026-10-01T00:00:00+07:00'),end=start+14*DAY
const user=id=>({id,source:'X',events:[{type:'login',t:start+1,session_id:id},{type:'token',t:start+2,session_id:id},{type:'chip',t:start+3,session_id:id},{type:'chip',t:start+DAY+3,session_id:id+'-return'}]})
const users=[user('user:a'),user('user:b'),user('user:c')]
const audience=createAudience({title:'X 获客',description:'本期首次到访',rows:[users[0],{u:users[1]},{u:users[0]}],context:{mode:'channels',start,end}})
it('materializes unique IDs and retains the original period without modifying source data',()=>{
 expect(audience.ids).toEqual(['user:a','user:b']);expect(Object.isFrozen(audience.ids)).toBe(true)
 expect(audiencePeriod({mode:'funnel',start:0,end:DAY},audience)).toMatchObject({start,end,range:14,period:'audience'})
 expect(users).toHaveLength(3)
})
it('the same fixed audience feeds funnel, paths and retention',()=>{
 const pool=audienceUsers(users,audience,'funnel')
 expect(computeFunnel(pool,{steps:['login','token','chip'],startAt:start,endAt:end,asOf:end}).total_entered).toBe(2)
 expect(computePaths(audienceUsers(users,audience,'paths'),{startAt:start,endAt:end,asOf:end}).users).toBe(2)
 expect(buildCohorts(audienceUsers(users,audience,'retention'),{startAt:start,endAt:end,asOf:end}).flatMap(c=>c.users).map(u=>u.id)).toEqual(audience.ids)
})
it('north star and referral retain their original platform scope; clearing restores all users',()=>{
 expect(audienceUsers(users,audience,'north')).toBe(users)
 expect(audienceUsers(users,audience,'referral')).toBe(users)
 expect(audienceUsers(users,null,'paths')).toBe(users)
})
it('snapshot membership does not expand when new users arrive; empty selections fail explicitly',()=>{
 expect(audienceUsers([...users,user('user:d')],audience,'paths')).toHaveLength(2)
 expect(()=>createAudience({rows:[],context:{start,end}})).toThrow('没有可分析')
})

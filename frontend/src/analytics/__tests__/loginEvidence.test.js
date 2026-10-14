import {it,expect} from 'vitest'
import {normalizeApiResponse} from '../normalize.js'
import {computeFunnel} from '../funnel.js'
const start=Date.parse('2026-10-12T00:00:00Z')
const raw=(id,name,user_id,t=100)=>({event_id:id,event_name:name,user_id,anonymous_id:'anon-'+(user_id||id),client_ts:start+t,properties:{}})
const normalize=events=>normalizeApiResponse({events,users:[],startAt:start,asOf:start+10000})
it('uses explicit authenticated evidence, excludes anonymous analysis and unrelated logged-in browsing',()=>{
 const data=normalize([raw('a','chip_analysis_drilldown','1'),raw('b','chip_analysis_viewed',null),raw('c','token_detail_viewed','2'),raw('d','login_succeeded','3'),raw('e','strategy_started','4')])
 const ids=data.loggedInVisitUsers.filter(u=>u.loginEvidence?.length).map(u=>u.id).sort()
 expect(ids).toEqual(['user:1','user:3','user:4'])
})
it('one drill can prove login and analysis at the same time, users remain deduplicated and active login stays separate',()=>{
 const data=normalize([raw('a','chip_analysis_drilldown','1'),raw('b','chip_analysis_drilldown','1',200),raw('c','login_succeeded','2')])
 const opts={startAt:start,endAt:start+10000,asOf:start+10000}
 const broad=computeFunnel(data.loggedInVisitUsers,{...opts,steps:['login_verified','chip']})
 expect(broad.total_entered).toBe(2);expect(broad.total_converted).toBe(1)
 const active=computeFunnel(data.loggedInVisitUsers,{...opts,steps:['login','chip']})
 expect(active.total_entered).toBe(1);expect(active.total_converted).toBe(0)
})

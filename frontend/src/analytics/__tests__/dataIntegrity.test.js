import {it,expect} from 'vitest'
import {normalizeApiResponse} from '../normalize.js'
import {computeTradeMonitor} from '../tradeMonitor.js'
import {matchChannel} from '../../channels/rules.js'
import {createTracker} from '../../tracking/client.js'
const base=Date.parse('2026-10-01T00:00:00Z'),DAY=86400000
const raw=(name,t,id,props={})=>({event_id:id,event_name:name,user_id:'a',occurred_at:new Date(t).toISOString(),properties:props})
const normalize=opts=>normalizeApiResponse({users:[],events:[],startAt:base,asOf:base+3*DAY,...opts})
it('confirmed trade facts reconcile raw success events and duplicate facts by trade ID',()=>{
 const trade={trade_id:'t1',user_id:'a',confirmed_at:new Date(base+2000).toISOString(),status:'confirmed',volume_usd:12}
 const data=normalize({events:[raw('trade_succeeded',base+2000,'e1',{trade_id:'t1'})],trades:[trade,trade]})
 expect(data.trades).toHaveLength(1);expect(data.users[0].events.filter(e=>e.type==='trade')).toHaveLength(1)
})
it('submission cohorts handle retries, cross-day confirmation, pending and unrelated outcomes',()=>{
 const data=normalize({events:[raw('trade_submitted',base+1,'s1',{trade_attempt_id:'a1'}),raw('trade_submitted',base+2,'s2',{trade_attempt_id:'a1'}),raw('trade_succeeded',base+DAY+1,'ok',{trade_attempt_id:'a1'}),raw('trade_submitted',base+3,'s3',{trade_attempt_id:'a2'}),raw('trade_succeeded',base+4,'unrelated',{trade_attempt_id:'other'})]})
 const r=computeTradeMonitor({users:data.users,startAt:base,endAt:base+DAY,asOf:base+2*DAY})
 expect(r.totalSubmitted).toBe(2);expect(r.totalSucceeded).toBe(1);expect(r.pending).toBe(1);expect(r.successRate).toBe(.5);expect(r.unmatchedOutcomes).toBe(1);expect(r.days[0].succeeded).toBe(1)
})
it('uncorrelated historical records cannot produce a misleading success rate',()=>{
 const data=normalize({events:[raw('trade_submitted',base+1,'s'),raw('trade_succeeded',base+2,'ok')]})
 const r=computeTradeMonitor({users:data.users,startAt:base,endAt:base+DAY,asOf:base+DAY})
 expect(r.successRate).toBeNull();expect(r.missingCorrelation).toBe(1);expect(r.totalSucceeded).toBe(0)
})
it('referrer-only first acquisition uses exact domains and never overwrites its first entry',()=>{
 const rules=[{id:'x',name:'X 外部入口',enabled:true,priority:1,version:2,conditions:{referrer_domain:'x.com'}}]
 const data=normalize({channelRules:rules,events:[raw('first_visit_captured',base,'first',{first_referrer_url:'https://x.com/post/1'}),raw('first_visit_captured',base+1,'later',{first_referrer_url:'https://t.me/group'}),raw('chip_analysis_viewed',base+2,'chip')]})
 expect(data.users[0].channelFact).toMatchObject({channel_id:'x',channel_version:2,referrer:'https://x.com/post/1',payments:null});expect(data.users[0].source).toBe('X 外部入口');expect(data.users[0].events.at(-1).entry_source).toBe('X 外部入口')
 expect(matchChannel({referrer_url:'https://x.com.evil.test'},rules).id).toBe('unknown')
 expect(normalize({channelRules:rules,events:[raw('first_visit_captured',base,'e',{})]}).users[0].channelFact.channel_id).toBe('unknown')
})
it('new event names validate the same required correlation fields as their aliases',async()=>{
 const tracker=createTracker({send:()=>{},storage:{getItem:()=>null,setItem(){}},uuid:()=> 'id'})
 await expect(tracker.track('ranking_token_clicked',{})).rejects.toThrow('Token click requires')
 await expect(tracker.track('signal_viewed',{})).rejects.toThrow('run and result')
})
it('invalid timestamps and events after the observation ceiling are not counted',()=>{
 expect(normalize({events:[raw('chip_analysis_viewed',base+4*DAY,'future'),{event_id:'invalid',event_name:'chip_analysis_viewed',user_id:'a',occurred_at:'invalid'}]}).users).toEqual([])
})

import {computeNorthStar} from '../northStar.js'
import {buildCohorts} from '../cohorts.js'
import {firstAnalysis} from '../comparison.js'
it('historical first-analysis facts keep returning users out of new-user cohorts without synthetic activity',()=>{
 const data=normalize({users:[{user_id:'a',first_analysis_at:new Date(base-100*DAY).toISOString()}],events:[raw('chip_analysis_viewed',base+1,'return')]})
 const u=data.users[0];expect(u.events).toHaveLength(1);expect(firstAnalysis(u,base+DAY).t).toBe(base-100*DAY)
 const daily=computeNorthStar(data.users,base,base+DAY)
 expect(daily[0].new_active_users).toBe(0);expect(daily[0].returning_active_users).toBe(1)
 expect(buildCohorts(data.users,{startAt:base,endAt:base+DAY,asOf:base+DAY}).flatMap(co=>co.users)).toHaveLength(0)
})
it('unknown history coverage stays explicit instead of claiming completeness',()=>{
 expect(normalize({}).meta.historyComplete).toBe(false)
 expect(normalize({coverage:{history_complete:true}}).meta.historyComplete).toBe(true)
})

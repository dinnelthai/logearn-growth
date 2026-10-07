import {it,expect} from 'vitest'
import {sourceCoverage,periodCoverage,observationCeiling,cohortCoverage,rollingAverage} from '../coverage.js'
import {datasetFromJson} from '../jsonDataset.js'
import {computeNorthStar} from '../northStar.js'
const DAY=86400000,start=Date.parse('2026-09-01T17:00:00Z'),end=start+10*DAY
const meta={events_start_at:new Date(start).toISOString(),events_complete_through:new Date(end).toISOString()}
it('requires explicit complete bounds instead of first facts or history flags',()=>{
 expect(sourceCoverage({history_complete:true},'events',end,start)).toBeNull()
 expect(sourceCoverage({trades_start_at:'invalid',trades_complete_through:new Date(end).toISOString()},'trades')).toBeNull()
 expect(sourceCoverage({...meta,complete:false},'events')).toBeNull()
 expect(sourceCoverage(meta,'events',end-DAY,start+DAY)).toEqual({start:start+DAY,end:end-DAY})
 const range=sourceCoverage(meta,'events');expect(periodCoverage(range,start,end)).toBe('complete');expect(periodCoverage(range,start-DAY,end)).toBe('partial');expect(periodCoverage(range,end,end+DAY)).toBe('uncovered');expect(periodCoverage(null,start,end)).toBe('unknown')
})
it('uses the least complete available source watermark with an asOf ceiling',()=>{
 expect(observationCeiling({events:meta,trades:{trades_start_at:new Date(start).toISOString(),trades_complete_through:new Date(end-DAY).toISOString()},asOf:end+DAY})).toBe(end-DAY)
 expect(observationCeiling({events:meta,asOf:end-2*DAY})).toBe(end-2*DAY)
 expect(observationCeiling({events:{events_complete_through:'invalid'},asOf:end})).toBe(end)
})
it('complete empty trade data remains known zero, missing metadata remains unknown',()=>{
 const manifest={start_at:new Date(start).toISOString(),as_of:new Date(end).toISOString(),...meta}
 const common={manifest,users:{users:[]},events:{events:[]}}
 const complete=datasetFromJson({...common,trades:{trades:[],meta:{trades_start_at:manifest.start_at,trades_complete_through:manifest.as_of}}}),unknown=datasetFromJson({...common,trades:{trades:[]}})
 expect(complete.trades).toEqual([]);expect(periodCoverage(complete.meta.coverage.trades,start,end)).toBe('complete')
 expect(unknown.trades).toEqual([]);expect(periodCoverage(unknown.meta.coverage.trades,start,end)).toBe('unknown')
})
it('retention requires D0 and all days needed by the selected return mode',()=>{
 const co={start,asOf:end};expect(cohortCoverage(co,7,{start,end})).toBe(true)
 expect(cohortCoverage(co,7,{start:start+DAY,end})).toBe(false)
 expect(cohortCoverage(co,7,{start,end:start+7*DAY})).toBe(false)
 expect(cohortCoverage(co,7,null,true)).toBe(false)
 expect(cohortCoverage({...co,asOf:start+7.5*DAY},7,{start,end},true)).toBe(true) // partial current day may be observed, never mature
})
it('rolling mean uses available complete days and never pads missing history as zero',()=>{
 const range={start,end};const users=[{id:'u',events:[{type:'chip',t:start+DAY/2}]}]
 expect(rollingAverage({users,endAt:start+DAY,loadedStart:start,range,compute:computeNorthStar})).toEqual({value:1,days:1})
 expect(rollingAverage({users,endAt:start+2*DAY,loadedStart:start,range,compute:computeNorthStar})).toEqual({value:.5,days:2})
 expect(rollingAverage({users,endAt:start+DAY,loadedStart:start,range:null,compute:computeNorthStar}).value).toBeNull()
 expect(rollingAverage({users,endAt:start+DAY,loadedStart:start+1,range,compute:computeNorthStar}).value).toBeNull()
})

import {computeComparison} from '../comparison.js'
import {computeChannels} from '../../channels/analytics.js'
it('comparison and channel D7 do not finalize a mature cohort outside explicit event coverage',()=>{
 const users=[{id:'user:u',source:'X',preferred_language:'en',created_at:start,events:[{type:'chip',t:start+1000},{type:'chip',t:start+7*DAY+1000}],channelFact:{channel_id:'x',first_visit_at:new Date(start).toISOString(),payments:null}}]
 const opts={startAt:start,endAt:start+DAY,asOf:end,coverage:{events:null}}
 expect(computeComparison(users,opts).rows[0].retention[6].rate).toBeNull()
 expect(computeChannels({...opts,users,rules:[{id:'x',name:'X'}],trades:[]}).total.eligible).toBe(0)
 const complete={...opts,coverage:{events:{start,end}}}
 expect(computeComparison(users,complete).rows[0].retention[6].rate).toBe(1)
 expect(computeChannels({...complete,users,rules:[{id:'x',name:'X'}],trades:[]}).total.retained).toBe(1)
})

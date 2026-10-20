import {it,expect} from 'vitest'
import {validateTradeFacts} from '../tradeFacts.js'
const asOf=Date.parse('2026-10-06T06:00:00Z'),row={trade_id:'a',user_id:'u',confirmed_at:'2026-10-04T01:00:00Z',volume_usd:12,status:'confirmed'}
it('excludes invalid, future and unconfirmed facts with mutually exclusive reasons',()=>{
 const {trades,quality:q}=validateTradeFacts([row,null,{...row,trade_id:'b',user_id:null},{...row,trade_id:'c',confirmed_at:'invalid'},{...row,trade_id:'d',volume_usd:'12'},{...row,trade_id:'e',volume_usd:-1},{...row,trade_id:'f',volume_usd:Infinity},{...row,trade_id:'g',status:'pending'},{...row,trade_id:'h',confirmed_at:'2026-10-07T00:00:00Z'}],asOf)
 expect(trades).toHaveLength(1);expect(q).toMatchObject({input:9,accepted:1,missingId:1,missingUser:1,invalidTime:1,invalidAmount:3,notConfirmed:1,future:1,excluded:8})
 expect(Object.entries(q).filter(([k])=>['missingId','missingUser','invalidTime','invalidAmount','notConfirmed','future','duplicates','conflictingRows'].includes(k)).reduce((n,[,v])=>n+v,0)).toBe(q.excluded)
})
it('deduplicates identical facts and quarantines conflicting amounts or owners regardless of order',()=>{
 for(const rows of [[row,{...row,volume_usd:13}],[{...row,user_id:'other'},row]]){
  expect(validateTradeFacts(rows,asOf)).toMatchObject({trades:[],quality:{conflictingIds:1,conflictingRows:2,accepted:0,excluded:2}})
  expect(validateTradeFacts([...rows].reverse(),asOf).trades).toEqual([])
 }
 expect(validateTradeFacts([row,{...row}],asOf)).toMatchObject({trades:[{...row,confirmed_at:Date.parse(row.confirmed_at),trade_attempt_id:null,chain:null}],quality:{duplicates:1,accepted:1}})
 expect(validateTradeFacts(null,asOf)).toEqual({trades:null,quality:null})
})

it.skip('Mock JSON data has been removed - trade validation moved to integration tests',()=>{
 // This test relied on mock JSON data. Real trade validation is now tested in integration suite.
})


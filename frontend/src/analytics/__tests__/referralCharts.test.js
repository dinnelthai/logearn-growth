import {test,expect} from 'vitest'
import {referralRankOption,referralTrendOption,referralQualityOption} from '../../pages/referralCharts.js'
const c={text:'#222',muted:'#777',border:'#eee'}
test('ranking bars drill into the matching inviter, not the global pool',()=>{
 const v=referralRankOption([{id:'user:3588',users:353,list_key:'inviter:3588'}],c)
 expect(v.series[0].data[0]).toMatchObject({value:353,list_key:'inviter:3588'})
})
test('trend distinguishes inviter list from invitee list',()=>{
 const v=referralTrendOption([{label:'2026-10-01',users:4,inviters:2,list_key:'day:x'}],c)
 expect(v.series[0].data[0].list_key).toBe('day:x');expect(v.series[1].data[0].list_key).toBe('day:x:inviters')
})
test('quality chart proportions and drill IDs use the exact behavior numerator',()=>{
 const v=referralQualityOption([{label:'2026-10-05',users:10,analysis:3,strategy:2,trade:1,list_key:'week:x'}],c)
 expect(v.series[0].data[0]).toMatchObject({value:30,count:3,total:10,list_key:'week:x:analysis'})
 expect(v.series[2].data[0].value).toBe(10)
})

import {test,expect} from 'vitest'
import {parseOpsRows} from '../../pages/opsTools.js'
test('batch input accepts lists, column overrides, quotes and JSON lines',()=>{
 expect(parseOpsRows('1\n2',{quotaAmount:'3'},'userId',['userId','quotaAmount'])).toEqual([{quotaAmount:'3',userId:'1'},{quotaAmount:'3',userId:'2'}])
 expect(parseOpsRows('userId,remark\n1,"活动,补偿"',{quotaAmount:'3'},'userId',['userId','remark'])).toEqual([{quotaAmount:'3',userId:'1',remark:'活动,补偿'}])
 expect(parseOpsRows('{"userId":"1","quotaAmount":4}',{quotaAmount:'3'},'userId',['userId','quotaAmount'])[0].quotaAmount).toBe(4)
})
test('invalid CSV and oversized input fail before preview',()=>{
 expect(()=>parseOpsRows('1,2',{},'userId',['userId'])).toThrow('表头')
 expect(()=>parseOpsRows('userId\n"1',{},'userId',['userId'])).toThrow('引号')
 expect(()=>parseOpsRows('1'.repeat(256*1024+1),{},'userId',['userId'])).toThrow('256KB')
 expect(()=>parseOpsRows(Array.from({length:102},(_,i)=>i).join('\n'),{},'userId',['userId'])).toThrow('100')
 expect(parseOpsRows('',{},null,[])).toEqual([{}])
})
test('address targets are resolved to user IDs before preview, preserving row parameters',async()=>{
 const {resolveOpsTargets}=await import('../../pages/opsTools.js'),address='0x'+'a'.repeat(40)
 const result=await resolveOpsTargets([{userId:'0x'+'A'.repeat(40),quotaAmount:3}],async input=>{expect(input).toContain('0x');return {records:[{address,state:'matched',user_id:'9'}]}})
 expect(result).toEqual([{userId:'9',quotaAmount:3}])
})
test('ambiguous or unresolved addresses block the entire operation preview',async()=>{
 const {resolveOpsTargets}=await import('../../pages/opsTools.js')
 await expect(resolveOpsTargets([{userId:'address',quotaAmount:3}],async()=>({records:[{address:'address',state:'ambiguous',user_id:null}]}))).rejects.toThrow('未唯一匹配')
})

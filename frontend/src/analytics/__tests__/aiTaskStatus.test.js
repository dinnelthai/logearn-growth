import {test,expect} from 'vitest'
import {displayTaskStatus,canOfferTaskResume,canOfferTaskRetry,shouldPollTask} from '../../pages/aiTaskStatus.js'

test('human intervention overrides running status without implying completion',()=>{
 const r={status:'processing'}
 const c={recordStatus:'processing',state:'partial-tools',requiresHumanReview:true,leaseExpired:true,pendingTools:4}
 expect(displayTaskStatus(r,c).text).toBe('需要人工处理')
 expect(shouldPollTask(r,c)).toBe(false)
 expect(canOfferTaskResume(r,c)).toBe(false)
})

test('unknown checkpoints never enable paid recovery',()=>{
 const r={status:'failed'}
 expect(canOfferTaskRetry(r,null)).toBe(false)
 expect(canOfferTaskRetry(r,{requiresHumanReview:true,pendingTools:0})).toBe(false)
 expect(canOfferTaskRetry(r,{requiresHumanReview:false,pendingTools:1})).toBe(false)
 expect(canOfferTaskRetry(r,{state:'blocked',pendingTools:0})).toBe(false)
 expect(canOfferTaskRetry(r,{state:'ready',pendingTools:0})).toBe(true)
})

test('expired lease needs consistent checkpoint without uncompleted tools',()=>{
 const r={status:'processing'}
 const c={recordStatus:'processing',leaseExpired:true,pendingTools:0,state:'ready'}
 expect(canOfferTaskResume(r,c)).toBe(true)
 expect(canOfferTaskResume(r,{...c,reason:'unresolved-paid-call'})).toBe(false)
 expect(canOfferTaskResume(r,{...c,reason:'requires-validation-before-resume'})).toBe(false)
 expect(canOfferTaskResume(r,{...c,pendingTools:2})).toBe(false)
 expect(canOfferTaskResume(r,{...c,leaseExpired:false})).toBe(false)
 expect(shouldPollTask(r,c)).toBe(true)
 expect(shouldPollTask({...r,cancel_requested:true},c)).toBe(false)
})

import {test,expect} from 'vitest'
import {displayTaskStatus,canOfferTaskResume,canOfferTaskRetry,shouldPollTask} from '../../pages/aiTaskStatus.js'

test('human review overrides running status and disables automatic polling',()=>{
 const r={status:'processing'}
 const c={recordStatus:'processing',state:'partial-tools',reason:'tool-execution-incomplete',requiresHumanReview:true,leaseExpired:true,modelCalls:2,completedRounds:2,pendingTools:4}
 expect(displayTaskStatus(r,c).text).toBe('需要人工处理')
 expect(shouldPollTask(r,c)).toBe(false)
 expect(canOfferTaskResume(r,c)).toBe(false)
})

test('failed task can retry only with an empty trace journal, matching backend retrySafety',()=>{
 const record={status:'failed'}
 const empty={recordStatus:'failed',state:'not-started',reason:null,modelCalls:0,completedRounds:0,pendingTools:0,requiresHumanReview:false}
 expect(canOfferTaskRetry(record,empty)).toBe(true)
 expect(canOfferTaskRetry(record,null)).toBe(false)
 expect(canOfferTaskRetry(record,{...empty,state:'recorded',modelCalls:1,completedRounds:1,reason:'requires-validation-before-resume'})).toBe(false)
 expect(canOfferTaskRetry(record,{...empty,modelCalls:1})).toBe(false)
 expect(canOfferTaskRetry(record,{...empty,pendingTools:1})).toBe(false)
 expect(canOfferTaskRetry(record,{...empty,requiresHumanReview:true})).toBe(false)
 expect(canOfferTaskRetry({...record,cancel_requested:true},empty)).toBe(false)
})

test('manual resume only appears for expired processing task with complete recorded journal',()=>{
 const record={status:'processing'}
 const checkpoint={
  recordStatus:'processing',leaseExpired:true,requiresHumanReview:true,
  state:'recorded',reason:'requires-validation-before-resume',
  modelCalls:1,completedRounds:1,pendingTools:0
 }
 expect(canOfferTaskResume(record,checkpoint)).toBe(true)
 expect(shouldPollTask(record,checkpoint)).toBe(false)
 expect(canOfferTaskResume(record,{...checkpoint,leaseExpired:false})).toBe(false)
 expect(canOfferTaskResume(record,{...checkpoint,requiresHumanReview:false})).toBe(false)
 expect(canOfferTaskResume(record,{...checkpoint,modelCalls:0})).toBe(false)
 expect(canOfferTaskResume(record,{...checkpoint,pendingTools:1})).toBe(false)
 expect(canOfferTaskResume(record,{...checkpoint,state:'partial-tools'})).toBe(false)
 expect(canOfferTaskResume(record,{...checkpoint,state:'blocked',reason:'unresolved-paid-call'})).toBe(false)
 expect(canOfferTaskResume({...record,cancel_requested:true},checkpoint)).toBe(false)
})

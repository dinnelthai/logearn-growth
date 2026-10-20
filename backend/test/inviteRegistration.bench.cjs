// Run from repo root: node --expose-gc backend/test/inviteRegistration.bench.cjs [baseline-module]
const assert=require('node:assert/strict')
const {performance}=require('node:perf_hooks')
const path=require('node:path')
const current=require('../src/analytics/inviteRegistration').inviteRegistration
const baseline=process.argv[2]?require(path.resolve(process.argv[2])).inviteRegistration:null
const sessions=3000,users=[{id:'user:1',source:'referral',events:[]}]
for(let i=0;i<sessions;i++)for(let j=0;j<10;j++)users[0].events.push({raw_name:j===0?'page_viewed':j===1?'login_attempt_finished':'chip_analysis_viewed',t:10000+i*100+j,event_id:i+':'+j,session_id:'s'+i,anonymous_id:'a',referral_key:j===0?'key':null,actor_user_id:j===1?'1':null,properties:j===1?{outcome:'success'}:{}})
const args=[users,[],[{id:'2',code_key:'key',created_at:0},{id:'1',created_at:0}],{start:0,end:1000000,hours:1},5000000,{effectiveFrom:0}],measurements={}
let expected
for(const [label,fn] of [...(baseline?[['baseline',baseline]]:[]),['current',current]]){
 global.gc?.()
 const heap=process.memoryUsage().heapUsed,start=performance.now(),result=fn(...args)
 measurements[label]={ms:+(performance.now()-start).toFixed(2),heap_delta_bytes:process.memoryUsage().heapUsed-heap,result_bytes:Buffer.byteLength(JSON.stringify(result))}
 if(expected)assert.deepEqual(result,expected)
 expected=result
}
console.log(JSON.stringify({synthetic:true,sessions,events:users[0].events.length,measurements},null,2))

const {test}=require('node:test'),assert=require('node:assert/strict'),{effectTargets,effectPeriods}=require('../src/analytics/opsEffect')
test('effect audience excludes unverified VIP, pending/unknown/failed rows and non-grant operations',()=>{
 const row=(state,id,verified)=>({state,result_json:JSON.stringify({summary:{user_id:id},verification:{user_id:verified}})})
 const rows=[row('success','1',true),row('success','1',true),row('success','2',null),row('unknown','3',true),row('failed','4',true)]
 assert.deepEqual(effectTargets({operation:'vip'},rows),['1']);assert.deepEqual(effectTargets({operation:'platform'},rows),[])
})
test('effect periods compare equal elapsed time, cap at 7 days, and do not call an incomplete batch mature',()=>{
 const b={state:'finished',finished_at:1000000000}
 assert.equal(effectPeriods({...b,state:'running'},b.finished_at+1),null)
 assert.equal(effectPeriods(b,b.finished_at-1),null)
 const early=effectPeriods(b,b.finished_at+1000);assert.equal(early.mature,false);assert.equal(early.before.end-early.before.start,early.after.end-early.after.start)
 const done=effectPeriods(b,b.finished_at+10*86400000);assert.equal(done.mature,true);assert.equal(done.after.end-done.after.start,7*86400000)
})

const {test}=require('node:test'),assert=require('node:assert/strict')
const {conversionLoss,factorContributions}=require('../src/analytics/conversionLoss')
const DAY=86400000,start=Date.parse('2026-10-10T00:00:00+07:00'),end=start+DAY,s={as_of:new Date(end-1).toISOString()}
const e=(type,t,properties={},extra={})=>({type,t,properties,...extra})
const user=(id,events,old=true)=>({id:'user:'+id,source:'direct',events:[...(old?[e('chip',start-1000)]:[]),...events]})
const request=(id,outcome,t=start+100,finish=t+10)=>[e('analysis_requested',t,{analysis_request_id:id,trigger:'user_action'}),...(outcome?[e('analysis_request_finished',finish,{analysis_request_id:id,outcome,duration_ms:10})]:[])]
test('growth factor changes reconcile, are symmetric across orders, and retain zero rate observations',()=>{
 for(const [a,b]of [[[100,.5,.4],[80,.6,.5]],[[0,0,0],[5,.5,.8]],[[10,.7,0],[12,.5,.6]],[[1,1,1],[1,1,1]]]){
  const effects=factorContributions(a,b),delta=b.reduce((x,y)=>x*y,1)-a.reduce((x,y)=>x*y,1)
  assert(Math.abs(effects.reduce((n,x)=>n+x,0)-delta)<1e-9)
  const reverse=factorContributions(b,a);effects.forEach((n,i)=>assert(Math.abs(n+reverse[i])<1e-9))
 }
 assert.deepEqual(factorContributions([10,.5,.5],[20,.5,.5]),[2.5,0,0])
})
test('strict evidence funnel retains every north-star user and loss groups partition exact absent users',()=>{
 const rows=[
  user(1,[e('page_view',start+1),e('login_attempt_started',start+5,{login_attempt_id:'l'}),e('login_attempt_finished',start+10,{login_attempt_id:'l',outcome:'failed'})]),
  user(2,[e('page_view',start+1,{}, {logged_in:true}),...request('f','failed')]),
  user(3,[...request('success','success'),...request('later','failed',start+200)]),
  user(4,[e('page_view',start+1),e('token',start+10)]),
  user(5,[]),
  user(6,[e('chip',start+1),e('page_view',start+20,{}, {logged_in:true})]),
  user(7,[e('page_view',start+10,{}, {logged_in:true}),e('chip',start+20)]),
  user(8,[e('page_view',start+5),e('login',start+10),e('chip',start+15)],false),
  user(9,request('unknown',null)),user(10,request('future','success',end-500,end+10)),
  user(11,request('cancel','cancelled')),user(12,request('empty','empty')),user(13,[e('page_view',start+1)]),
 ]
 const out=conversionLoss(rows,{start,end},s),m=out.payload
 assert.equal(m.current.analyzed,3);assert.equal(m.current.sequenced,2);assert.equal(m.current.outside,1)
 assert.equal(m.current.analyzed,m.current.sequenced+m.current.outside)
 assert.equal(m.lost_users,10);assert.equal(m.reasons.reduce((n,r)=>n+r.users,0),m.lost_users)
 const count=key=>m.reasons.find(r=>r.key===key).users
 for(const key of ['login_failed','analysis_failed','request_success_no_north','token_no_request','no_visit','analysis_unknown','analysis_pending','analysis_cancelled','analysis_empty','visit_no_login'])assert.equal(count(key),1,key)
 assert.equal(out.lists['loss:reason:request_success_no_north'][0],'user:3')
 assert.deepEqual(m.list_periods['loss:previous:analyzed'],{start:start-DAY,end:start})
 for(const period of [m.previous,m.current])for(const key of ['visitors','logged','sequenced','analyzed','outside'])assert.equal(out.lists[period.list_key+':'+key].length,period[key])
})
test('account identity alone does not imply prior login, and equal-ms events do not invent an order',()=>{
 const out=conversionLoss([user(1,[e('page_view',start+10),e('login',start+10),e('chip',start+20)]),user(2,[e('page_view',start+10,{}, {logged_in:true}),e('chip',start+10)])],{start,end},s).payload
 assert.equal(out.current.visitors,2);assert.equal(out.current.logged,1);assert.equal(out.current.sequenced,0);assert.equal(out.current.outside,2)
 assert.equal(out.attribution.available,false)
})
test('cross-period outcomes are usable, future outcomes cannot rewrite a historical loss bucket',()=>{
 const rows=[user(1,request('cross','failed',start-200,start+10)),user(2,request('historical','success',end-100,end+1))]
 const out=conversionLoss(rows,{start,end},s)
 assert.deepEqual(out.lists['loss:reason:analysis_failed'],['user:1']);assert.deepEqual(out.lists['loss:reason:analysis_pending'],['user:2'])
 assert.equal(out.payload.diagnostic_availability.login,false)
})
test('observed factor contributions plus evidence-outside change reconstruct the complete north-star delta',()=>{
 const rows=[user(1,[e('page_view',start-DAY+1,{}, {logged_in:true}),e('chip',start-DAY+2),e('page_view',start+1,{}, {logged_in:true}),e('chip',start+2)],false),user(2,[e('page_view',start+1,{}, {logged_in:true}),e('chip',start+2)],false),user(3,[e('chip',start+4)],false)]
 const m=conversionLoss(rows,{start,end},s).payload,a=m.attribution
 assert.equal(a.available,true);assert(Math.abs(a.factors.reduce((n,r)=>n+r.effect,0)+a.outside_delta-a.delta)<1e-9)
})

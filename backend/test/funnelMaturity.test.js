'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {computeFunnel}=require('../src/analytics/funnel');
const DAY=86400000,base=Date.parse('2026-10-01T00:00:00Z');
const e=(type,offset,fields={})=>({type,t:base+offset,...fields});
const user=(id,events)=>({id,events,source:'direct'});
const options={steps:['token_click','token','chip'],startAt:base,endAt:base+DAY,
 conversionWindowMs:DAY,asOf:base+2*DAY,association:'token_visit'};
test('funnel rates exclude pending users and retain mature known denominator',()=>{
 const asOf=base+DAY+500;
 const rows=[
  user('pending',[e('token_click',1,{token_visit_id:'v1'}),e('token',2,{token_visit_id:'v1'})]),
  user('converted',[e('token_click',10,{token_visit_id:'v2'}),e('token',20,{token_visit_id:'v2'}),e('chip',30,{token_visit_id:'v2'})]),
  user('drop',[e('token_click',100,{token_visit_id:'v3'}),e('token',200,{token_visit_id:'v3'})])
 ];
 const result=computeFunnel(rows,{...options,asOf});
 assert.deepEqual(result.steps[2],{
  key:'chip',users:1,eligible:2,converted:1,pending:1,unknown:0,
  previous_conversion_rate:.5,total_eligible:2,total_conversion_rate:.5,drop_off_users:1
 });
});
test('unknown association is excluded from dropout and mature denominator',()=>{
 const rows=[
  user('unknown',[e('token_click',1,{token_visit_id:'v1'}),e('token',2)]),
  user('known-drop',[e('token_click',10,{token_visit_id:'v2'})])
 ];
 const result=computeFunnel(rows,options);
 assert.equal(result.steps[1].eligible,1);
 assert.equal(result.steps[1].unknown,1);
 assert.equal(result.steps[1].drop_off_users,1);
 assert.equal(result.steps[1].previous_conversion_rate,0);
 assert.equal(result.steps[2].previous_conversion_rate,null);
 assert.equal(result.rows.find(r=>r.userId==='unknown').incompleteAt,1);
});
test('zero mature denominator produces null rather than 0 or 100 percent',()=>{
 const result=computeFunnel([],{...options,asOf:base+2*DAY});
 assert.equal(result.steps[0].previous_conversion_rate,null);
 assert.equal(result.steps[0].total_conversion_rate,null);
 assert.equal(result.steps[1].previous_conversion_rate,null);
 assert.equal(result.steps[1].total_conversion_rate,null);
});

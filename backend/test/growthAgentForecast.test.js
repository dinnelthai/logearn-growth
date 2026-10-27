'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateForecast,calibrateForecast}=require('../src/ai/growth/agentForecast');
const forecast={metric:'active_users',direction:'increase',horizonDays:3,
 minRelativeChangePct:10,confidence:'medium',evidenceIds:['evidence-1']};
const review=(effect=120,days=3)=>({
 effect_period:{days},confidence:'high',metric_changes:{
  active_users:{available:true,baseline:100,effect}}
});
test('numeric model expectations require same metric and existing evidence IDs',()=>{
 assert.deepEqual(validateForecast(forecast,{primary:'active_users'},
  {evidenceIds:['evidence-1']}),forecast);
 assert.throws(()=>validateForecast({...forecast,metric:'unknown'},
  {primary:'unknown'},{evidenceIds:['evidence-1']}),/结构化预测/);
 assert.throws(()=>validateForecast({...forecast,evidenceIds:['imaginary']},
  {primary:'active_users'},{evidenceIds:['evidence-1']}),/证据/);
 assert.throws(()=>validateForecast({...forecast,horizonDays:100},
  {primary:'active_users'},{evidenceIds:['evidence-1']}),/观察期/);
 assert.equal(validateForecast(null,{primary:'active_users'},{}),null);
});
test('prediction calibration respects exact retrospective time window and mature data',()=>{
 assert.equal(calibrateForecast(forecast,review(120)).status,'observed-hit');
 assert.equal(calibrateForecast(forecast,review(103)).status,'observed-miss');
 assert.equal(calibrateForecast(forecast,review(130,7)).status,'insufficient');
 assert.equal(calibrateForecast(forecast,{...review(130),confidence:'low'}).status,'insufficient');
 assert.equal(calibrateForecast(null,review(120)).status,'not-issued');
 assert.equal(calibrateForecast(forecast,review(120)).causalProof,false);
});

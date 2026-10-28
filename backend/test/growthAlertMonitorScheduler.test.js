'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runOnce,GOALS}=require('../src/ai/growth/monitorScheduler');
test('one in-process scan follows persisted opt-ins and maintains human approval boundary',async()=>{
 const reads=[],calls=[],summaries=[];
 const control={
  enabledOwners:async()=>['alice','bob'],
  get:async id=>({enabled:id==='alice'}),
  recordScan:async(id,value)=>summaries.push([id,value])
 };
 let claims=0,finishes=0;
 const health={
  begin:async arg=>{claims++;assert.equal(arg.name,'growth-monitor');return {name:'growth-monitor',token:'lease'}},
  finish:async(_lease,result)=>{finishes++;assert.equal(result.outcome,'succeeded')}
 };
 const result=await runOnce({control,health,
  alerts:{},proposals:{},scan:async({ownerId,goal,source})=>{
   calls.push([ownerId,goal,source]);return {status:'scanned',observed:1,newObservations:0}
  }});
 assert.deepEqual(GOALS,['activation','retention']);
 assert.deepEqual(calls,[['alice','activation','all'],['alice','retention','all']]);
 assert.equal(summaries.length,1);assert.equal(summaries[0][0],'alice');
 assert.equal(result.status,'succeeded');assert.equal(result.scans,2);
 assert.equal(claims,1);assert.equal(finishes,1);
});
test('turning off between goals prevents further scans',async()=>{
 let reads=0;const called=[];
 const result=await runOnce({
  control:{enabledOwners:async()=>['alice'],get:async()=>({enabled:++reads===1}),
   recordScan:async()=>{}},
  health:{begin:async()=>({name:'growth-monitor',token:'1'}),finish:async()=>{}},
  alerts:{},proposals:{},scan:async({goal})=>{called.push(goal);return {status:'scanned'}}
 });
 assert.deepEqual(called,['activation']);
 assert.equal(result.skipped,1);
});
test('a second instance cannot scan without the existing DB lease',async()=>{
 let called=false;
 const result=await runOnce({
  health:{begin:async()=>null},
  control:{enabledOwners:async()=>{called=true;return []}},
  alerts:{},proposals:{},scan:async()=>{throw Error('must not scan')}
 });
 assert.equal(result.status,'already-running-other-instance');
 assert.equal(called,false);
});
test('failure of one goal is contained and recorded for that owner',async()=>{
 const summaries=[];
 const result=await runOnce({
  control:{enabledOwners:async()=>['alice'],get:async()=>({enabled:true}),
   recordScan:async(_,value)=>summaries.push(value)},
  health:{begin:async()=>({name:'growth-monitor',token:'1'}),finish:async()=>{}},
  alerts:{},proposals:{},scan:async({goal})=>{
   if(goal==='activation')throw Error('upstream unavailable');
   return {status:'scanned',observed:1};
  }
 });
 assert.equal(result.status,'partial');assert.equal(result.errors,1);
 assert.equal(summaries[0].status,'error');
 assert.deepEqual(summaries[0].summary.goals.map(g=>g.status),['error','scanned']);
});

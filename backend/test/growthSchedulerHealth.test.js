'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {tick}=require('../src/queues/workers/growthAutonomyScheduler');
test('unattended scheduler refuses duplicate replicas and records aggregate health, never dispatching paid historical work',async()=>{
 const original={
  owners:process.env.AI_AUTONOMY_OWNER_IDS,
  goals:process.env.AI_AUTONOMY_GOALS,
  paid:process.env.AI_AUTONOMY_PAID_DAILY_ENABLED
 };
 process.env.AI_AUTONOMY_OWNER_IDS='alice';
 process.env.AI_AUTONOMY_GOALS='activation';
 process.env.AI_AUTONOMY_PAID_DAILY_ENABLED='1';
 const health={begins:0,finishes:[],begin:async()=>{
  health.begins++;return health.begins===1?{name:'growth-autonomy',token:'lease-1'}:null},
  heartbeat:async()=>true,finish:async(_lease,result)=>health.finishes.push(result)};
 const args=[];
 try{
  const result=await tick({
   now:Date.parse('2026-10-28T08:00:00Z'),health,
   runOwner:async input=>{
    args.push(input);
    return {ownerId:input.ownerId,day:'2026-10-27',status:'blocked',
     score:null,enqueued:[],completed:0};
   }
  });
  assert.equal(result.length,3);
  assert.equal(args.length,3);
  assert.deepEqual(args.map(x=>x.allowPaidDispatch),[false,false,true]);
  assert.equal(health.finishes.length,1);
  assert.equal(health.finishes[0].outcome,'succeeded');
  assert.equal(health.finishes[0].summary.blocked,3);
  assert.equal(health.finishes[0].summary.queued,0);
  const contended=await tick({health,runOwner:async()=>{throw Error('must not run')}});
  assert.equal(contended.status,'already-running-other-worker');
 }finally{
  for(const [key,value]of Object.entries({
   AI_AUTONOMY_OWNER_IDS:original.owners,
   AI_AUTONOMY_GOALS:original.goals,
   AI_AUTONOMY_PAID_DAILY_ENABLED:original.paid
  })){
   if(value==null)delete process.env[key];else process.env[key]=value;
  }
 }
});

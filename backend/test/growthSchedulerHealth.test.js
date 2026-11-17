'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
// Worker import must not create a real Redis connection in offline CI.
const queuePath=require.resolve('../src/queues/queues');
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,
 exports:{closeQueues:async()=>{}}};
const {tick}=require('../src/queues/workers/growthAutonomyScheduler');
test('unattended scheduler refuses duplicate replicas and records aggregate health, never dispatching paid historical work',async()=>{
 const original={
  owners:process.env.AI_AUTONOMY_OWNER_IDS,
  goals:process.env.AI_AUTONOMY_GOALS,
  paid:process.env.AI_AUTONOMY_PAID_DAILY_ENABLED,
  cap:process.env.AI_AUTONOMY_PAID_CALLS_PER_DAY
 };
 process.env.AI_AUTONOMY_OWNER_IDS='alice';
 process.env.AI_AUTONOMY_GOALS='activation';
 process.env.AI_AUTONOMY_PAID_DAILY_ENABLED='1';
 process.env.AI_AUTONOMY_PAID_CALLS_PER_DAY='12';
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
   AI_AUTONOMY_PAID_DAILY_ENABLED:original.paid,
   AI_AUTONOMY_PAID_CALLS_PER_DAY:original.cap
  })){
   if(value==null)delete process.env[key];else process.env[key]=value;
  }
 }
});

test('scheduler stops starting work when capacity budget expires',async()=>{
 const prior={owner:process.env.AI_AUTONOMY_OWNER_IDS,goals:process.env.AI_AUTONOMY_GOALS,
  paid:process.env.AI_AUTONOMY_PAID_DAILY_ENABLED,budget:process.env.AI_AUTONOMY_TICK_MAX_MS};
 process.env.AI_AUTONOMY_OWNER_IDS='alice';
 process.env.AI_AUTONOMY_GOALS='activation';
 process.env.AI_AUTONOMY_PAID_DAILY_ENABLED='0';
 process.env.AI_AUTONOMY_TICK_MAX_MS='1000';
 const completed=[],health={begin:async()=>({name:'growth-autonomy',token:'cap'}),
  heartbeat:async()=>true,finish:async(_lease,s)=>completed.push(s)};
 let n=0,ran=0;
 try{
  const result=await tick({health,clock:()=>{const x=n;n+=600;return x},
   runOwner:async()=>{ran++;return {ownerId:'alice',status:'blocked',enqueued:[]}}});
  assert.equal(ran,1);
  assert.equal(result.at(-1).status,'deferred-budget');
  assert.equal(completed[0].outcome,'partial');
  assert.equal(completed[0].summary.deferred,1);
  assert.equal(completed[0].summary.queued,0);
 }finally{
  const old={AI_AUTONOMY_OWNER_IDS:prior.owner,AI_AUTONOMY_GOALS:prior.goals,
   AI_AUTONOMY_PAID_DAILY_ENABLED:prior.paid,AI_AUTONOMY_TICK_MAX_MS:prior.budget};
  for(const [k,v]of Object.entries(old))if(v==null)delete process.env[k];else process.env[k]=v;
 }
});

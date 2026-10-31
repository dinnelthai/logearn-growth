'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Module=require('node:module');const {DatabaseSync}=require('node:sqlite');
const {atBangkok}=require('../src/ai/growth/workspace/period');
function mockRoutes(){
 const handlers={};const original=Module._load;
 Module._load=function(request,parent,isMain){if(request==='express')return {Router:()=>{
  const router={};for(const method of ['get','post','put','patch'])router[method]=(path,fn)=>{handlers[method.toUpperCase()+' '+path]=fn};return router}};
  return original.call(this,request,parent,isMain)};
 try{delete require.cache[require.resolve('../src/routes/growthWorkspace')];return {createRouter:require('../src/routes/growthWorkspace').createRouter,handlers}}
 finally{Module._load=original}
}
async function execute(handlers,key,{owner='alice',body={},query={},params={}}={}){
 const req={user:owner?{user_id:owner}:null,body,query,params};
 const res={code:200,status(n){this.code=n;return this},json(data){this.value=data;return this}};
 assert.equal(typeof handlers[key],'function',key);await handlers[key](req,res);return {status:res.code,value:res.value};
}
test('authenticated API does not permit user to forge evidence or AI run state',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const {workspaceStore}=require('../src/ai/growth/workspace/store');workspaceStore(db,{initialize:true});
  const {createRouter,handlers}=mockRoutes();createRouter({db});
  assert.equal(handlers['POST /evidence'],undefined);
  assert.equal(handlers['POST /investigations/:id/finish'],undefined);
  assert.equal((await execute(handlers,'GET /dashboard',{owner:null})).status,401);
  const start=atBangkok(2026,9,1),end=atBangkok(2026,10,1);
  const goal={metricId:'four_day_core',definitionVersion:'2026-10',target:200,unit:'users',aggregation:'rolling-distinct',periodStart:start,periodEnd:end};
  const added=await execute(handlers,'POST /goals',{body:goal});assert.equal(added.status,201);
  assert.equal((await execute(handlers,'GET /goals',{owner:'bob'})).value.goals.length,0);
  const p=await execute(handlers,'POST /problems',{body:{subject:'调查推荐人',description:'查询推荐人是否真正产生有效分析'}});
  assert.equal(p.value.type,'user');assert.equal(p.value.goal_id,null);
  assert.equal((await execute(handlers,'GET /problems/:id',{owner:'bob',params:{id:p.value.id}})).status,404);
  assert.equal((await execute(handlers,'POST /problems/:id/investigations',{params:{id:p.value.id}})).value.state,'queued');
  assert.equal((await execute(handlers,'GET /problems')).value.problems.length,1);
 }finally{db.close()}
});
test('dashboard remains read-only and displays persisted owner evidence',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const {workspaceStore}=require('../src/ai/growth/workspace/store');const store=workspaceStore(db,{initialize:true});
  const {currentMonth,dayStart}=require('../src/ai/growth/workspace/period');const month=currentMonth(),end=dayStart(Date.now());
  const goal=store.saveGoal('alice',{metricId:'weekly_core',definitionVersion:'1',target:200,unit:'users',aggregation:'rolling-distinct',periodStart:month.start,periodEnd:month.end,scope:{source:'all'}});
  const {createRouter,handlers}=mockRoutes();createRouter({db});
  const before=await execute(handlers,'GET /dashboard');
  assert.equal(before.value.goals[0].progress.status,'unknown');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gw_evidence').get().n,0);
  const {refreshWeeklyCore}=require('../src/ai/growth/workspace/weeklyCoreProgress');
  const now=Date.now();
  const providers={status:async()=>({snapshot_id:'s',as_of:new Date(now).toISOString(),history_complete:false,events_complete_through:null}),weekly:async()=>({payload:{available:true,start:end-7*86400000,end,timezone:'Asia/Bangkok',source:'all',users:27}})};
  await refreshWeeklyCore({store,owner:'alice',goal,now,...providers});
  const persisted=await execute(handlers,'GET /dashboard');
  assert.equal(persisted.value.goals[0].progress.status,'partial');
  assert.equal(persisted.value.goals[0].progress.observed,27);
  await execute(handlers,'GET /dashboard');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gw_evidence').get().n,1);
  assert.equal((await execute(handlers,'GET /dashboard',{owner:'bob'})).value.goals.length,0);
 }finally{db.close()}
});

test('only the owning operator can complete internal delivery work with authenticated evidence',async()=>{
 const db=new DatabaseSync(':memory:');try{
  const {workspaceStore}=require('../src/ai/growth/workspace/store');
  const s=workspaceStore(db,{initialize:true});
  const {createRouter,handlers}=mockRoutes();createRouter({db});
  const p=s.observeProblem('alice',{type:'business',subject:'declining active users',scope:{source:'all'}});
  const a=s.proposeActionOnce('alice',p.id,{description:'Check funnel',assignee:'growth'});
  const ok=await execute(handlers,'POST /actions/:id/status',{params:{id:a.id},body:{status:'accepted'}});
  assert.equal(ok.status,200);
  const rows=(await execute(handlers,'GET /executive/work-items')).value.items;
  assert.equal(rows.length,3);
  const first=rows.find(x=>x.step==='verify-evidence');
  assert.equal((await execute(handlers,'POST /executive/work-items/:id/complete',
   {owner:'bob',params:{id:first.id},body:{evidenceId:'fake'}})).status,404);
  assert.equal((await execute(handlers,'POST /executive/work-items/:id/complete',
   {params:{id:first.id},body:{}})).status,503);
  const now=Date.now();
  s.saveEvidence('alice',{id:'valid-e',state:'verified',metricId:'active_users',
   definitionVersion:'1',unit:'users',source:'test',scope:{source:'all'},value:7,
   period:{start:now-2*86400000,end:now-86400000,timezone:'Asia/Bangkok'},observedAt:now});
  const reply=await execute(handlers,'POST /executive/work-items/:id/complete',
   {params:{id:first.id},body:{evidenceId:'valid-e'}});
  assert.equal(reply.status,200);
  assert.equal(reply.value.status,'completed');
  assert.equal((await execute(handlers,'GET /executive/work-items',{owner:'bob'})).value.items.length,0);
 }finally{db.close()}
});

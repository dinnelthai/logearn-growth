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

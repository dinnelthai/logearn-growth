'use strict';
// Mount only behind the application's existing `requireAuth` middleware.
// This API is fully read-only with respect to external services and models.
const express=require('express');
const {workspaceStore}=require('../ai/growth/workspace/store');
const {currentMonth}=require('../ai/growth/workspace/period');
const {requiredString}=require('../ai/growth/workspace/contracts');
function createRouter({db=require('../db/connection')}={}){
 const router=express.Router();const store=workspaceStore(db);
 const h=fn=>async(req,res)=>{try{
  if(!req.user?.user_id)return res.status(401).json({error:'未登录'});
  await fn(req,res,String(req.user.user_id));
 }catch(e){const known=Number.isInteger(e.status)&&e.status>=400&&e.status<500;const status=known?e.status:503;return res.status(status).json({error:known?e.message:'工作台服务暂不可用；请先核验数据库迁移与 API/Worker 拓扑'})}};
 const num=(v,defaultValue)=>v===undefined?defaultValue:Number(v);
 router.get('/dashboard',h(async(req,res,owner)=>{
  const month=currentMonth();
  const goals=store.listGoals(owner,{start:month.start,end:month.end}).map(goal=>({goal,progress:store.progress(owner,goal.id).progress}));
  res.json({version:'growth-workspace-v1',month,goals,problems:store.problems(owner),actions:store.actions(owner),reports:store.reportList(owner),quality:store.qualitySummary(owner),externalActions:0,modelCalls:0});
 }));
 router.post('/goals',h(async(req,res,owner)=>res.status(201).json(store.saveGoal(owner,req.body||{}))));
 router.get('/goals',h(async(req,res,owner)=>res.json({goals:store.listGoals(owner,{asOf:num(req.query.at,Date.now()),versions:req.query.versions==='1'})})));
 router.get('/goals/:id',h(async(req,res,owner)=>{const g=store.goalById(owner,req.params.id,req.query.version?Number(req.query.version):null);res.status(g?200:404).json(g||{error:'目标不存在'})}));
 router.get('/goals/:id/progress',h(async(req,res,owner)=>res.json(store.progress(owner,req.params.id,{evidenceId:req.query.evidenceId||null}))));
 router.post('/problems',h(async(req,res,owner)=>{
  const body=req.body||{};
  res.status(201).json(store.observeProblem(owner,{type:'user',subject:requiredString(body.subject,'研究主题',256),description:requiredString(body.description||body.subject,'研究问题',2000),scope:body.scope||{source:'all'},nextStep:'在授权范围内核对相关业务证据',priority:2}));
 }));
 router.get('/problems',h(async(req,res,owner)=>res.json({problems:store.problems(owner,{status:req.query.status||null,limit:num(req.query.limit,50)})})));
 router.get('/problems/:id',h(async(req,res,owner)=>{const p=store.problem(owner,req.params.id);res.status(p?200:404).json(p?{problem:p,history:store.problemEvents(owner,p.id)}:{error:'不存在'})}));
 router.post('/problems/:id/status',h(async(req,res,owner)=>res.json(store.setProblemStatus(owner,req.params.id,req.body?.status,{reason:req.body?.reason,expectedStatus:req.body?.expectedStatus}))));
 router.post('/problems/:id/review',h(async(req,res,owner)=>res.json(store.reviewProblem(owner,req.params.id,req.body?.verdict,req.body?.reason||''))));
 router.post('/problems/:id/investigations',h(async(req,res,owner)=>res.status(201).json(store.startRun(owner,req.params.id,{mode:'manual'}))));
 router.get('/investigations/:id',h(async(req,res,owner)=>{const run=store.run(owner,req.params.id);res.status(run?200:404).json(run||{error:'不存在'})}));
 router.post('/investigations/:id/cancel',h(async(req,res,owner)=>res.json(store.cancelRun(owner,req.params.id))));
 router.post('/questions/:id/answer',h(async(req,res,owner)=>res.json(store.answer(owner,req.params.id,req.body?.answer))));
 router.post('/problems/:id/link-task',h(async(req,res,owner)=>res.json(store.linkOperationTask(owner,req.params.id,req.body?.taskId))));
 router.post('/problems/:id/actions',h(async(req,res,owner)=>res.status(201).json(store.createAction(owner,req.params.id,req.body||{}))));
 router.post('/actions/:id/status',h(async(req,res,owner)=>res.json(store.updateAction(owner,req.params.id,req.body?.status,req.body||{}))));
 router.post('/actions/:id/review',h(async(req,res,owner)=>res.json(store.reviewAction(owner,req.params.id,req.body||{}))));
 router.get('/evidence/:id',h(async(req,res,owner)=>{const evidence=store.getEvidence(owner,req.params.id);res.status(evidence?200:404).json(evidence||{error:'证据不存在'})}));
 router.get('/reports',h(async(req,res,owner)=>res.json({reports:store.reportList(owner,{kind:req.query.kind||null})})));
 router.post('/reports/:kind',h(async(req,res,owner)=>{const report=store.buildReport(owner,req.params.kind,{publish:req.body?.publish===true,forceRevision:req.body?.forceRevision===true});res.json(report)}));
 router.get('/quality',h(async(req,res,owner)=>res.json(store.qualitySummary(owner))));
 return router;
}
module.exports={createRouter};

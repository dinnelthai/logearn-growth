const express=require('express');
function createRouter({db,registry}){
 const router=express.Router(),store=require('../ai/business/context').createContextStore(db),evidence=require('../ai/business/evidence').createEvidenceStore(db);
 const handle=fn=>async(req,res)=>{try{if(!req.user?.user_id)return res.status(401).json({error:'未登录'});await fn(req,res);}catch(e){res.status(e.status||503).json({error:e.status&&e.status<500?e.message:'服务暂不可用，请检查健康状态'});}};
 const context=req=>({ownerId:String(req.user.user_id),scope:{source:'all'},runId:'api:'+Math.floor(Date.now()/120000),period:req.body?.period});
 router.get('/health',handle(async(req,res)=>res.json(await require('../ai/business/health').checkHealth())));
 router.post('/goals',handle(async(req,res)=>res.status(201).json(store.saveGoal(req.user.user_id,req.body))));
 router.get('/goals/:id',handle(async(req,res)=>{const v=req.query.version==null?undefined:Number(req.query.version);if(v!=null&&(!Number.isSafeInteger(v)||v<1))return res.status(400).json({error:'目标版本无效'});const goal=store.getGoal(req.user.user_id,req.params.id,v);res.status(goal?200:404).json(goal||{error:'目标不存在'});}));
 router.post('/changes',handle(async(req,res)=>res.status(201).json(store.saveChange(req.user.user_id,req.body))));
 router.get('/changes',handle(async(req,res)=>res.json({changes:store.listChanges(req.user.user_id)})));
 router.get('/metrics',handle(async(req,res)=>res.json({metrics:require('../ai/business/metricRegistry').listMetrics()})));
 router.get('/capabilities',handle(async(req,res)=>res.json({tools:registry.listCapabilities(context(req))})));
 router.post('/tools/:id',handle(async(req,res)=>res.json(await registry.executeTool(req.params.id,req.body.input||{},context(req)))));
 router.get('/evidence/:id',handle(async(req,res)=>res.json(evidence.get(req.params.id,context(req)))));
 router.get('/research/questions',handle(async(req,res)=>{
  const items=require('../ai/growth/researchQuestions').createResearchQuestions(db)
   .list(String(req.user.user_id),{status:req.query.status||'awaiting-review',
     limit:req.query.limit==null?30:Number(req.query.limit)});
  res.json({questions:items});
 }));
 router.post('/research/scan',handle(async(req,res)=>{
  if(process.env.AI_RESEARCH_DISCOVERY_ENABLED!=='1')return res.status(409).json({error:'自主发现尚未启用'});
  const ownerId=String(req.user.user_id);
  const result=require('../ai/growth/researchQuestions').createResearchQuestions(db)
   .plan(ownerId,store.listChanges(ownerId),{source:req.body?.source||'all'});
  res.json(result);
 }));
 router.post('/research/questions/:id/decision',handle(async(req,res)=>{
  const result=require('../ai/growth/researchQuestions').createResearchQuestions(db)
   .decide(String(req.user.user_id),req.params.id,req.body?.action);
  res.status(result.changed?200:409).json(result);
 }));
 router.get('/prompts/candidates',handle(async(req,res)=>{
  const registry=require('../ai/optimization/promptRegistry').createPromptRegistry(db);
  res.json({candidates:registry.list(String(req.user.user_id),{
   limit:req.query.limit==null?30:Number(req.query.limit)})});
 }));
 router.get('/prompts/candidates/:id',handle(async(req,res)=>{
  const item=require('../ai/optimization/promptRegistry').createPromptRegistry(db)
   .getWithContents(String(req.user.user_id),req.params.id);
  res.status(item?200:404).json(item||{error:'候选不存在'});
 }));
 router.post('/prompts/candidates',handle(async(req,res)=>{
  const item=require('../ai/optimization/promptRegistry').createPromptRegistry(db)
   .propose(String(req.user.user_id),req.body);
  res.status(201).json(item);
 }));
 router.post('/prompts/candidates/:id/approve',handle(async(req,res)=>{
  const item=require('../ai/optimization/promptRegistry').createPromptRegistry(db)
   .approve(String(req.user.user_id),req.params.id,req.body?.expectedVersion);
  res.json(item);
 }));
 router.post('/prompts/candidates/:id/activate',handle(async(req,res)=>{
  const item=require('../ai/optimization/promptRegistry').createPromptRegistry(db)
   .activate(String(req.user.user_id),req.params.id,req.body?.expectedVersion);
  res.json(item);
 }));
 router.post('/prompts/rollout',handle(async(req,res)=>{
  const item=require('../ai/optimization/promptRegistry').createPromptRegistry(db)
   .setRollout(String(req.user.user_id),req.body?.role,req.body?.expectedVersion,req.body?.percent);
  res.json(item);
 }));
 router.post('/prompts/rollback',handle(async(req,res)=>{
  const item=require('../ai/optimization/promptRegistry').createPromptRegistry(db)
   .rollback(String(req.user.user_id),req.body?.role,req.body?.expectedVersion);
  res.json(item);
 }));
 router.get('/runs/:id/trace',handle(async(req,res)=>res.json({calls:require('../ai/business/trace').createTraceStore(db).list(req.user.user_id,req.params.id)})));
 return router;
}
function defaultRouter(){const db=require('../db/connection');return createRouter({db,registry:require('../ai/business/tools/registry').defaultRegistry()});}
module.exports={createRouter,defaultRouter};

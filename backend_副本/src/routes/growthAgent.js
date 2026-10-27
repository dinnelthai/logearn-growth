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
 router.get('/runs/:id/trace',handle(async(req,res)=>res.json({calls:require('../ai/business/trace').createTraceStore(db).list(req.user.user_id,req.params.id)})));
 return router;
}
function defaultRouter(){const db=require('../db/connection');return createRouter({db,registry:require('../ai/business/tools/registry').defaultRegistry()});}
module.exports={createRouter,defaultRouter};

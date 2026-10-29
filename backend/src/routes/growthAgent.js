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
 // Minimal management status: NEVER echo service URL, credentials, project IDs,
 // or assume live connectivity just because server configuration exists.
 router.get('/connectors',handle(async(req,res)=>{
  const {configuration,bindingFor}=require('../ai/business/tools/openseoConnector');
  const ownerId=String(req.user.user_id);
  const configured=!!configuration();
  const authorized=!!bindingFor(process.env,{ownerId});
  const listed=registry.listCapabilities(context(req));
  res.json({connectors:[{
    id:'openseo',status:configured?(authorized?'configured_authorized':'unmapped'):'disabled',
    connectivity:'not_verified',readOnly:true,
    capabilities:listed.filter(cap=>cap.id.startsWith('openseo.'))
      .map(({id,version,description,cost})=>({id,version,description,cost})),
    paidResearch:'disabled_pending_billing_verification',
    changes:'server_configuration_only',lastError:null
  }]});
 }));
 router.post('/tools/:id',handle(async(req,res)=>{
  const base=context(req);
  // Direct user requests obtain a fresh server-side catalog, never a request
  // body supplied task allowlist. Worker plans apply their narrower allowlist.
  const allowed=registry.listCapabilities(base).map(item=>item.id);
  res.json(await registry.executeTool(req.params.id,req.body.input||{},
   {...base,taskAllowedTools:allowed}));
 }));
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
   .plan(ownerId,[...store.listChanges(ownerId),...require('../ai/growth/sourceChanges').sourceChanges(db,ownerId)].slice(0,100),{source:req.body?.source||'all'});
  res.json(result);
 }));
 router.post('/research/questions/:id/decision',handle(async(req,res)=>{
  const result=require('../ai/growth/researchQuestions').createResearchQuestions(db)
   .decide(String(req.user.user_id),req.params.id,req.body?.action);
  res.status(result.changed?200:409).json(result);
 }));
 router.post('/research/questions/:id/dispatch',handle(async(req,res)=>{
  const ownerId=String(req.user.user_id);
  if(process.env.AI_RESEARCH_PAID_DISPATCH_ENABLED!=='1'||req.body?.confirmPaidAnalysis!==true)
   return res.status(409).json({error:'自主研究付费分发未授权；请明确开启研究付费开关并确认'});
  const question=require('../ai/growth/researchQuestions').createResearchQuestions(db).get(ownerId,req.params.id);
  if(!question||question.status!=='approved')return res.status(409).json({error:'仅允许已批准的研究问题创建调查'});
  const {previousBangkokDay}=require('../ai/growth/daily');
  const period=previousBangkokDay();
  const goal=question.kind==='content'||question.kind==='audience'?'conversion':'activation';
  const skillId=question.kind==='content'?'content-growth':question.kind==='audience'?'follower-quality':null;
  const records=require('../db/aiRecords');
  const record=await records.createAnalysisRecord({ownerId,
   requestKey:'research-'+question.id,title:question.title,
   analysisType:'optimization',dateRangeStart:period.start,dateRangeEnd:period.end,
   businessScope:{source:'all'},userQuestion:question.question,dataSnapshot:{},
   filterConditions:{businessScope:{source:'all'},focusGoal:goal,modelMode:'auto',skillId,
    researchQuestionId:question.id}});
  if(record.status!=='pending')return res.json({status:'already-'+record.status,analysisId:record.id,paidModelCallsStarted:0});
  const job=await require('../queues/queues').addAIAnalysisJob('business-analysis',{
    analysisId:record.id,ownerId,dateRangeStart:Number(record.date_range_start),
    dateRangeEnd:Number(record.date_range_end),businessScope:record.business_scope,
    userQuestion:record.user_question,focusGoal:goal,modelMode:'auto'
   },{jobId:'research-'+record.id+'-'+Math.floor(Date.now()/600000),attempts:1});
  res.status(202).json({status:'queued',analysisId:record.id,jobId:job.id,
   paidModelCallsStarted:0,paidModelCallsMayStartInWorker:true,questionId:question.id});
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

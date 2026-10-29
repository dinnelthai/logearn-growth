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
 // All module operations use the existing registry and owner-scoped evidence.
 // No direct SQL access, third-party calls, or model inference is permitted.
 const opportunities=require('../ai/growth/opportunityStore').createOpportunityStore(db,{
  verifyEvidence:(ownerId,id,scope)=>{
   try{return !!evidence.get(id,{ownerId,scope})}catch{return false}
  }
 });
 const moduleContext=req=>{
  const period=req.body?.period;
  if(!period||period.timezone!=='Asia/Bangkok')
   throw Object.assign(Error('模块调查期间必须是 Asia/Bangkok'),{status:400});
  require('../analytics/businessPriorities').validateRange(period.start,period.end);
  const scope=req.body?.scope||{source:'all'};
  if(!scope||typeof scope!=='object'||Array.isArray(scope)||
     typeof (scope.source??'all')!=='string'||!String(scope.source??'all').trim()||
     Object.keys(scope).some(k=>!['source'].includes(k)))
    throw Object.assign(Error('模块调查仅支持来源范围；固定人群需走已有授权入口'),{status:400});
  return {ownerId:String(req.user.user_id),period,scope:{source:scope.source||'all'},
   runId:'modules:'+String(req.user.user_id)+':'+Math.floor(Date.now()/120000)};
 };
 router.get('/business-modules',handle(async(req,res)=>{
  const base=context(req);
  res.json({version:'growth-business-modules-v1',modules:registry.listBusinessModules(base),
   noExternalWrites:true,paidCalls:0});
 }));
 router.post('/business-modules/plan',handle(async(req,res)=>{
  const plan=require('../ai/growth/modulePlanner').makePlan(registry,moduleContext(req),{
   mode:req.body.mode||'full',goal:req.body.goal||'activation',
   question:req.body.question||'',moduleIds:req.body.moduleIds??null,
   maxCalls:req.body.maxCalls??6});
  res.json(plan);
 }));
 router.post('/business-modules/investigate',handle(async(req,res)=>{
  const base=moduleContext(req),planner=require('../ai/growth/modulePlanner');
  const plan=planner.makePlan(registry,base,{
   mode:req.body.mode||'full',goal:req.body.goal||'activation',
   question:req.body.question||'',moduleIds:req.body.moduleIds??null,
   maxCalls:req.body.maxCalls??6});
  const result=await planner.runPlan(registry,base,plan);
  res.json({plan,result,modelCalls:0,externalWrites:0});
 }));
 router.get('/opportunities',handle(async(req,res)=>{
  const ownerId=String(req.user.user_id);
  const opts={status:req.query.status||null,limit:req.query.limit?Number(req.query.limit):50};
  res.json({version:'growth-opportunities-v1',...opportunities.ranked(ownerId,opts)});
 }));
 router.get('/opportunities/:id',handle(async(req,res)=>{
  const ownerId=String(req.user.user_id);
  const item=opportunities.get(ownerId,req.params.id);
  res.status(item?200:404).json(item||{error:'机会不存在或无权限'});
 }));
 router.get('/opportunities/:id/history',handle(async(req,res)=>{
  res.json({history:opportunities.history(String(req.user.user_id),req.params.id)});
 }));
 router.post('/opportunities',handle(async(req,res)=>{
  const item=opportunities.upsert(String(req.user.user_id),req.body||{});
  res.status(item.created?201:200).json(item);
 }));
 router.post('/opportunities/import-analysis/:id',handle(async(req,res)=>{
  const ownerId=String(req.user.user_id);
  const records=require('../db/aiRecords');
  const analysis=await records.getAnalysisRecord(req.params.id,ownerId);
  if(!analysis)return res.status(404).json({error:'分析不存在或无权限'});
  if(analysis.status!=='completed')return res.status(409).json({error:'仅允许归档已完成且有证据的分析'});
  const rows=(await records.listSuggestionsByAnalysis(req.params.id,ownerId)).slice(0,20);
  const parse=value=>{if(typeof value!=='string')return value;try{return JSON.parse(value)}catch{return null}};
  const source=parse(analysis.business_scope)?.source||'all';
  const scope={source};
  const period={start:Number(analysis.date_range_start),end:Number(analysis.date_range_end),
   timezone:'Asia/Bangkok'};
  require('../analytics/businessPriorities').validateRange(period.start,period.end);
  const modules={get_seo_performance:'growth.seo',get_channels:'growth.acquisition',
   get_funnel:'growth.activation',get_paths:'growth.activation',
   get_product_chain:'growth.activation',get_retention:'growth.retention',
   get_segments:'growth.retention',query_metrics:'growth.retention',
   get_referral:'growth.referral',get_invite_conversion:'growth.referral',
   get_login_conversion:'growth.login',check_data_quality:'growth.quality',
   get_channel_economics:'growth.economics'};
  const inserted=[],updated=[],skipped=[];
  for(const suggestion of rows){
   const report=parse(suggestion.data_evidence);
   const ids=Array.isArray(report?.evidenceIds)?[...new Set(report.evidenceIds)].slice(0,25):[];
   if(!ids.length||ids.some(x=>typeof x!=='string')){
    skipped.push({suggestionId:suggestion.id,reason:'missing_evidence_ids'});continue;
   }
   const records=[];
   let unauthorized=false;
   for(const id of ids){
    try{records.push(evidence.get(id,{ownerId,scope}))}
    catch(e){if(e.status===403||e.status===404){unauthorized=true;break}throw e}
   }
   if(unauthorized){skipped.push({suggestionId:suggestion.id,reason:'evidence_unavailable_or_unauthorized'});continue}
   const issue=String(suggestion.business_problem||'').trim(),action=String(suggestion.action||'').trim();
   if(!issue||!action){skipped.push({suggestionId:suggestion.id,reason:'missing_problem_or_action'});continue}
   const moduleId=records.map(e=>modules[e.query?.tool]||
    ({seo_search:'growth.seo',channels:'growth.acquisition',funnel:'growth.activation',
      retention:'growth.retention',referral:'growth.referral',invite_conversion:'growth.referral',
      login_conversion:'growth.login',quality:'growth.quality'}[e.metricId])).find(Boolean)||'growth.quality';
   const item=opportunities.upsert(ownerId,{
    moduleId,moduleVersion:registry.listBusinessModules({ownerId,scope,period})
     .find(m=>m.moduleId===moduleId)?.version||null,
    origin:{analysisId:req.params.id,suggestionId:suggestion.id},
    subject:issue.slice(0,256),issue:issue.slice(0,1200),
    action:action.slice(0,1000),hypothesis:String(suggestion.hypothesis||'原因待验证').slice(0,1000),
    evidenceIds:ids,confidence:'unknown',impact:{affectedUsers:null},effort:{hours:null},
    goalId:null,goalVersion:null,metricId:null,definitionVersion:null,scope,period
   });
   (item.created?inserted:updated).push({id:item.id,suggestionId:suggestion.id});
  }
  res.json({analysisId:req.params.id,inserted,updated,skipped,modelCalls:0,
   caveat:'归档只是证据关联；未声称新建议的效果、投入或因果已被证实'});
 }));
 router.post('/opportunities/:id/promote',handle(async(req,res)=>{
  // Human-accepted opportunity -> existing workspace problem and proposed
  // action. This does not execute business changes or publish anything.
  const ownerId=String(req.user.user_id);
  const item=opportunities.get(ownerId,req.params.id);
  if(!item)return res.status(404).json({error:'机会不存在或无权限'});
  if(item.status!=='accepted')return res.status(409).json({error:'请先人工采纳机会'});
  const assignee=req.body?.assignee;
  if(typeof assignee!=='string'||!assignee.trim()||assignee.length>120)
   return res.status(400).json({error:'必须明确行动负责人'});
  const workspace=require('../ai/growth/workspace/store').workspaceStore(db);
  const bridge=require('../ai/growth/workspace/legacyEvidenceBridge');
  for(const id of item.evidenceIds){
   const legacy=evidence.get(id,{ownerId,scope:item.scope});
   bridge.importExistingEvidence(workspace,ownerId,legacy);
  }
  const problem=workspace.observeProblem(ownerId,{
   type:'hypothesis',subject:item.subject,scope:item.scope,
   metricId:item.metricId||null,goalId:item.goalId||null,
   goalVersion:item.goalVersion?Number(item.goalVersion):null,
   description:item.issue,priority:2,evidenceIds:item.evidenceIds,
   impact:{status:'unknown',agentOpportunityId:item.id},
   nextStep:item.action
  });
  const existing=workspace.actions(ownerId,{limit:200}).find(a=>
   a.problem_id===problem.id&&a.description===item.action&&a.assignee===assignee.trim());
  const action=existing||workspace.createAction(ownerId,problem.id,{
   description:item.action,assignee:assignee.trim(),metricId:item.metricId||null,
   definitionVersion:item.definitionVersion||null
  });
  res.json({problemId:problem.id,actionId:action.id,
   reused:!!existing,modelCalls:0,externalActions:0,
   note:'只创建人工待办；实际执行时间和观察期必须后续人工记录'});
 }));
 router.post('/opportunities/:id/status',handle(async(req,res)=>{
  const item=opportunities.decide(String(req.user.user_id),req.params.id,req.body||{});
  res.json(item);
 }));
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

const express=require('express');
const router=express.Router();
const service=require('../services/businessReport').createService();
const store=require('../db/businessReports').createStore(require('../db/connection'));
const run=fn=>async(req,res)=>{try{await fn(req,res)}catch(error){res.status(error.status||503).json({error:error.message})}};
const failure=(message,status=400)=>Object.assign(Error(message),{status});
function reportFor(req){const r=store.get(req.params.id,req.user.user_id);if(!r)throw failure('业务报告不存在或无权访问',404);return r;}
router.get('/reports',run(async(req,res)=>res.json({reports:store.list(req.user.user_id)})));
router.post('/reports',run(async(req,res)=>{
  const {title,start,end,businessScope,focusGoal,question=''}=req.body;
  if(typeof title!=='string'||!title.trim()||title.length>200||typeof question!=='string'||question.length>5000)throw failure('标题或业务背景无效');
  const report=await service.build({start,end,businessScope,focusGoal,question});
  res.status(201).json({...store.save(req.user.user_id,title.trim(),report),actions:[]});
}));
router.get('/reports/:id',run(async(req,res)=>res.json({...reportFor(req),actions:store.actions(req.params.id,req.user.user_id)})));
router.post('/reports/:id/actions',run(async(req,res)=>{
  const report=reportFor(req),{candidateId,title,priority,note=''}=req.body;
  if(typeof candidateId!=='string'||typeof title!=='string'||!title.trim()||title.length>1000||typeof note!=='string'||note.length>5000||!['P0','P1','P2'].includes(priority))throw failure('请填写事项、人工优先级和有效的行动记录');
  res.status(201).json(store.saveAction(report,req.user.user_id,{candidateId,title:title.trim(),priority,note}));
}));
router.put('/reports/:id/actions/:actionId',run(async(req,res)=>{
  reportFor(req);const action=store.getAction(req.params.actionId,req.user.user_id);
  if(!action||action.report_id!==req.params.id)throw failure('行动不存在或无权访问',404);
  const {status,note='',executedAt}=req.body;
  if(!['pending','executing','executed','rejected'].includes(status)||typeof note!=='string'||note.length>5000)throw failure('行动状态或说明无效');
  if(['executed','rejected'].includes(status)&&!note.trim())throw failure('请记录实际执行的内容或拒绝原因');
  if(executedAt!=null&&(!Number.isSafeInteger(executedAt)||executedAt<0||executedAt>Date.now()))throw failure('执行时间无效');
  res.json(store.updateAction(action.id,req.user.user_id,{status,note,executedAt}));
}));
router.post('/reports/:id/actions/:actionId/review',run(async(req,res)=>{
  const report=reportFor(req),action=store.getAction(req.params.actionId,req.user.user_id);
  if(!action||action.report_id!==report.id)throw failure('行动不存在或无权访问',404);
  if(action.status!=='executed')throw failure('请先记录实际执行的行动');
  const review=await service.review(report,action);
  res.json(store.saveReview(action.id,req.user.user_id,review,action));
}));
module.exports=router;

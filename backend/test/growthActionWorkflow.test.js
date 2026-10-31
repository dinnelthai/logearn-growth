'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateActionTransition,validateExecutionPlan,formatActionExecutionPlan}=require('../src/ai/growth/actionWorkflow');
const {classifyReview,earliestReviewAt,buildReviewQueue}=require('../src/ai/growth/reviewQueue');
const DAY=86400000, OFFSET=7*3600000;
test('a suggestion must be human approved and executing before execution',()=>{
 for(const [from,to] of [['pending','adopted'],['adopted','executing'],['executing','executed']]){
   const result=validateActionTransition(from,to,{actualAction:'实际操作'});
   assert.equal(result.externalAction,false);
 }
 assert.throws(()=>validateActionTransition('pending','executed',{actualAction:'jump'}),/不允许/);
 assert.throws(()=>validateActionTransition('adopted','executed',{actualAction:'jump'}),/不允许/);
 assert.throws(()=>validateActionTransition('executing','executed'),/实际行动/);
 assert.throws(()=>validateActionTransition('pending','rejected'),/原因/);
 assert.throws(()=>validateActionTransition('executed','adopted'),/不允许/);
});
test('review waits for three complete Bangkok business days and data watermark',()=>{
 const executed=Date.parse('2026-10-20T08:30:00Z');
 const first=earliestReviewAt(executed);
 // Business effect window begins at next Bangkok midnight.
 assert.equal(new Date(first).toISOString(),'2026-10-23T17:00:00.000Z');
 const row={id:'suggestion-1',user_status:'executed',executed_at:executed};
 const ready=classifyReview(row,{now:first,watermark:first});
 assert.equal(ready.status,'ready');
 assert.equal(ready.periods.days,3);
 assert.equal(classifyReview(row,{now:first,watermark:first-1}).status,'waiting');
 assert.equal(classifyReview({...row,user_status:'adopted'},{now:first+DAY}).status,'not-eligible');
});
test('review queue is read-only and only includes executed suggestions',()=>{
 const now=Date.parse('2026-10-27T12:00:00Z');
 const rows=[{id:'a',analysis_id:'x',business_problem:'激活入口',priority:'P1',user_status:'executed',executed_at:now-12*DAY},
 {id:'b',analysis_id:'x',business_problem:'拒绝的建议',user_status:'rejected',executed_at:now-12*DAY},
 {id:'c',analysis_id:'y',business_problem:'刚执行',priority:'P0',user_status:'executed',executed_at:now-DAY}];
 const before=JSON.stringify(rows);
 const result=buildReviewQueue(rows,{now,watermark:now});
 assert.equal(result.length,2);assert.equal(result[0].suggestionId,'a');assert.equal(result[0].status,'ready');
 assert.equal(result[1].status,'waiting');
 assert.equal(JSON.stringify(rows),before);
});

test('execution brief requires bounded ownership, effort, steps and review conditions',()=>{
 const plan={ownerRole:'Growth 负责人',effort:'约1人日，需先确认',resourceNeeds:['现有站内漏斗数据'],
  dependencies:['登录事件口径已确认'],steps:['核对成熟分母','检查首次分析步骤','小范围验证'],
  target:'先验证登录到首次分析的主要损失点',successCriteria:'成熟队列转化率可复核且不低于基线',
  suggestedObservationDays:7,stopConditions:['数据覆盖不足时停止','关键指标恶化时回滚']};
 assert.equal(validateExecutionPlan(plan),plan);
 const rendered=formatActionExecutionPlan('优化首次分析引导',plan);
 assert.match(rendered,/负责人角色：Growth 负责人/);
 assert.match(rendered,/观察窗口：7天/);
 assert.match(rendered,/停止\/回滚条件/);
 assert.throws(()=>validateExecutionPlan({...plan,steps:[]}),/执行计划/);
 assert.throws(()=>validateExecutionPlan({...plan,suggestedObservationDays:90}),/执行计划/);
});
test('legacy action without a structured plan remains readable and unchanged',()=>{
 assert.equal(formatActionExecutionPlan('复核登录漏斗',null),'复核登录漏斗');
});

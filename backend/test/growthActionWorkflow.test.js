'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateActionTransition}=require('../src/ai/growth/actionWorkflow');
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
 const ready=classifyReview(row,{now:first+DAY,watermark:first+DAY});
 assert.equal(ready.status,'ready');
 assert.equal(ready.periods.days,3);
 assert.equal(classifyReview(row,{now:first+DAY,watermark:first-1}).status,'waiting');
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

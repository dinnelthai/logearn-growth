'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {getCostBreakdown}=require('../src/ai/growth/costAudit');
test('owner-scoped bounded cost audit returns calls and token hot spots',async()=>{
 const seen=[],db={query:async(sql,args)=>{
  seen.push({sql,args});
  return seen.length===1?{rows:[{calls:2,input_tokens:'800',
    output_tokens:'200',total_tokens:'1000',known_cost:'0.017',unknown_cost_calls:1}]}:
   {rows:[{operation_type:'analysis',operation_id:'task-1',calls:2,total_tokens:1000,unknown_cost_calls:1}]}
 }};
 const now=Date.parse('2026-10-28T12:00:00Z');
 const out=await getCostBreakdown({ownerId:'alice',days:7,now,db});
 assert.equal(out.total.totalTokens,1000);
 assert.equal(out.total.unknownCostCalls,1);
 assert.equal(out.topOperations[0].operationId,'task-1');
 assert.equal(out.readOnly,true);
 for(const x of seen){
  assert.match(x.sql,/FROM ai_usage_logs WHERE owner_id=\$1/);
  assert.equal(x.args[0],'alice');assert.equal(x.args[1],now-7*86400000);
  assert.equal(x.args[2],now);assert.doesNotMatch(x.sql,/INSERT|UPDATE|DELETE/i);
 }
});
test('invalid audit parameters fail before database access',async()=>{
 const db={query:async()=>{throw Error('must not query')}};
 await assert.rejects(getCostBreakdown({ownerId:'',db}),/参数/);
 await assert.rejects(getCostBreakdown({ownerId:'alice',days:365,db}),/参数/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const CostTracker=require('../src/ai/llm/costTracker');
test('unknown-price calls do not silently consume zero dollars',async()=>{
 const t=new CostTracker();
 t.getTodayStats=async()=>[{total_cost:'0',unknown_cost_calls:'1'}];
 await assert.rejects(t.checkDailyLimit(5,'alice'),/价格未知/);
 t.getTodayStats=async()=>[{total_cost:'1.5',unknown_cost_calls:'0'}];
 assert.equal(await t.checkDailyLimit(5,'alice'),1.5);
});

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {dailyAutonomyLimit,beginAutonomyPaidCall}=require('../src/ai/growth/autonomyBudget');
test('autonomy paid budget defaults to zero and fails closed before touching DB',async()=>{
 assert.equal(dailyAutonomyLimit({}),0);
 assert.equal(dailyAutonomyLimit({AI_AUTONOMY_PAID_CALLS_PER_DAY:'12'}),12);
 assert.throws(()=>dailyAutonomyLimit({AI_AUTONOMY_PAID_CALLS_PER_DAY:'-1'}),/配置无效/);
 assert.throws(()=>dailyAutonomyLimit({AI_AUTONOMY_PAID_CALLS_PER_DAY:'101'}),/0到100/);
 await assert.rejects(beginAutonomyPaidCall({analysisId:'a',ownerId:'o',token:'x',round:0,limit:0,
  connectionPool:{connect(){throw Error('must not connect')}}}),/开关|预算/);
});

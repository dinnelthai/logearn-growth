const {test}=require('node:test'),assert=require('node:assert/strict'),{tokenUsage}=require('../src/data/activityAi')
test('tokens use real usage, never credit cost; partial coverage is explicit',()=>{assert.deepEqual(tokenUsage([{detail:JSON.stringify({usage:{prompt_tokens:10,completion_tokens:3}})},{detail:JSON.stringify({credit_cost:500})},{detail:'bad'}]),{tokens:13,covered:1,records:3});assert.equal(tokenUsage([]).tokens,null);assert.equal(tokenUsage([{detail:'{"usage":{"total_tokens":0}}'}]).tokens,0)})
test('Credits aggregate ledger charges independently of token usage',async()=>{
 const remote=require('../src/data/hologres'),original=remote.query
 remote.query=async sql=>sql.includes('COUNT(DISTINCT user_key)')?[{users:'1',starts:'3',strategy_types:'2',last_started_at:'1500'}]:[{credit_cost:'12'},{credit_cost:'8'},{credit_cost:'-3'}]
 try{const r=await require('../src/data/activityAi').activityAi({snapshot_cutoff:new Date(2000).toISOString(),as_of:new Date(2000).toISOString()},['132'],{start:1000,end:2000});assert.equal(r.credits,20);assert.equal(r.starts,3);assert.equal(r.strategy_types,2);assert.equal(r.credit_records,3)}finally{remote.query=original}
})

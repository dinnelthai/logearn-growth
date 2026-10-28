'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildPilot,threadId,validateRequest,TOOL_SET}=require('../src/ai/graph/growthPilot');
test('graph thread identity binds owner, problem and run; tool shortlist remains read-only',()=>{
 assert.notEqual(threadId('alice','problem','run'),threadId('bob','problem','run'));
 assert.equal(threadId('alice','problem','run'),threadId('alice','problem','run'));
 assert.deepEqual(TOOL_SET,['check_data_quality','get_funnel','get_retention']);
 assert.throws(()=>validateRequest({ownerId:'alice',problemId:'p',runId:'r',start:1,end:9999999999999}),/范围无效/);
});
test('LangGraph trial fails closed without verified feature flag and persistent database',async()=>{
 await assert.rejects(()=>buildPilot({enabled:false}),/默认关闭/);
 const previous=process.env.GROWTH_LANGGRAPH_PILOT_ENABLED;process.env.GROWTH_LANGGRAPH_PILOT_ENABLED='1';
 try{await assert.rejects(()=>buildPilot({enabled:true,registry:{executeTool(){}},store:{run(){}},hasPaidCalls(){return false},postgresConnectionString:'sqlite:memory'}),/PostgreSQL/)}
 finally{if(previous==null)delete process.env.GROWTH_LANGGRAPH_PILOT_ENABLED;else process.env.GROWTH_LANGGRAPH_PILOT_ENABLED=previous}
});

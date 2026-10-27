'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const recordsPath=require.resolve('../src/db/aiRecords');
const alertPath=require.resolve('../src/ai/growth/alertStore');
const proposalPath=require.resolve('../src/ai/growth/investigationStore');
const remotePath=require.resolve('../src/data/hologres');
const queuePath=require.resolve('../src/queues/queues');
let charged=0;
const day=Date.parse('2026-10-26T17:00:00Z');
require.cache[recordsPath]={id:recordsPath,filename:recordsPath,loaded:true,exports:{
 listAnalysisRecords:async()=>[],
 listSuggestions:async()=>[],
 listPendingReviewSuggestions:async()=>[]
}};
require.cache[alertPath]={id:alertPath,filename:alertPath,loaded:true,exports:{
 createAlertStore:()=>({list:async(owner)=>owner==='alice'?[
  {id:'alert',status:'open',metric:'active_users',priority:'P0',snooze_until:null,last_period_end:day}
 ]:[]})
}};
require.cache[proposalPath]={id:proposalPath,filename:proposalPath,loaded:true,exports:{
 createInvestigationStore:()=>({list:async(owner)=>owner==='alice'?[
  {id:'proposal',alert_id:'alert',period_end:day,last_period_end:day,
   status:'proposed',alert_status:'open',metric:'active_users'}
 ]:[]})
}};
require.cache[remotePath]={id:remotePath,filename:remotePath,loaded:true,exports:{
 status:async()=>({as_of:'2026-10-27T17:00:00Z'})
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 addAIAnalysisJob(){charged++;throw Error('inbox must be read-only')},
 getJobStatus:async()=>({exists:false})
}};
const router=require('../src/routes/aiAnalysis');
test('Growth inbox HTTP consolidates proposal and alert for owner without provider calls',async()=>{
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});
 app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const endpoint='http://127.0.0.1:'+server.address().port+'/api/ai-analysis/growth-inbox';
 try{
  const a=await fetch(endpoint);assert.equal(a.status,200);
  const result=await a.json();assert.equal(result.counts.total,1);
  assert.equal(result.counts.proposalApprovals,1);
  assert.equal(result.counts.alerts,0);
  assert.equal(result.tasks[0].proposalId,'proposal');
  assert.equal(result.paidCalls,0);assert.equal(result.externalActions,0);
  const b=await fetch(endpoint,{headers:{'x-owner':'bob'}});
  assert.equal(b.status,200);assert.equal((await b.json()).counts.total,0);
  assert.equal(charged,0);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

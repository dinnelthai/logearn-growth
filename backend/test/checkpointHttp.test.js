const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const recordsPath=require.resolve('../src/db/aiRecords');
const queuePath=require.resolve('../src/queues/queues');
const tracePath=require.resolve('../src/ai/business/trace');
const connectionPath=require.resolve('../src/db/connection');
const calls=[{round:0,status:'received',prompts:{analysis:'hash'},result:{responseContent:JSON.stringify({investigations:[{tool:'get_paths'}]}),investigations:[]}}];
require.cache[recordsPath]={id:recordsPath,filename:recordsPath,loaded:true,exports:{
 async getAnalysisRecord(id,owner){return id==='a1'&&owner==='alice'?{id:'a1',status:'failed'}:null}
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{getJobStatus:async()=>({exists:false})}};
require.cache[connectionPath]={id:connectionPath,filename:connectionPath,loaded:true,exports:{}};
require.cache[tracePath]={id:tracePath,filename:tracePath,loaded:true,exports:{
 createTraceStore(){return {list(owner){assert.equal(owner,'alice');return calls}}}
}};
const router=require('../src/routes/aiAnalysis');
test('checkpoint diagnostics are owner-gated and never reveal raw responses',async()=>{
 const app=express();app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/api/ai-analysis/jobs/a1/checkpoint';
  const ok=await fetch(url),body=await ok.json();
  assert.equal(ok.status,200);assert.equal(body.state,'partial-tools');assert.equal(body.pendingTools,1);
  assert.equal(body.canAutoResume,false);
  assert.equal(JSON.stringify(body).includes('get_paths'),false);
  const denied=await fetch(url,{headers:{'x-owner':'bob'}});
  assert.equal(denied.status,404);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

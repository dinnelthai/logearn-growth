'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const timelinePath=require.resolve('../src/ai/growth/investigationTimeline');
const recordsPath=require.resolve('../src/db/aiRecords');
const queuePath=require.resolve('../src/queues/queues');
let detailCalls=0,paidCalls=0;
const snapshot={
 version:'growth-investigation-timeline-v1',stage:'awaiting-retrospective',
 proposal:{id:'p',alertId:'a',status:'approved',version:2},
 alert:{id:'a',metric:'active_users',priority:'P0',source:'all'},
 originalObservation:{baseline:100,observed:55,evidence:{baselineAnalysisId:'b',currentAnalysisId:'c'}},
 analysis:{id:'analysis',status:'completed',summary:'Data checked',evidenceIds:['evidence-1']},
 actions:[{id:'s',status:'executed'}],retrospectives:[],
 counts:{suggestions:1,executed:1,retrospectives:0},readOnly:true,paidCalls:0,externalActions:0
};
require.cache[timelinePath]={id:timelinePath,filename:timelinePath,loaded:true,exports:{
 createInvestigationTimeline:()=>({async get(owner,id){
   detailCalls++;
   return owner==='alice'&&id==='p'?snapshot:null;
 }})
}};
require.cache[recordsPath]={id:recordsPath,filename:recordsPath,loaded:true,exports:{}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 addAIAnalysisJob(){paidCalls++;throw Error('read-only timeline must not enqueue')},
 getJobStatus:async()=>({exists:false})
}};
const router=require('../src/routes/aiAnalysis');
test('investigation timeline HTTP is owner-scoped and never creates paid work',async()=>{
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});
 app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const endpoint='http://127.0.0.1:'+server.address().port+'/api/ai-analysis/growth-investigations/';
 try{
  let response=await fetch(endpoint+'p');assert.equal(response.status,200);
  let body=await response.json();assert.equal(body.stage,'awaiting-retrospective');
  assert.equal(body.originalObservation.baseline,100);
  assert.equal(body.readOnly,true);assert.equal(body.paidCalls,0);
  response=await fetch(endpoint+'p',{headers:{'x-owner':'bob'}});
  assert.equal(response.status,404);
  response=await fetch(endpoint+'missing');assert.equal(response.status,404);
  assert.equal(detailCalls,3);assert.equal(paidCalls,0);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

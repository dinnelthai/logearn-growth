'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const servicePath=require.resolve('../src/ai/growth/gscService');
const queuePath=require.resolve('../src/queues/queues');
const original={id:'gsc-owner-a',site_url:'sc-domain:logearn.com',
 start_date:'2026-10-18',end_date:'2026-10-19'};
let syncCount=0,paidCalls=0,selectCount=0;
const forbidden=()=>{throw Object.assign(Error('site access denied'),{status:403})};
require.cache[servicePath]={id:servicePath,filename:servicePath,loaded:true,exports:{
 createGscService:()=>({
  async connection(owner){return owner==='alice'?{
   configured:true,selectedSite:'sc-domain:logearn.com',sites:[{
    siteUrl:'sc-domain:logearn.com',permissionLevel:'siteOwner'}]
  }:{configured:false,sites:[],selectedSite:null}},
  async select(owner,siteUrl){if(owner!=='alice'||siteUrl!=='sc-domain:logearn.com')
    forbidden();
   selectCount++;return {selectedSite:siteUrl};
  },
  async latest(owner,params){return owner==='alice'?original:null},
  async sync(owner,window){if(owner!=='alice')forbidden();
   assert.equal(window.startDate,'2026-10-18');
   syncCount++;return {cached:false,report:{available:true,source:'gsc-api',
    metrics:{clicks:10,impressions:100},coverage:{status:'reported-final-dates'}}};
  }
 }),
 summarizeGsc:s=>({available:true,source:'gsc-api',
  snapshotId:s.id,metrics:{clicks:10,impressions:100},
  coverage:{status:'reported-final-dates'}})
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 async addAIAnalysisJob(){paidCalls++;throw Error('GSC API must not call paid queue')},
 async getJobStatus(){return {exists:false}}
}};
const router=require('../src/routes/aiAnalysis');
test('GSC property settings, reports and syncing are owner-scoped and do not create AI tasks',async()=>{
 const app=express();app.use(express.json());app.use((req,_res,next)=>{
  req.user={user_id:req.headers['x-owner']||'alice'};next();
 });app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
 const base='http://127.0.0.1:'+server.address().port+'/api/ai-analysis';
 async function call(path,{owner='alice',method='GET',body}={}){
  const response=await fetch(base+path,{
   method,headers:{'Content-Type':'application/json','x-owner':owner},
   body:body?JSON.stringify(body):undefined
  });
  return {status:response.status,body:await response.json()};
 }
 try{
  let r=await call('/growth-seo/gsc/connection');
  assert.equal(r.status,200);
  assert.equal(r.body.selectedSite,'sc-domain:logearn.com');
  assert.equal(r.body.readOnly,true);assert.equal(r.body.paidCalls,0);
  r=await call('/growth-seo/gsc/connection',{owner:'bob'});
  assert.equal(r.status,200);assert.deepEqual(r.body.sites,[]);
  r=await call('/growth-seo/gsc/settings',{
   method:'PUT',owner:'bob',body:{siteUrl:'sc-domain:logearn.com'}
  });
  assert.equal(r.status,403);assert.equal(selectCount,0);
  r=await call('/growth-seo/gsc/settings',{
   method:'PUT',body:{siteUrl:'sc-domain:logearn.com'}
  });
  assert.equal(r.status,200);assert.equal(selectCount,1);
  r=await call('/growth-seo/gsc/report');
  assert.equal(r.status,200);assert.equal(r.body.report.metrics.clicks,10);
  r=await call('/growth-seo/gsc/report',{owner:'bob'});
  assert.equal(r.status,200);assert.equal(r.body.available,false);
  r=await call('/growth-seo/gsc/sync',{method:'POST',owner:'bob',
   body:{startDate:'2026-10-18',endDate:'2026-10-19'}});
  assert.equal(r.status,403);
  r=await call('/growth-seo/gsc/sync',{method:'POST',
   body:{startDate:'2026-10-18',endDate:'2026-10-19'}});
  assert.equal(r.status,200);assert.equal(r.body.report.source,'gsc-api');
  assert.equal(r.body.paidCalls,0);assert.equal(syncCount,1);assert.equal(paidCalls,0);
 }finally{await new Promise(resolve=>server.close(resolve))}
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const seoPath=require.resolve('../src/ai/growth/seoStore');
const kolPath=require.resolve('../src/ai/growth/kolReader');
const queuePath=require.resolve('../src/queues/queues');
const start=Date.parse('2026-10-18T00:00:00Z'),end=Date.parse('2026-10-19T00:00:00Z');
let writes=0,reads=0,paid=0;
const row={id:'gsc-1',owner_id:'alice',site_url:'https://logearn.com/',
 start_date:'2026-10-18',end_date:'2026-10-18',rows:[],row_count:1,imported_at:10};
require.cache[seoPath]={id:seoPath,filename:seoPath,loaded:true,exports:{
 createSeoStore:()=>({
  list:async owner=>owner==='alice'?[{id:'gsc-1',site_url:'https://logearn.com/'}]:[],
  importSnapshot:async(owner,data)=>{writes++;return {id:'gsc-1',created:true,siteUrl:data.siteUrl,owner}},
  get:async(owner,id)=>owner==='alice'&&id==='gsc-1'?row:null
 }),
 summarizeSeo:(_row,args)=>({available:true,source:'gsc-manual-export',startDate:args.startDate,
  coverage:{status:'export-limited',completeSearchTraffic:false},metrics:{clicks:2}})
}};
require.cache[kolPath]={id:kolPath,filename:kolPath,loaded:true,exports:{
 createKolReader:()=>({summarize:async args=>{
  reads++;return {available:true,ownerId:args.ownerId,coverage:{status:'partial'},
   rows:[{id:'kol-a',analysisEvents:12,volumeUsd:null}]};
 }})
}};
require.cache[queuePath]={id:queuePath,filename:queuePath,loaded:true,exports:{
 addAIAnalysisJob(){paid++;throw Error('no paid queue allowed')},
 getJobStatus:async()=>({exists:false})
}};
const router=require('../src/routes/aiAnalysis');
test('SEO import/preview and KOL previews are authenticated, owner-scoped and paid-free',async()=>{
 const app=express();app.use(express.json());app.use((req,_res,next)=>{
  req.user={user_id:req.headers['x-owner']||'alice'};next();
 });app.use('/api/ai-analysis',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api/ai-analysis';
 async function send(path,{owner='alice',method='GET',body}={}){
  const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json','x-owner':owner},
   body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
 }
 try{
  let r=await send('/growth-seo/imports');
  assert.equal(r.status,200);assert.equal(r.data.imports.length,1);
  r=await send('/growth-seo/imports',{owner:'bob'});
  assert.equal(r.status,200);assert.equal(r.data.imports.length,0);
  r=await send('/growth-seo/preview',{method:'POST',body:{snapshotId:'gsc-1'}});
  assert.equal(r.status,200);assert.equal(r.data.report.coverage.completeSearchTraffic,false);
  r=await send('/growth-seo/preview',{owner:'bob',method:'POST',body:{snapshotId:'gsc-1'}});
  assert.equal(r.status,404);
  r=await send('/growth-seo/import',{method:'POST',body:{siteUrl:'https://logearn.com/'}});
  assert.equal(r.status,201);assert.equal(writes,1);
  r=await send('/growth-kol/preview',{method:'POST',body:{start,end,source:'all'}});
  assert.equal(r.status,200);assert.equal(r.data.report.rows[0].analysisEvents,12);
  r=await send('/growth-kol/preview',{owner:'bob',method:'POST',body:{start,end}});
  assert.equal(r.status,200);assert.equal(r.data.report.ownerId,'bob');
  r=await send('/growth-kol/preview',{method:'POST',body:{start,end,source:'twitter'}});
  assert.equal(r.status,400);
  assert.equal(reads,2);assert.equal(paid,0);
 }finally{await new Promise(r=>server.close(r))}
});

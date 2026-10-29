'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {getExtensions,configuration,bindingFor,readRankings}=require('../src/ai/business/tools/openseoConnector');
const projectId='11111111-1111-4111-8111-111111111111';
const trackerId='22222222-2222-4222-8222-222222222222';
const env={OPENSEO_ENABLED:'1',OPENSEO_MCP_URL:'http://127.0.0.1:4100/mcp',
 OPENSEO_MCP_ALLOWED_HOSTS:'127.0.0.1',OPENSEO_ALLOW_LOOPBACK:'1',
 OPENSEO_API_KEY:'local-test-key',
 OPENSEO_PROJECT_BINDINGS:JSON.stringify({alice:{projectId,trackerId}})};
function fixture({rank=3,session=true,failed=false,notFound=false}={}){
 const calls=[],responses=[
  {jsonrpc:'2.0',result:{protocolVersion:'2025-06-18'}},
  {jsonrpc:'2.0',result:{tools:[{name:'get_rank_tracker'},{name:'run_rank_tracker'}]}},
  {jsonrpc:'2.0',result:{structuredContent:{config:{id:trackerId},
   results:{rows:[{keyword:'logearn',desktop:{position:notFound?null:rank}}],
    totalCount:1,offset:0,limit:30,nextOffset:null,
    run:{status:failed?'failed':'completed',completedAt:'2026-10-19T08:00:00Z'}}}}}
 ];
 const fetchImpl=async(url,opt)=>{
  assert.equal(url,env.OPENSEO_MCP_URL);
  assert.equal(opt.redirect,'manual');
  assert.equal(opt.headers.Authorization,'Bearer local-test-key');
  const data=opt.body?JSON.parse(opt.body):null;
  calls.push(data||{method:opt.method});
  if(opt.method==='DELETE')return new Response('',{status:200});
  if(data?.method==='notifications/initialized')return new Response('',{status:202});
  const msg=responses.shift();
  return new Response(JSON.stringify({...msg,id:data.id}),
   {status:200,headers:{'content-type':'application/json',
    ...(session?{'mcp-session-id':'test-session'}:{})}});
 };
 return {fetchImpl,calls};
}
test('disabled, malformed URL and foreign owner cannot use OpenSEO',()=>{
 assert.equal(configuration({...env,OPENSEO_ENABLED:'0'}),null);
 assert.equal(configuration({...env,OPENSEO_MCP_URL:'http://example.com/mcp'}),null);
 assert.equal(configuration({...env,OPENSEO_MCP_URL:'http://127.0.0.1:4100/mcp',
  OPENSEO_MCP_ALLOWED_HOSTS:'attacker.example'}),null);
 assert.equal(bindingFor(env,{ownerId:'bob'}),null);
 assert.equal(bindingFor(env,{ownerId:'alice'}).projectId,projectId);
 assert.equal(getExtensions({...env,OPENSEO_ENABLED:'0'})[0].enabled(),false);
});
test('initialize, list, safe read, and close session without charged tools',async()=>{
 const mock=fixture(),binding=bindingFor(env,{ownerId:'alice'});
 const res=await readRankings({env,binding,input:{limit:30},fetchImpl:mock.fetchImpl});
 assert.equal(res.rankings[0].rank,3);
 assert.equal(res.checkedAt,'2026-10-19T08:00:00Z');
 assert.deepEqual(mock.calls.filter(x=>x?.method==='tools/call').map(x=>x.params.name),
  ['get_rank_tracker']);
 assert.ok(mock.calls.some(x=>x.method==='DELETE'));
});
test('missing saved position is not below depth; failed checks are not zeros',async()=>{
 const missing=fixture({notFound:true}),binding=bindingFor(env,{ownerId:'alice'});
 const result=await readRankings({env,binding,fetchImpl:missing.fetchImpl});
 assert.equal(result.rankings[0].rank,undefined);
 assert.equal(result.rankings[0].status,'not_found');
 const failed=fixture({failed:true});
 const second=await readRankings({env,binding,fetchImpl:failed.fetchImpl});
 assert.equal(second.status,'run_failed');
 assert.equal(second.rankings[0].rank,undefined);
});
test('project binding cannot be replaced by input or another owner',async()=>{
 await assert.rejects(readRankings({env,binding:{ownerId:'bob',projectId},
  fetchImpl:fixture().fetchImpl}),e=>e.status===403);
 const mock=fixture();
 await readRankings({env,binding:bindingFor(env,{ownerId:'alice'}),input:{offset:0},
  fetchImpl:mock.fetchImpl});
 assert.deepEqual(Object.keys(mock.calls.find(x=>x.method==='tools/call').params.arguments),
  ['projectId','trackerId','offset','limit']);
});
test('auth failure and MCP redirection fail without result fallback',async()=>{
 const b=bindingFor(env,{ownerId:'alice'});
 await assert.rejects(readRankings({env,binding:b,fetchImpl:async()=>new Response('',{status:401})}),
  e=>e.status===403);
 await assert.rejects(readRankings({env,binding:b,fetchImpl:async()=>new Response('',{status:302})}),
  e=>e.status===503);
});

'use strict';
// OpenSEO every-app/open-seo get_rank_tracker, read-only saved snapshots only.
// No client-provided URL, projectId, trackerId, credentials, or arbitrary MCP tool.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(reason,status=503,code='upstream_unavailable')=>{
 throw Object.assign(Error(reason),{status,code});
};
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
function configuration(env=process.env){
 if(env.OPENSEO_ENABLED!=='1')return null;
 try{
  const url=new URL(env.OPENSEO_MCP_URL||'');
  const hosts=(env.OPENSEO_MCP_ALLOWED_HOSTS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(!hosts.includes(url.hostname)||url.username||url.password||url.search||url.hash||
     !url.pathname.endsWith('/mcp')||
     !(url.protocol==='https:'||(url.protocol==='http:'&&local&&env.OPENSEO_ALLOW_LOOPBACK==='1'))||
     !env.OPENSEO_API_KEY)return null;
  const bindings=JSON.parse(env.OPENSEO_PROJECT_BINDINGS||'{}');
  if(!object(bindings))return null;
  return {url:url.href,token:env.OPENSEO_API_KEY,bindings};
 }catch{return null}
}
function bindingFor(env,context){
 const conf=configuration(env),row=conf?.bindings?.[String(context.ownerId)];
 if(!object(row)||!UUID.test(row.projectId||'')||
    row.trackerId!=null&&!UUID.test(row.trackerId))return null;
 return {id:'openseo:'+context.ownerId,ownerId:String(context.ownerId),
  projectId:row.projectId,trackerId:row.trackerId||null,enabled:true};
}
function parseRpc(body,contentType){
 let reply;
 if(contentType.includes('text/event-stream')){
  const messages=body.split(/\r?\n/).filter(line=>line.startsWith('data:'))
   .map(line=>line.slice(5).trim()).filter(line=>line&&line!=='[DONE]');
  if(!messages.length)fail('Invalid MCP SSE response');
  for(const s of messages){try{const data=JSON.parse(s);if(data.id!==undefined)reply=data}catch{}}
 }else if(contentType.includes('application/json')){try{reply=JSON.parse(body)}catch{}}
 if(!object(reply)||reply.jsonrpc!=='2.0')fail('Invalid MCP response');
 return reply;
}
async function readRankings({env=process.env,binding,input={},fetchImpl=fetch,signal}){
 const conf=configuration(env);
 if(!conf||!binding||binding.projectId!==conf.bindings?.[binding.ownerId]?.projectId)
  fail('OpenSEO unavailable or binding changed',403,'permission_denied');
 const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream',
  Authorization:'Bearer '+conf.token};
 let nextId=0,sessionId=null;
 const rpc=async(method,params,notification=false)=>{
  const body={jsonrpc:'2.0',...(notification?{}:{id:++nextId}),method,
   ...(params?{params}:{})};
  const result=await fetchImpl(conf.url,{method:'POST',headers:{
   ...headers,...(sessionId?{'mcp-session-id':sessionId}:{}),
   ...(sessionId?{'mcp-protocol-version':'2025-06-18'}:{})},
   body:JSON.stringify(body),redirect:'manual',signal});
  if(result.status===401||result.status===403)fail('OpenSEO authorization denied',403,'permission_denied');
  if(result.status>=300||result.status<200)fail('OpenSEO HTTP unavailable');
  const newSession=result.headers.get('mcp-session-id');
  if(newSession&&!sessionId&&newSession.length<128&&!/[\r\n]/.test(newSession))sessionId=newSession;
  if(notification)return null;
  const len=Number(result.headers.get('content-length')||0);
  if(len>250000)fail('OpenSEO result too large');
  const text=await result.text();
  if(text.length>250000)fail('OpenSEO result too large');
  const response=parseRpc(text,result.headers.get('content-type')||'');
  if(response.id!==body.id)fail('MCP request id mismatch');
  if(response.error)fail('OpenSEO MCP tool failure');
  if(!object(response.result))fail('OpenSEO MCP result malformed');
  return response.result;
 };
 try{
  await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},
   clientInfo:{name:'logearn-growth',version:'1.0.0'}});
  await rpc('notifications/initialized',undefined,true);
  const catalog=await rpc('tools/list',{});
  if(!Array.isArray(catalog.tools)||!catalog.tools.some(x=>x?.name==='get_rank_tracker'))
   fail('get_rank_tracker not advertised by deployed OpenSEO');
  // Only one hardcoded tool can ever be invoked by this adapter.
  const argumentsObject={projectId:binding.projectId,
   ...(binding.trackerId?{trackerId:binding.trackerId}:{}),
   offset:input.offset??0,limit:input.limit??30};
  const result=await rpc('tools/call',{name:'get_rank_tracker',arguments:argumentsObject});
  if(result.isError===true||!object(result.structuredContent))
   fail('OpenSEO rank tracker result unavailable');
  const data=result.structuredContent;
  if(!binding.trackerId){
   const configs=Array.isArray(data.configs)?data.configs:[];
   return {status:configs.length?'tracker_mapping_required':'not_configured',
    rankings:[],warnings:[configs.length?
     'Tracker ID is not mapped server-side; no rankings queried':'No rank tracker configured']};
  }
  const rows=data.results?.rows;
  const run=data.results?.run;
  if(!Array.isArray(rows)||rows.length>30||
     !Number.isSafeInteger(data.results?.totalCount))fail('Unexpected tracker result schema');
  const checkedAt=typeof run?.completedAt==='string'?run.completedAt:
   typeof run?.lastCheckedAt==='string'?run.lastCheckedAt:
   typeof data.config?.lastCheckedAt==='string'?data.config.lastCheckedAt:null;
  const completed=run?.status==='completed';
  const rankings=rows.map(row=>{
   const desktop=row?.desktop;
   const position=desktop?.position;
   const rank=Number.isSafeInteger(position)&&position>=1&&position<=1000?position:null;
   const keyword=typeof row?.keyword==='string'?row.keyword.slice(0,100):'';
   return {keyword,
    ...(rank!==null&&completed?{rank}:{}),
    status:!completed?'not_checked':rank!==null?'ranked':'not_found',
    ...(checkedAt?{checkedAt:checkedAt.slice(0,40)}:{})};
  }).filter(row=>row.keyword);
  return {status:run?.status==='failed'?'run_failed':!completed?'not_checked':'ok',
   ...(checkedAt?{checkedAt:checkedAt.slice(0,40)}:{}),
   rankings,
   coverage:{status:data.results.totalCount>argumentsObject.offset+rows.length?'partial':'complete'},
   warnings:[
    ...(run?.status==='failed'?['Latest rank check failed; saved results may be stale']:[]),
    ...(data.results.totalCount>argumentsObject.offset+rows.length?
      ['More saved keywords exist; use the next offset']:[])
   ]};
 }finally{
  if(sessionId){
   // Best effort session termination. Never follow redirects or expose credentials.
   try{await fetchImpl(conf.url,{method:'DELETE',headers:{
    Authorization:'Bearer '+conf.token,'mcp-session-id':sessionId},
    redirect:'manual',signal:signal?.aborted?undefined:signal})}catch{}
  }
 }
}
const schema=p=>({type:'object',additionalProperties:false,properties:p});
const outputSchema=schema({
 status:{type:'string',maxLength:40},
 checkedAt:{type:'string',maxLength:40},
 rankings:{type:'array',maxItems:30,items:schema({
  keyword:{type:'string',maxLength:100},
  rank:{type:'integer',minimum:1,maximum:1000},
  status:{type:'string',maxLength:30},
  checkedAt:{type:'string',maxLength:40}
 })},
 coverage:schema({status:{type:'string',maxLength:40}}),
 warnings:{type:'array',maxItems:5,items:{type:'string',maxLength:180}}
});
function getExtensions(env=process.env){
 return [{
  id:'openseo.saved_rankings',version:'1.0.0',provider:'openseo',
  sourceType:'third_party_observation',permission:'owner-read',cost:'none',
  description:'Read existing OpenSEO tracker rankings, no paid tracking or research',
  supportedScopes:['source'],
  inputSchema:schema({offset:{type:'integer',minimum:0,maximum:1000},
   limit:{type:'integer',minimum:1,maximum:30}}),
  outputSchema,
  enabled:()=>!!configuration(env),
  authorize:()=>true,
  connection:context=>bindingFor(env,context),
  execute:(input,_context,binding,signal)=>readRankings({env,binding,input,signal}),
  project:result=>result
 }];
}
module.exports={getExtensions,configuration,bindingFor,readRankings,parseRpc};

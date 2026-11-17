'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCapabilityCatalog}=require('../src/ai/business/tools/capabilityCatalog');
const schema=properties=>({type:'object',additionalProperties:false,properties});
const ctx={ownerId:'alice',scope:{source:'all'},period:{start:1,end:2,timezone:'Asia/Bangkok'},
 taskAllowedTools:['openseo.saved_rankings','local.health_snapshot']};
function extension(id,provider,connection){
 return {id,version:'1.0.0',description:'Reviewed read-only test source',supportedScopes:['source'],
  permission:'owner-read',cost:'none',provider,sourceType:'third_party_observation',
  inputSchema:schema({}),outputSchema:schema({count:{type:'integer',minimum:0}}),
  enabled:()=>true,authorize:(context,binding)=>context.ownerId===binding.ownerId,
  connection,execute:async()=>({count:3,secret:'hidden'}),
  project:raw=>({count:raw.count})};
}
test('second reviewed source uses the same directory and gateway without agent core edits',async()=>{
 let revoked=false;const saved=[];
 const binding=c=>({id:'safe',enabled:!revoked,ownerId:c.ownerId,projectId:'scoped-project'});
 const catalog=createCapabilityCatalog({
  legacyIds:[],assertOwner:c=>{if(!c?.ownerId)throw Error('unauthorized')},
  evidenceStore:{save:e=>saved.push(e)},
  makeExternalEvidence:(payload,context)=>({id:payload.capabilityId+':e',
   ownerId:context.ownerId,value:payload.value,warnings:[]}),
  extensions:[extension('openseo.saved_rankings','openseo',binding),
   extension('local.health_snapshot','local',binding)]
 });
 assert.equal(catalog.list(ctx,()=>[]).length,2);
 const result=await catalog.execute('local.health_snapshot',{},ctx,()=>{throw Error('legacy')});
 assert.equal(result.status,'ok');assert.equal(result.evidence[0].value.count,3);
 assert.equal(result.evidence[0].value.secret,undefined);
 assert.equal(saved.length,1);
 revoked=true;
 assert.equal(catalog.list(ctx,()=>[]).length,0);
 await assert.rejects(()=>catalog.execute('local.health_snapshot',{},ctx,()=>{}),e=>e.status===403);
});
test('wrong owner binding is denied independently from tool appearance',async()=>{
 const extensionWrong=extension('local.health_snapshot','local',()=>({
  id:'connection',enabled:true,ownerId:'bob',projectId:'elsewhere'}));
 const catalog=createCapabilityCatalog({legacyIds:[],extensions:[extensionWrong],
  assertOwner:c=>{if(!c?.ownerId)throw Error('owner missing')}});
 assert.equal(catalog.list(ctx,()=>[]).length,0);
 await assert.rejects(()=>catalog.execute('local.health_snapshot',{},ctx,()=>{}),e=>e.status===403);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createToolRegistry}=require('../src/ai/business/tools/registry');
const {createEvidenceStore,validateClaims}=require('../src/ai/business/evidence');
const {forModel}=require('../src/ai/business/modelEvidence');
const {modelContext}=require('../src/ai/business/modelTransport');
const now=Date.parse('2026-10-20T00:00:00Z');
const ctx={ownerId:'alice',runId:'run-1',scope:{source:'all'},
 period:{start:now-86400000,end:now,timezone:'Asia/Bangkok'},taskAllowedTools:['test.ranks']};
function makeStore(){
 const records=new Map();
 return createEvidenceStore({prepare:sql=>({
  get:(id,who)=>{const v=records.get(id);return v&&(!sql.includes('owner_id=?')||who===v.owner)?{body:v.body}:null},
  run:(id,who,body)=>records.set(id,{owner:who,body})
 })});
}
const outputSchema={type:'object',additionalProperties:false,properties:{
 status:{type:'string',maxLength:30},
 checkedAt:{type:'string',maxLength:40},
 rankings:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,properties:{
  keyword:{type:'string',maxLength:100},rank:{type:'integer',minimum:1,maximum:1000},
  status:{type:'string',maxLength:30},checkedAt:{type:'string',maxLength:40}
 }}}
}};
function registry(store,data){
 return createToolRegistry({lookups:{},evidenceStore:store,extensions:[{
  id:'test.ranks',version:'1.0.0',provider:'openseo',sourceType:'third_party_observation',
  description:'Mock rank snapshot',supportedScopes:['source'],permission:'owner-read',cost:'none',
  inputSchema:{type:'object',additionalProperties:false,properties:{}},outputSchema,
  enabled:()=>true,authorize:()=>true,
  connection:c=>({id:'connection-a',ownerId:c.ownerId,projectId:'project-a',enabled:true}),
  execute:async()=>data,project:x=>x
 }]});
}
test('owner-scoped external evidence is visible via tool, replay store, and both model transports',async()=>{
 const store=makeStore(),data={status:'ok',checkedAt:'2026-10-19T09:00:00Z',
 rankings:[{keyword:'logearn trading',rank:3,status:'ranked'},
  {keyword:'new query',status:'not_checked'},{keyword:'other query',status:'not_found'}]};
 const response=await registry(store,data).executeTool('test.ranks',{},ctx);
 assert.equal(response.status,'ok');
 const id=response.evidence[0].id,stored=store.get(id,ctx);
 assert.equal(stored.external.provider,'openseo');
 assert.equal(stored.external.connectionId,'connection-a');
 assert.equal(stored.external.sourceType,'third_party_observation');
 const model=forModel(response);
 assert.equal(model.evidence[0].value.rankings[0].rank,3);
 assert.equal(model.evidence[0].value.rankings[1].rank,null);
 assert.equal(model.evidence[0].value.rankings[1].status,'not_checked');
 const initial=modelContext({business:{scope:{source:'all'}},
  period:ctx.period,evidence:[stored],capabilities:[],snapshot:{}});
 assert.equal(initial.evidence[0].id,id);
 assert.equal(initial.evidence[0].value.rankings[0].keyword,'logearn trading');
 assert.equal(validateClaims([{id:'c',kind:'fact',text:'observed position',
  evidenceIds:[id]}],ctx,store)[0].referenceStatus,'verified');
 assert.throws(()=>store.get(id,{...ctx,ownerId:'bob'}),e=>e.status===404);
});
test('sensitive text is redacted, binding never shown to model',async()=>{
 const response=await registry(makeStore(),{status:'ok',
  rankings:[{keyword:'admin@example.com',rank:1,status:'ranked'}]})
  .executeTool('test.ranks',{},ctx);
 const output=JSON.stringify(forModel(response));
 assert.doesNotMatch(output,/admin@example.com|connection-a|project-a/);
});
test('rank zero is invalid; no check is distinct from not found and from zero',async()=>{
 await assert.rejects(registry(makeStore(),{status:'ok',
  rankings:[{keyword:'x',rank:0,status:'ranked'}]})
  .executeTool('test.ranks',{},ctx),e=>e.status===422);
 const result=await registry(makeStore(),{status:'not_checked',rankings:[]})
  .executeTool('test.ranks',{},ctx);
 assert.equal(forModel(result).evidence[0].value.status,'not_checked');
 assert.deepEqual(forModel(result).evidence[0].value.rankings,[]);
});

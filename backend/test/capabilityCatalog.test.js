'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createToolRegistry,listToolIds}=require('../src/ai/business/tools/registry');
const {createCapabilityCatalog}=require('../src/ai/business/tools/capabilityCatalog');
const start=Date.parse('2026-10-18T00:00:00Z'),end=Date.parse('2026-10-20T00:00:00Z');
const context={ownerId:'alice',runId:'run-a',scope:{source:'all'},period:{start,end},taskAllowedTools:['test.snapshot']};
const schema=properties=>({type:'object',additionalProperties:false,properties});
const extension=(overrides={})=>({
 id:'test.snapshot',version:'1.0.0',description:'Approved local test-only snapshot',
 supportedScopes:['source'],permission:'owner-read',cost:'none',
 inputSchema:schema({keyword:{type:'string',maxLength:80}}),
 outputSchema:schema({status:{type:'string',maxLength:20},count:{type:'integer',minimum:0}}),
 enabled:()=>true,authorize:ctx=>ctx.ownerId==='alice',
 connection:ctx=>({id:'conn-a',ownerId:ctx.ownerId,projectId:'project-a',enabled:true}),
 execute:async input=>({status:'ok',count:input.keyword.length,secret:'must-not-leak'}),
 project:raw=>({status:raw.status,count:raw.count}),
 ...overrides
});
const deps={lookups:{},evidenceStore:{save(){},get(){}},
 snapshot:async()=>({snapshot_id:'s',as_of:'2026-10-22T00:00:00Z'}),
 seoPerformance:async()=>({available:false,rows:[]}),
 kolPerformance:async()=>({available:false,rows:[]})};
test('legacy ids, schema, scopes and specialist results stay on the existing path',async()=>{
 const baseline=createToolRegistry(deps),withExtension=createToolRegistry({...deps,extensions:[extension()]});
 const previous=baseline.listCapabilities(context);
 const current=withExtension.listCapabilities(context);
 assert.deepEqual(current.slice(0,previous.length),previous);
 assert.deepEqual(current.slice(0,previous.length).map(x=>x.id),listToolIds());
 for(const id of ['get_seo_performance','get_kol_performance']){
  assert.deepEqual(await withExtension.executeTool(id,{},context),
   await baseline.executeTool(id,{},context));
 }
});
test('project-shipped test connector registers without changing core dispatch',async()=>{
 const registry=createToolRegistry({...deps,extensions:[extension()]});
 assert.ok(registry.listCapabilities(context).some(x=>x.id==='test.snapshot'));
 assert.deepEqual(await registry.executeTool('test.snapshot',{keyword:'seo'},context),{status:'ok',count:3});
 assert.equal(registry.listCapabilities({...context,ownerId:'bob'}).some(x=>x.id==='test.snapshot'),false);
 await assert.rejects(registry.executeTool('test.snapshot',{keyword:'seo'},{...context,ownerId:'bob'}),e=>e.status===403);
 await assert.rejects(registry.executeTool('test.snapshot',{keyword:'seo',apiKey:'secret'},context),/输入/);
});
test('disabled/paid connectors are hidden and cannot be called',async()=>{
 for(const item of [extension({enabled:()=>false}),extension({cost:'paid'})]){
  const registry=createToolRegistry({...deps,extensions:[item]});
  assert.ok(!registry.listCapabilities(context).some(x=>x.id==='test.snapshot'));
  await assert.rejects(registry.executeTool('test.snapshot',{},context),e=>e.status===403);
 }
});
test('invalid ids, versions, schemas, declarations and duplicate ids fail closed',()=>{
 const opts={legacyIds:listToolIds(),assertOwner:ctx=>{if(!ctx.ownerId)throw Error('owner missing')}};
 for(const item of [
  extension({id:'get_seo_performance'}),extension({id:'no_namespace'}),
  extension({version:'latest'}),extension({cost:'free'}),extension({permission:'read-only'}),
  extension({supportedScopes:['arbitrary']}),extension({inputSchema:{type:'object',properties:{}}}),
  extension({outputSchema:schema({rows:{type:'array',items:{type:'string'}}})}),
  extension({execute:null}),extension({authorize:null}),extension({connection:null})
 ])assert.throws(()=>createCapabilityCatalog({...opts,extensions:[item]}),/声明无效/);
 assert.throws(()=>createCapabilityCatalog({...opts,extensions:[extension(),extension()]}),/重复/);
});
test('unapproved output cannot bypass projection and raw provider fields do not escape',async()=>{
 const registry=createToolRegistry({...deps,extensions:[extension({project:raw=>raw})]});
 await assert.rejects(registry.executeTool('test.snapshot',{keyword:'seo'},context),e=>e.status===422);
});

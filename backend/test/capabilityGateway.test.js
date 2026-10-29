'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createToolRegistry}=require('../src/ai/business/tools/registry');
const {modelCapabilities}=require('../src/ai/business/foundation');
const {createCapabilityCatalog}=require('../src/ai/business/tools/capabilityCatalog');
const period={start:Date.parse('2026-10-18T00:00:00Z'),end:Date.parse('2026-10-20T00:00:00Z')};
const ctx={ownerId:'alice',runId:'task-1',scope:{source:'all'},period,taskAllowedTools:['test.ranks']};
const s=(p={})=>({type:'object',additionalProperties:false,properties:p});
function extension(options={}){
 return {id:'test.ranks',version:'1.0.0',description:'static approved connector',
  supportedScopes:['source'],permission:'owner-read',cost:'none',
  inputSchema:s({limit:{type:'integer',minimum:1,maximum:10}}),
  outputSchema:s({status:{type:'string',maxLength:20},count:{type:'integer',minimum:0}}),
  enabled:()=>true,authorize:()=>true,
  connection:c=>({id:'connection-1',ownerId:c.ownerId,projectId:'project-1',enabled:true}),
  execute:async()=>({count:3,status:'ok'}),project:x=>x,...options};
}
function registry(item){return createToolRegistry({extensions:[item],lookups:{},
 evidenceStore:{get(){},save(){}},snapshot:async()=>({snapshot_id:'s',as_of:'2026-10-22T00:00:00Z'})});}
test('new capability needs a trusted task scope, not merely a visible catalog',async()=>{
 const r=registry(extension());
 assert.ok(r.listCapabilities({...ctx,taskAllowedTools:undefined}).some(x=>x.id==='test.ranks'));
 await assert.rejects(r.executeTool('test.ranks',{}, {...ctx,taskAllowedTools:undefined}),e=>e.status===403);
 assert.equal((await r.executeTool('test.ranks',{},ctx)).count,3);
 await assert.rejects(r.executeTool('test.ranks',{}, {...ctx,taskAllowedTools:['query_metrics']}),e=>e.status===403);
});
test('owner, connection state, and project binding are server-owned and live-checked',async()=>{
 let enabled=true,ownerId='alice',projectId='project-1';
 const calls=[];
 const item=extension({enabled:()=>enabled,connection:()=>({id:'conn-1',ownerId,projectId,enabled:true}),
  execute:async(input,context,binding)=>{calls.push([context.projectId,binding.id]);return {count:1,status:'ok'}}});
 const r=registry(item);
 await r.executeTool('test.ranks',{},ctx);
 assert.deepEqual(calls,[['project-1','conn-1']]);
 await assert.rejects(r.executeTool('test.ranks',{projectId:'other'},ctx),/输入/);
 enabled=false;
 assert.ok(!r.listCapabilities(ctx).some(x=>x.id==='test.ranks'));
 await assert.rejects(r.executeTool('test.ranks',{},ctx),e=>e.status===403);
 enabled=true;ownerId='bob';
 await assert.rejects(r.executeTool('test.ranks',{},ctx),e=>e.status===403);
 ownerId='alice';projectId='project-2';
 assert.equal((await r.executeTool('test.ranks',{},ctx)).count,1);
 assert.deepEqual(calls.at(-1),['project-2','conn-1']);
});
test('revocation during execution suppresses late results',async()=>{
 let active=true;
 const item=extension({authorize:()=>active,execute:async()=>{active=false;return {status:'ok',count:1}}});
 const r=registry(item);
 await assert.rejects(r.executeTool('test.ranks',{},ctx),e=>e.status===403);
});
test('upstream failure is unavailable, not zero; budget gate is distinct',async()=>{
 const r=registry(extension({execute:async()=>{throw Error('provider down')}}));
 const value=await r.executeTool('test.ranks',{},ctx);
 assert.equal(value.status,'unavailable');assert.equal(value.evidence.length,0);
 const r2=registry(extension({cost:'paid'}));
 await assert.rejects(r2.executeTool('test.ranks',{},ctx),e=>e.status===403);
});
test('legacy planned tool calls are task-scoped; absent allowlist preserves direct compatibility',async()=>{
 const r=registry(extension());
 await assert.rejects(r.executeTool('get_seo_performance',{},ctx),e=>e.status===403);
 await assert.rejects(r.executeTool('get_seo_performance',{unapproved:'x'},
  {...ctx,taskAllowedTools:undefined}),/字段/);
});
test('model capability plan is the intersection of server catalog and selected skills',()=>{
 const registry={listCapabilities:()=>[{id:'query_metrics'},{id:'get_seo_performance'},
  {id:'get_kol_performance'},{id:'test.ranks'}]};
 const tools=modelCapabilities(registry,ctx,{steps:[{tools:['get_seo_performance','test.ranks','forged.tool']}]});
 assert.deepEqual(tools.map(x=>x.id),['query_metrics','get_seo_performance','test.ranks']);
});

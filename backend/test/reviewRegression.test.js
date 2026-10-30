'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {forModel}=require('../src/ai/business/modelEvidence');
const {investigationKey,modelQuery}=require('../src/ai/business/modelTransport');
const {modelContext}=require('../src/ai/business/modelTransport');
test('investigation identity retains distinct parameters and normalizes object key order',()=>{
 const query=returning=>({tool:'get_retention',input:{start:1,end:2,initial:'visit',returning}});
 assert.notEqual(investigationKey(query('ai')),investigationKey(query('trade')));
 assert.equal(investigationKey({tool:'x',input:{start:1,end:2}}),investigationKey({input:{end:2,start:1},tool:'x'}));
});
test('extended query summary identifies protected and omitted parameters',()=>{
 const q=modelQuery({tool:'get_seo_performance',input:{start:1,end:2,siteUrl:'https://example.com',cursor:'opaque',dimensions:['source'],filters:{source:'seo'}}},{extended:true});
 assert.deepEqual(q.input.dimensions,['source']);
 assert.deepEqual(q.input.filters,{source:'seo'});
 assert.deepEqual(q.input.omittedFields,['cursor','siteUrl']);
 assert.ok(!JSON.stringify(q).includes('example.com'));
});
test('new weekly context exposes all available tool schemas without cross-unit ranking',()=>{
 const capabilities=Array.from({length:7},(_,i)=>({id:'tool'+i,description:'read',inputSchema:{properties:{start:{type:'integer'}}}}));
 const raw={business:{scope:{source:'all'}},period:{start:1,end:2,previousStart:0,previousEnd:1},
  current:{totals:{new_users:90,volume_usd:1}},previous:{totals:{new_users:100,volume_usd:10000}},
  weeklyCoverage:{version:'weekly-coverage-v1',modules:[]},capabilities,evidence:[]};
 const view=modelContext(raw,{transportVersion:'v4',reviewRevision:2});
 assert.equal(view.capabilities.length,7);
 assert.equal(view.priorityIssues[0].metricId,'new_users');
 assert.equal(view.investigationFocus,null);
});
test('v4 evidence retains bounded safe breakdowns and quality warnings',()=>{
 const view=forModel({status:'ok',warnings:['partial coverage'],evidence:[{id:'e1',metricId:'funnel',value:{steps:[{key:'visit',users:100},{key:'ai',users:20}],rows:[{email:'private@example.com'}]},coverage:{status:'partial'},warnings:['not mature']}]},{projectionVersion:'v4',maxBytes:3500});
 assert.equal(view.evidence[0].value.steps[1].users,20);
 assert.ok(JSON.stringify(view).includes('not mature'));
 assert.ok(!JSON.stringify(view).includes('private@example.com'));
});

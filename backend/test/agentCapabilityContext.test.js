'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {modelCapabilities}=require('../src/ai/business/foundation');
test('only planned read-only tools and core metrics enter model context',()=>{
 const all=[{id:'query_metrics',description:'metrics',inputSchema:{}},
  {id:'get_funnel',description:'funnel',inputSchema:{},limits:{maxQueries:20}},
  {id:'get_kol_performance',description:'kol',inputSchema:{}}];
 const registry={listCapabilities:()=>all};
 const result=modelCapabilities(registry,{ownerId:'alice'},{steps:[{tools:['get_funnel']}]});
 assert.deepEqual(result.map(x=>x.id),['query_metrics','get_funnel']);
 assert.equal(result[1].limits,undefined);
 assert.equal(modelCapabilities(registry,{ownerId:'alice'},null),all);
});

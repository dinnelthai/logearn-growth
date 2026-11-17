'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateClaims}=require('../src/ai/business/evidence');
const context={ownerId:'alice',scope:{source:'all'}};
const evidence={id:'ev1',metricId:'seo_search',definitionVersion:'1',
 value:{metrics:{clicks:12,impressions:100},rows:[{user_id:'PRIVATE',clicks:2}]},
 filters:{scope:{source:'all'}},period:{start:10,end:20,timezone:'Asia/Bangkok'}};
const store={get:(id)=>{if(id!=='ev1')throw Error('not authorized');return evidence}};
const claim=value=>[{id:'c1',kind:'fact',text:'GSC点击量',evidenceIds:['ev1'],values:[value]}];
test('numeric projected field paths can be cited without exposing raw rows',()=>{
 const result=validateClaims(claim({evidenceId:'ev1',path:'value.metrics.clicks',value:12}),context,store);
 assert.equal(result[0].referenceStatus,'verified');
});
test('mismatched numbers and raw fields remain rejected with a field-specific diagnosis',()=>{
 assert.throws(()=>validateClaims(claim({evidenceId:'ev1',path:'value.metrics.clicks',value:999}),context,store),/value.metrics.clicks/);
 assert.throws(()=>validateClaims(claim({evidenceId:'ev1',path:'value.rows.0.clicks',value:2}),context,store),/字段路径/);
 assert.throws(()=>validateClaims(claim({evidenceId:'ev1',path:'value.metrics.unknown',value:0}),context,store),/数值不匹配/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compare,decide}=require('../src/ai/growth/opportunityDecision');
test('unknown effort and impact are explained rather than assigned ROI',()=>{
 const item={evidenceIds:['e1'],confidence:'high',impact:{affectedUsers:null},effort:{hours:2}};
 assert.equal(decide(item).choice,'investigate');
 assert.match(decide(item).reasons.join(';'),/未知/);
});
test('no evidence is deferred and high-confidence comparable item is implementable only with approval',()=>{
 assert.equal(decide({evidenceIds:[],confidence:'high'}).choice,'defer');
 const first={id:'a',evidenceIds:['e1'],confidence:'high',impact:{affectedUsers:20},effort:{hours:3},
  metricId:'active_users',definitionVersion:'1'};
 assert.equal(decide(first).choice,'implement');
 const r=compare([first,{...first,id:'b',confidence:'low',impact:{affectedUsers:null}}]);
 assert.equal(r.items[0].id,'a');
 assert.equal(r.counts.implement,1);
 assert.ok(!JSON.stringify(r).includes('ROI'));
});

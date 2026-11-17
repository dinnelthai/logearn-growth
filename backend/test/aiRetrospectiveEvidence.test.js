'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reviewEvidence}=require('../src/queues/jobs/retrospective');
const {forModel}=require('../src/ai/business/modelEvidence');

test('retrospective investigations deliver aggregate statistics with their scope to the model',()=>{
 const result=reviewEvidence('north',{totals:{active_users:123},rows:[{email:'private@example.com'}]},
  {start:100,end:200,source:'twitter',snapshot:{snapshot_id:'snap',as_of:'2026-10-01T00:00:00Z'}});
 const view=forModel(result);
 assert.equal(view.status,'ok');
 assert.equal(view.evidence[0].value.totals.active_users,123);
 assert.equal(view.evidence[0].filters.source,'twitter');
 assert.equal(view.evidence[0].period.start,100);
 assert.equal(JSON.stringify(result).includes('private@example.com'),false);
});

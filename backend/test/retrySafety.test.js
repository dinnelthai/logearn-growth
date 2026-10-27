const test=require('node:test'),assert=require('node:assert/strict');
const {assessRetry}=require('../src/ai/business/retrySafety');
test('only failed analysis without model calls can be retried',()=>{
 assert.deepEqual(assessRetry({status:'failed'},[]),{allowed:true,reason:'no-model-call'});
 for(const status of ['processing','pending','completed'])assert.equal(assessRetry({status},[]).allowed,false);
 assert.equal(assessRetry(null,[]).allowed,false);
});
test('any prior model call blocks blind replay, even if response was received',()=>{
 for(const status of ['started','unknown','received']){
  const result=assessRetry({status:'failed'},[{status}]);
  assert.equal(result.allowed,false);
  assert.equal(result.reason,'prior-model-call');
 }
});
test('missing/corrupt call journal fails closed',()=>{
 assert.equal(assessRetry({status:'failed'},null).allowed,false);
 assert.equal(assessRetry({status:'failed'},undefined).reason,'trace-unavailable');
});

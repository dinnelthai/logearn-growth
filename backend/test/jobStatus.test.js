const test = require('node:test');
const assert = require('node:assert/strict');
const {statusFromRecord} = require('../src/ai/business/jobStatus');

test('missing persistent analysis returns no status', () => {
  assert.equal(statusFromRecord(null, 'missing'), null);
});
test('completed report is still visible after Bull has pruned its job', () => {
  const result = {summary:'verified'};
  const s = statusFromRecord({status:'completed', result}, 'analysis-1');
  assert.equal(s.state, 'completed');
  assert.equal(s.progress, 100);
  assert.deepEqual(s.result, result);
  assert.equal(s.source, 'analysis-record');
  assert.equal(s.resumable, false);
});
test('failed report preserves error without claiming progress', () => {
  const s = statusFromRecord({status:'failed',error_message:'provider timed out'}, 'analysis-2');
  assert.equal(s.state,'failed');
  assert.equal(s.error,'provider timed out');
  assert.equal(s.progress,null);
  assert.equal(s.result,null);
});
test('nonterminal record without queue is unknown, not running or resumable', () => {
  for (const status of ['pending','processing']) {
    const s = statusFromRecord({status}, 'analysis-3');
    assert.equal(s.state,'unknown');
    assert.equal(s.recordStatus,status);
    assert.equal(s.progress,null);
    assert.equal(s.resumable,false);
  }
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const {createTraceStore}=require('../src/ai/business/trace');
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 return db;
}
test('confirmed tool results survive trace store recreation and are owner-scoped',()=>{
 const db=setup(),ctx={ownerId:'alice',runId:'r',traceId:'t',promptVersions:{analysis:'hash'}};
 try{
  const a=createTraceStore(db);a.begin(ctx,0);
  a.finish(ctx,0,{responseContent:'{"investigations":[]}',tokens:11});
  a.appendInvestigation(ctx,0,0,{tool:'get_paths'},{count:3});
  a.appendInvestigation(ctx,0,1,{tool:'get_funnel'},{rate:0.4});
  const saved=createTraceStore(db).list('alice','r')[0].result;
  assert.deepEqual(saved.investigations,[{query:{tool:'get_paths'},result:{count:3}},{query:{tool:'get_funnel'},result:{rate:0.4}}]);
  assert.equal(createTraceStore(db).list('bob','r').length,0);
  assert.throws(()=>a.appendInvestigation({...ctx,ownerId:'bob'},0,2,{},{}),/未找到/);
  a.appendInvestigation(ctx,0,1,{tool:'get_funnel'},{rate:0.4});
  assert.equal(a.list('alice','r')[0].result.investigations.length,2);
  assert.throws(()=>a.appendInvestigation(ctx,0,1,{tool:'get_funnel'},{rate:0.7}),/冲突/);
  assert.throws(()=>a.appendInvestigation(ctx,0,4,{},{}),/按顺序/);
 }finally{db.close()}
});
test('unconfirmed paid calls cannot persist tool results',()=>{
 const db=setup(),ctx={ownerId:'alice',runId:'r',traceId:'t',promptVersions:{}};
 try{
  const a=createTraceStore(db);a.begin(ctx,0);
  assert.throws(()=>a.appendInvestigation(ctx,0,0,{},{}),/未找到/);
  a.unknown(ctx,0);
  assert.throws(()=>a.appendInvestigation(ctx,0,0,{},{}),/未找到/);
 }finally{db.close()}
});

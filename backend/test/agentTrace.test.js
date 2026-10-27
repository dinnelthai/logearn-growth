const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
const {createTraceStore}=require('../src/ai/business/trace');
test('prompt content is immutable and unresolved paid attempts block replay across restart',()=>{
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 try{const store=createTraceStore(db),context={ownerId:'alice',runId:'run',traceId:'trace',promptVersions:{analysis:'hash'}};
 store.savePrompt('analysis','prompt');store.begin(context,0);assert.throws(()=>createTraceStore(db).begin({...context,traceId:'another'},0),/核查/);
 store.finish(context,0,{tokens:10,fromCache:false});assert.equal(store.list('bob','run').length,0);assert.equal(store.list('alice','run')[0].result.tokens,10);
 store.begin(context,1);store.unknown(context,1);assert.throws(()=>store.begin({...context,traceId:'again'},0),/核查/);
 }finally{db.close()}
});

test('received model content survives a fresh trace store instance',()=>{
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 try{
  const ctx={ownerId:'alice',runId:'recover-run',traceId:'recover-trace',promptVersions:{analysis:'hash'}};
  const responseContent=JSON.stringify({summary:'保存的原始响应',keyFindings:[],suggestions:[]});
  createTraceStore(db).begin(ctx,0);
  createTraceStore(db).finish(ctx,0,{tokens:18,cost:0.002,responseContent});
  const recovered=createTraceStore(db).list('alice','recover-run');
  assert.equal(recovered.length,1);
  assert.equal(recovered[0].status,'received');
  assert.equal(recovered[0].result.responseContent,responseContent);
  assert.equal(createTraceStore(db).list('bob','recover-run').length,0);
 }finally{db.close()}
});

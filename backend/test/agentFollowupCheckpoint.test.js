const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
const {createTraceStore}=require('../src/ai/business/trace');
const {reconstructTranscript}=require('../src/ai/business/transcriptRecovery');
const systemPrompt='analysis system prompt',context={metric:'active_users'};
const promptHash=createHash('sha256').update(systemPrompt).digest('hex');
const contextHash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 const store=createTraceStore(db),ctx={ownerId:'alice',runId:'analysis-1',traceId:'trace-1',promptVersions:{analysis:promptHash}};
 return {db,store,ctx};
}
function received(store,ctx,round,response){
 store.begin(ctx,round);
 store.finish(ctx,round,{responseContent:response,contextHash,model:'test',tokens:9,cost:0.01});
}
test('persist parse and validation followups without overwriting existing content',()=>{
 const {db,store,ctx}=setup();
 try{
  received(store,ctx,0,'not-json');
  store.saveFollowup(ctx,0,'JSON格式无效','parse-error');
  store.saveFollowup(ctx,0,'JSON格式无效','parse-error');
  assert.throws(()=>store.saveFollowup(ctx,0,'different','parse-error'),/不一致/);
  received(store,ctx,1,JSON.stringify({summary:'bad'}));
  store.saveFollowup(ctx,1,'缺少结论','validation-error');
  const saved=createTraceStore(db).list('alice','analysis-1');
  assert.equal(saved.length,2);
  assert.deepEqual(saved.map(x=>x.result.followup),[
   {kind:'parse-error',content:'JSON格式无效'},
   {kind:'validation-error',content:'缺少结论'}
  ]);
  assert.equal(store.list('bob','analysis-1').length,0);
  assert.throws(()=>store.saveFollowup({...ctx,ownerId:'bob'},1,'message','validation-error'),/未确认/);
 }finally{db.close()}
});
test('reconstruct exact correction messages after store is recreated',()=>{
 const {db,store,ctx}=setup();
 try{
  received(store,ctx,0,'broken response');
  store.saveFollowup(ctx,0,'please fix JSON','parse-error');
  received(store,ctx,1,JSON.stringify({summary:'invalid'}));
  store.saveFollowup(ctx,1,'please add evidence','validation-error');
  received(store,ctx,2,JSON.stringify({summary:'valid',keyFindings:[],suggestions:[]}));
  const result=reconstructTranscript({rows:createTraceStore(db).list('alice','analysis-1'),systemPrompt,context});
  assert.equal(result.state,'reconstructed');
  assert.equal(result.canAutoResume,false);
  assert.equal(result.messages[3].content,'please fix JSON');
  assert.equal(result.messages[5].content,'please add evidence');
 }finally{db.close()}
});
test('old unjournaled correction and unresolved paid attempts block reconstruction',()=>{
 const {db,store,ctx}=setup();
 try{
  received(store,ctx,0,JSON.stringify({summary:'invalid'}));
  received(store,ctx,1,JSON.stringify({summary:'later'}));
  assert.equal(reconstructTranscript({rows:store.list('alice','analysis-1'),systemPrompt,context}).reason,'unrecorded-validation-turn');
 }finally{db.close()}
});

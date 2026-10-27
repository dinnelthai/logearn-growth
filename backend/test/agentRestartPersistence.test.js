'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {createTraceStore}=require('../src/ai/business/trace');
const {reconstructTranscript}=require('../src/ai/business/transcriptRecovery');

const prompt='system: use only saved evidence',context={snapshot:{id:'snap-a'},period:{start:100,end:200}};
const promptHash=createHash('sha256').update(prompt).digest('hex');
const contextHash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
const ctx={ownerId:'alice',runId:'crashed-run',traceId:'trace-a',promptVersions:{analysis:promptHash}};

function withDatabase(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'logearn-recovery-'));
 const file=path.join(dir,'journal.sqlite');
 try{return fn(file)}finally{fs.rmSync(dir,{recursive:true,force:true})}
}
function open(file,initialize=false){
 const db=new DatabaseSync(file);
 if(initialize)db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
 return db;
}
test('SQLite close/reopen keeps complete model and tool checkpoints, without paid replay',()=>{
 withDatabase(file=>{
  let db=open(file,true),journal=createTraceStore(db);
  const q={tool:'get_paths',input:{limit:4}},evidence={paths:[1,2,3]};
  journal.begin(ctx,0);
  journal.finish(ctx,0,{responseContent:JSON.stringify({investigations:[q]}),contextHash,model:'mock',tokens:12,cost:0.01});
  journal.appendInvestigation(ctx,0,0,q,evidence);
  db.close(); // simulate worker resource loss
  db=open(file);journal=createTraceStore(db);
  try{
   const rows=journal.list('alice','crashed-run');
   assert.equal(rows.length,1);
   assert.equal(rows[0].result.investigations.length,1);
   assert.equal(journal.list('bob','crashed-run').length,0);
   const recovered=reconstructTranscript({rows,systemPrompt:prompt,context});
   assert.equal(recovered.state,'reconstructed');
   assert.equal(recovered.canAutoResume,false);
   assert.deepEqual(recovered.evidence,[{query:q,result:evidence}]);
   // No LLM client is injected or contacted; state is read-only.
   assert.equal(journal.list('alice','crashed-run').length,1);
  }finally{db.close()}
 });
});
test('ambiguous paid call stays blocked after SQLite connection restart',()=>{
 withDatabase(file=>{
  let db=open(file,true),journal=createTraceStore(db);
  journal.begin(ctx,0);
  db.close(); // crash before receipt; never infer request was free
  db=open(file);journal=createTraceStore(db);
  try{
   const rows=journal.list('alice','crashed-run');
   assert.equal(rows[0].status,'started');
   const recovered=reconstructTranscript({rows,systemPrompt:prompt,context});
   assert.equal(recovered.state,'blocked');
   assert.equal(recovered.reason,'unresolved-paid-call');
   assert.throws(()=>journal.begin({...ctx,traceId:'trace-after-restart'},0),/核查/);
  }finally{db.close()}
 });
});

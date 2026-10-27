'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {createTraceStore}=require('../src/ai/business/trace');
const {reconstructTranscript}=require('../src/ai/business/transcriptRecovery');

const prompt='system: use saved evidence only';
const context={snapshot:{id:'fixed-snapshot'},period:{start:100,end:200}};
const promptHash=createHash('sha256').update(prompt).digest('hex');
const contextHash=createHash('sha256').update(JSON.stringify(context)).digest('hex');
const tool={tool:'get_paths',input:{limit:3}};
const toolResult={paths:[1,2,3]};

// Child deliberately stays alive with the SQLite connection open. Parent SIGKILLs it.
// No Redis, Postgres, paid provider, or network is used.
const childScript=String.raw`
 const fs=require('node:fs'),{DatabaseSync}=require('node:sqlite'),{createHash}=require('node:crypto');
 const {createTraceStore}=require('./src/ai/business/trace');
 const [filename,mode]=process.argv.slice(-2);
 const db=new DatabaseSync(filename);
 db.exec(fs.readFileSync('./src/db/schema.sql','utf8'));
 const store=createTraceStore(db);
 const prompt='system: use saved evidence only';
 const context={snapshot:{id:'fixed-snapshot'},period:{start:100,end:200}};
 const ctx={ownerId:'alice',runId:'kill-run',traceId:'kill-trace',promptVersions:{analysis:createHash('sha256').update(prompt).digest('hex')}};
 store.begin(ctx,0);
 if(mode==='received'){
  const tool={tool:'get_paths',input:{limit:3}};
  store.finish(ctx,0,{responseContent:JSON.stringify({investigations:[tool]}),contextHash:createHash('sha256').update(JSON.stringify(context)).digest('hex'),model:'mock',tokens:13,cost:0.01});
  store.appendInvestigation(ctx,0,0,tool,{paths:[1,2,3]});
 }
 process.send({ready:true});
 setInterval(()=>{},1000);
`;

async function killAfterCheckpoint(filename,mode){
 const child=spawn(process.execPath,['-e',childScript,filename,mode],{
  cwd:path.join(__dirname,'..'),stdio:['ignore','ignore','pipe','ipc']
 });
 let stderr='';
 child.stderr.on('data',c=>{stderr+=c.toString()});
 try {
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('child did not create checkpoint: '+stderr)),8000);
   const clean=()=>clearTimeout(timeout);
   child.once('message',message=>{clean();message?.ready?resolve():reject(Error('unexpected child message'))});
   child.once('error',error=>{clean();reject(error)});
   child.once('exit',(code,signal)=>{clean();reject(Error('child exited early: '+code+'/'+signal+' '+stderr))});
  });
 }finally{
  child.kill('SIGKILL');
  await new Promise(resolve=>child.once('exit',resolve));
 }
}

async function withFile(fn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'logearn-worker-kill-'));
 try{return await fn(path.join(dir,'journal.sqlite'))}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
}
test('SIGKILL worker after checkpoint preserves paid response and tool evidence',async()=>{
 await withFile(async filename=>{
  await killAfterCheckpoint(filename,'received');
  const db=new DatabaseSync(filename);
  try{
   const trace=createTraceStore(db);
   const rows=trace.list('alice','kill-run');
   assert.equal(rows.length,1);
   assert.equal(trace.list('bob','kill-run').length,0);
   const reconstructed=reconstructTranscript({rows,systemPrompt:prompt,context});
   assert.equal(reconstructed.state,'reconstructed');
   assert.deepEqual(reconstructed.evidence,[{query:tool,result:toolResult}]);
   assert.equal(reconstructed.canAutoResume,false);
  }finally{db.close()}
 });
});
test('SIGKILL worker after paid-call begin blocks new paid call',async()=>{
 await withFile(async filename=>{
  await killAfterCheckpoint(filename,'started');
  const db=new DatabaseSync(filename);
  try{
   const trace=createTraceStore(db),rows=trace.list('alice','kill-run');
   const state=reconstructTranscript({rows,systemPrompt:prompt,context});
   assert.equal(state.reason,'unresolved-paid-call');
   assert.throws(()=>trace.begin({ownerId:'alice',runId:'kill-run',traceId:'new-trace',promptVersions:{analysis:promptHash}},0),/核查/);
  }finally{db.close()}
 });
});

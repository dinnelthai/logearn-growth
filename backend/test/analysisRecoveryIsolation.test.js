'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
let claims=0;
const context={business:{scope:{source:'all'}},period:{start:1,end:2},snapshot:{id:'s'},evidence:[]};
function inject(path,exports){const id=require.resolve(path);require.cache[id]={id,filename:id,loaded:true,exports};}
inject('../src/db/connection',db);
inject('../src/db/aiRecords',{
 getAnalysisRecord:async(id,owner)=>id==='run'&&owner==='alice'?{id,status:'processing',lease_expires_at:Date.now()-1000,context_payload:JSON.stringify(context)}:null,
 listAnalysisPaidCalls:async()=>[{round:0,status:'received'}],
 claimExpiredFinalization:async()=>{claims++;throw Error('unexpected lease claim')}
});
inject('../src/queues/jobs/dataFetcher',{});
inject('../src/data/hologres',{});
inject('../src/services/businessReport',{createService:()=>({})});
const {resumeIncompleteAnalysis,recoverValidatedAnalysis}=require('../src/queues/jobs/businessAnalysis');
test('an empty replica journal blocks both recovery modes before claiming or paid calls',async()=>{
 const job={data:{analysisId:'run',ownerId:'alice'},progress:async()=>{throw Error('unexpected progress')}};
 await assert.rejects(resumeIncompleteAnalysis(job),/journal-count-mismatch/);
 await assert.rejects(recoverValidatedAnalysis(job),/恢复|检查点|日志|模型调用/);
 assert.equal(claims,0);
});
test.after(()=>db.close());

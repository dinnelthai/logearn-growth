'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');

const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));
const state={record:null,guards:[],settled:null,claims:0};
const fakeRecords={
 async getAnalysisRecord(id,owner){return id==='analysis-1'&&owner==='alice'?state.record:null},
 async listAnalysisPaidCalls(){return state.guards},
 async claimExpiredFinalization(){state.claims++;return state.record},
 async assertAnalysisLease(){},
 async completeAnalysis(_id,_owner,suggestions,result,model){state.settled={suggestions,result,model}},
 async failClaimedAnalysis(){throw Error('unexpected recovery write failure')}
};
function inject(path,exports){
 const filename=require.resolve(path);
 require.cache[filename]={id:filename,filename,loaded:true,exports};
}
inject('../src/db/aiRecords',fakeRecords);
inject('../src/db/connection',db);
inject('../src/queues/jobs/dataFetcher',{fetchNorthStar(){},fetchGrowthInsights(){},fetchWeeklyCore(){}});
inject('../src/data/hologres',{});
inject('../src/services/businessReport',{createService(){return {build(){throw Error('no business rebuild allowed')}}}});
const {recoverValidatedAnalysis,analysisPrompt}=require('../src/queues/jobs/businessAnalysis');
const {buildSystemPrompt}=require('../src/ai/business/runner');
const {createTraceStore}=require('../src/ai/business/trace');
const base={business:{scope:{source:'all'}},evidence:[],snapshot:{id:'s1'},period:{start:1,end:2}};
const output={summary:'persisted final',keyFindings:[],suggestions:[],claims:[]};
const traceContext={ownerId:'alice',runId:'analysis-1',traceId:'trace-1',
 promptVersions:{analysis:createHash('sha256').update(buildSystemPrompt(analysisPrompt)).digest('hex')}};
function prepared(){
 state.record={id:'analysis-1',owner_id:'alice',status:'processing',lease_expires_at:Date.now()-10000,
  data_snapshot:base,filter_conditions:{modelMode:'auto'}};
 state.guards=[{round:0,status:'received'}];state.settled=null;state.claims=0;
 const journal=createTraceStore(db);
 // Each test uses its own trace/run ID to avoid duplicate primary keys.
 return journal;
}
test('validated final response can be settled after crash without any new LLM or tool call',async()=>{
 const journal=prepared();
 journal.savePrompt('analysis',buildSystemPrompt(analysisPrompt));
 journal.begin(traceContext,0);
 journal.finish(traceContext,0,{responseContent:JSON.stringify(output),contextHash:createHash('sha256').update(JSON.stringify(base)).digest('hex'),
  model:'mock',provider:'mock',cost:0.03,tokens:12});
 journal.saveValidatedAnalysis(traceContext,0,output);
 const progress=[];
 const result=await recoverValidatedAnalysis({data:{analysisId:'analysis-1',ownerId:'alice'},progress:async x=>progress.push(x)});
 assert.equal(result.summary,'persisted final');
 assert.deepEqual(progress,[85,100]);
 assert.equal(state.claims,1);
 assert.deepEqual(state.settled.suggestions,[]);
 assert.equal(state.settled.result.summary,'persisted final');
 assert.equal(state.settled.model.cost,0.03);
});
test('other user cannot read finalization recovery record',async()=>{
 await assert.rejects(recoverValidatedAnalysis({data:{analysisId:'analysis-1',ownerId:'bob'},progress:async()=>{}}),/不存在/);
});

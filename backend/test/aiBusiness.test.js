const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const policy=require('../src/ai/business/policy');
function load(relative,mocks={}){
  const filename=path.join(__dirname,'../src',relative),module={exports:{}};
  const requireMock=name=>name in mocks?mocks[name]:require(require.resolve(name,{paths:[path.dirname(filename)]}));
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:requireMock,module,exports:module.exports,process,console,Buffer,Date,setTimeout,clearTimeout,setInterval,clearInterval},{filename});return module.exports;
}
const good={summary:'渠道激活有缺口',keyFindings:['样本需补充'],suggestions:[{problem:'激活',evidence:{metrics:['10人']},hypothesis:'入口摩擦',uncertainties:['覆盖未知'],action:'核对入口',priority:'P1',priorityReason:'影响人数与低执行成本',validationMetrics:{primary:'active_users'},reviewConditions:['观察7天']}]};
function runner(){return load('ai/business/runner.js',{'../llm':{getConfig:()=>({defaultModel:'claude-sonnet-4-6'}),createClient:()=>{throw Error('Network forbidden')}}});}
async function env(fn){const previous={...process.env};process.env.AI_DOMESTIC_MODEL='local-model';process.env.AI_COMPLEX_MODEL='claude-opus-4-8';try{await fn()}finally{for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous)}}
test('business day windows exclude execution day and use equal periods; unique users are not divided into fake DAU',()=>{
  const p=policy.reviewPeriods(Date.parse('2026-10-01T10:00:00+07:00'),Date.parse('2026-10-07T10:00:00+07:00'));
  assert.equal(p.days,5);assert.equal(p.baselineEnd,Date.parse('2026-10-01T00:00:00+07:00'));
  assert.equal(p.baselineEnd-p.baselineStart,p.effectEnd-p.effectStart);
  const c=policy.metricChanges({active_users:100},{active_users:120},['active_users','activation_rate']);
  assert.equal(c.active_users.change,20);assert.equal(c.activation_rate.available,false);assert.equal(c.active_users.baseline,100);
  assert.equal(policy.effectiveness({confidence:'insufficient',hasImprovement:false}), 'unknown');
  assert.equal(policy.effectiveness({confidence:'high',hasImprovement:true,hasCausality:false}), 'unknown');
});
test('scope validation never silently broadens an unsupported activity or audience',()=>{
  assert.throws(()=>policy.validateScope({cohorts:['abc']}),/尚不支持/);
  assert.throws(()=>policy.validateRange(100,NaN));assert.equal(policy.validateScope({source:'twitter'}).source,'twitter');
});
test('single model repairs JSON with history and complete investigation evidence',()=>env(async()=>{
  const {runTask}=runner(),seen=[];let i=0;
  const answers=[{investigations:[{kind:'north'}]}, 'invalid JSON',good];
  const result=await runTask({context:{memory:[{rejection_reason:'缺少资源'}]},prompt:'分析',ownerId:'alice',operationId:'a',operationType:'analysis',
    investigate:async()=>({active_users:12}),clientFactory:({model})=>({chat:async messages=>{seen.push({model,messages:JSON.stringify(messages)});return {content:typeof answers[i]==='string'?answers[i++]:JSON.stringify(answers[i++]),usage:{totalTokens:5},cost:0.01,provider:model==='local-model'?'domestic':'anthropic'}}})});
  assert.deepEqual(seen.map(c=>c.model),['claude-sonnet-4-6','claude-sonnet-4-6','claude-sonnet-4-6']);
  assert.match(seen[2].messages,/缺少资源/);assert.match(seen[2].messages,/active_users/);assert.equal(result.calls.length,3);assert.equal(result.cost,0.03);
}));
test('budgets never turn unfinished investigation into a successful empty report',()=>env(async()=>{
  process.env.AI_TASK_MAX_CALLS='1';const {runTask}=runner();
  await assert.rejects(()=>runTask({context:{},prompt:'x',investigate:async()=>({}),clientFactory:()=>({chat:async()=>({content:JSON.stringify({investigations:[{kind:'north'}]})})})}),/未完成/);
}));
test('deep analysis uses the same configured model and records prompt/trace identity',()=>env(async()=>{
  const {runTask}=runner();const seen=[];
  const result=await runTask({context:{focusGoal:'revenue'},prompt:'x',ownerId:'alice',operationId:'run-a',mode:'complex',clientFactory:opts=>({chat:async(_messages,options)=>{seen.push({model:opts.model,options});return {content:JSON.stringify(good),usage:{totalTokens:7}}}})});
  assert.equal(seen[0].model,'claude-sonnet-4-6');assert.equal(seen[0].options.runId,'run-a');
  assert.ok(seen[0].options.traceId);assert.match(seen[0].options.promptVersions.analysis,/^[a-f0-9]{64}$/);
  assert.equal(result.calls[0].runId,'run-a');assert.equal(result.calls[0].tokens,7);
}));
test('business analysis persists snapshot, history, priorities and structured suggestions; completed replay avoids model calls',async()=>{
  const events=[],base={totals:{active_users:100,new_users:20,returning_users:80},meta:{snapshot_id:'s'}};
  const records={getAnalysisRecord:async()=>({status:'pending'}),updateAnalysisStatus:async(...a)=>events.push(['status',...a]),
    updateAnalysisSnapshot:async(...a)=>events.push(['snapshot',...a]),getAnalysisMemory:async()=>[{user_status:'rejected',rejection_reason:'成本高'}],
    completeAnalysis:async(id,owner,s,result)=>{events.push(['suggestions',s]);events.push(['status',id,'completed',result])}, assertAnalysisLease:async()=>{}, renewAnalysisLease:async()=>true, failClaimedAnalysis:async(_id,_owner,_token,message)=>events.push(['failed',message])};
  const handler=load('queues/jobs/businessAnalysis.js',{
    '../../ai/business/runner':{validateAnalysis:x=>x,runTask:async opts=>{assert.equal(opts.context.memory[0].rejection_reason,'成本高');assert.equal(opts.context.weekly.users,5);assert.equal(opts.context.candidates.length,0);return {analysis:good,cost:0.01,model:'routine',provider:'domestic',calls:[],evidence:[],routing:{tier:'routine'}}}},
    '../../ai/business/foundation':{defaultFoundation:()=>({prepare:report=>({context:{...report,evidence:[]},validate:()=>{},traceStore:undefined})})},
    '../../ai/business/trace':{createTraceStore:()=>({})}, '../../ai/optimization/promptRegistry':{createPromptRegistry:()=>({resolve:(_owner,_role,prompt)=>prompt})}, '../../db/connection':{}, '../../ai/business/workerStart':{claimSafeAnalysis:async()=> records.getAnalysisRecord().then(r=>r.status==='completed'?{action:'completed',result:r.result}:{action:'claimed',record:r,token:'token'})}, '../../db/aiRecords':records,'../../data/hologres':{status:async()=>({snapshot_id:'s',as_of:'2026-10-20T00:00:00Z'})},
    './dataFetcher':{fetchNorthStar:async()=>base,fetchGrowthInsights:async()=>({change:{},channels:[],quality:{history_complete:false}}),fetchWeeklyCore:async()=>({available:true,users:5})}});
  const job={data:{analysisId:'a',ownerId:'alice',dateRangeStart:Date.parse('2026-10-01'),dateRangeEnd:Date.parse('2026-10-08'),businessScope:{source:'twitter'}},progress:async()=>{}};
  await handler.businessAnalysis(job);assert.ok(events.some(e=>e[0]==='snapshot'));assert.equal(events.find(e=>e[0]==='suggestions')[1][0].applicableScope.source,'twitter');assert.equal(events.at(-1)[2],'completed');
  records.completeAnalysis=async()=>{throw Error('storage failure')};
  await assert.rejects(handler.businessAnalysis(job),/storage failure/); assert.ok(events.some(e=>e[0]==='failed'&&e[1]==='storage failure'));
  records.getAnalysisRecord=async()=>({status:'completed',result:{summary:'saved'}});assert.equal((await handler.businessAnalysis(job)).summary,'saved');
});
test('batch suggestions use the transaction client and rollback on partial failure',async()=>{
  const statements=[];let inserted=0;
  const client={query:async sql=>{statements.push(sql);if(sql.includes('INSERT INTO ai_suggestions')&&++inserted===2)throw Error('invalid suggestion');return {rows:[]}},release:()=>{}};
  const pool={connect:async()=>client};
  const db=load('db/aiRecords.js',{'./aiPool':{...pool,query:async()=>{throw Error('must not use pool outside transaction')}}});
  await assert.rejects(()=>db.createSuggestionsBatch([{analysisId:'a'},{analysisId:'a'}]),/invalid suggestion/);
  assert.ok(statements.includes('ROLLBACK'));assert.ok(!statements.includes('COMMIT'));
});
test('API static routes resolve correctly; owner mismatch cannot read jobs; feedback requires real action',async()=>{
  const express=require('express'),app=express();app.use(express.json());app.use((req,res,next)=>{req.user={user_id:'alice'};next()});
  const router=load('routes/aiAnalysis.js',{'../queues/queues':{getJobStatus:async()=>({exists:true,data:{ownerId:'bob'}})},
    '../db/aiRecords':{getUserCostStats:async()=>({total_calls:2}),getSuggestion:async()=>({id:'s',user_status:'pending'})}});
  app.use('/api/ai-analysis',router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port+'/api/ai-analysis';
  try{assert.equal((await fetch(base+'/cost-stats')).status,200);assert.equal((await fetch(base+'/jobs/1/status')).status,403);
    const feedback=await fetch(base+'/suggestions/s/status',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({userStatus:'executed'})});assert.equal(feedback.status,400);
  }finally{await new Promise(r=>server.close(r))}
});
test('LLM client logs real token usage once with owner and operation; cache remains owner-scoped',async()=>{
  const tracked=[],options=[],limits=[];
  class Tracker{async checkDailyLimit(...args){limits.push(args)}async track(value){tracked.push(value)}}
  class Provider{constructor(){this.client={baseURL:'https://domestic.invalid/v1'}}async chat(){return {content:'{}',usage:{inputTokens:100,outputTokens:20,totalTokens:120}}}}
  const Client=load('ai/llm/client.js',{
    './config':{getConfig:()=>({defaultModel:'routine',openai:{baseURL:'https://derouter.invalid/v1',apiKey:'test'},maxDailyCost:5,enableMetrics:false}),getModelInfo:()=>({provider:'openai',costPer1kInput:0.01,costPer1kOutput:0.02}),LLM_PROVIDERS:{DOMESTIC:'domestic',OPENAI:'openai',ANTHROPIC:'anthropic'}},
    './providers/openai':Provider,'./providers/anthropic':Provider,'./costTracker':Tracker,
    '../../cache':{rateLimit:{checkLimit:async()=>({allowed:true})},llmCache:{get:async(_p,_m,opts)=>{options.push(opts);return null},set:async()=>{}}},
    '../../utils/logger':{info:()=>{},error:()=>{}},'../../websocket':{}
  });
  const client=new Client();const result=await client.chat([{role:'user',content:'hello'}],{userId:'alice',operationId:'a',operationType:'analysis'});
  assert.equal(tracked.length,1);assert.equal(tracked[0].ownerId,'alice');assert.equal(tracked[0].operationId,'a');assert.equal(tracked[0].totalTokens,120);
  assert.equal(result.cost,0.0014);assert.equal(result.provider,'openai');assert.equal(options[0].cacheScope,'alice');assert.equal(limits[0][1],'alice');
});
test('completion atomically commits suggestions and final record, and a failed insert cannot mark analysis complete',async()=>{
  const calls=[];const client={query:async(sql)=>{calls.push(sql);if(sql.includes('SELECT status,result'))return {rows:[{status:'processing',execution_token:'token',lease_expires_at:Date.now()+60000}]};if(sql.includes('INSERT INTO ai_suggestions'))throw Error('insert failed');return {rows:[]}},release:()=>{}};
  const db=load('db/aiRecords.js',{'./aiPool':{connect:async()=>client}});
  await assert.rejects(()=>db.completeAnalysis('a','alice',[{analysisId:'a'}],{summary:'x'},{provider:'domestic',model:'x',cost:0},'token'),/insert failed/);
  assert.ok(calls.includes('ROLLBACK'));assert.ok(!calls.some(c=>c.includes("SET status='completed'")));assert.ok(!calls.includes('COMMIT'));
});
test('create-analysis API validates scopes and passes authenticated ownership with exactly one paid-task attempt',async()=>{
  const express=require('express'),app=express(),queued=[];app.use(express.json());app.use((req,res,next)=>{req.user={user_id:'alice'};next()});
  const body={title:'test',dateRangeStart:Date.parse('2026-09-01'),dateRangeEnd:Date.parse('2026-09-08'),businessScope:{source:'twitter'},requestKey:'same-request',focusGoal:'activation',goalRef:{id:'g',version:1}};
  const router=load('routes/aiAnalysis.js',{'../db/connection':{},'../ai/business/context':{createContextStore:()=>({getGoal:(owner,id,version)=>owner==='alice'&&id==='g'&&version===1?{id,version}:null})},'../queues/queues':{addAIAnalysisJob:async(...args)=>{queued.push(args);return {id:'a'}}},
    '../db/aiRecords':{createAnalysisRecord:async v=>({id:'a',status:'pending',date_range_start:v.dateRangeStart,date_range_end:v.dateRangeEnd,user_question:v.userQuestion,business_scope:v.businessScope,filter_conditions:v.filterConditions})}});
  app.use('/api/ai-analysis',router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const url='http://127.0.0.1:'+server.address().port+'/api/ai-analysis/analyze';
  try{
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,ownerId:'bob'})});
    assert.equal(response.status,202);assert.equal(queued[0][1].ownerId,'alice');assert.equal(queued[0][2].attempts,1);assert.equal(queued[0][1].goalRef.version,1);
    const invalid=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,businessScope:{cohorts:['secret']}})});
    assert.equal(invalid.status,400);assert.equal(queued.length,1);
  }finally{await new Promise(r=>server.close(r))}
});
test('prompt version hashes the actual system message and usage above budget cannot complete',()=>env(async()=>{
 const {runTask}=runner();let actual,persisted;
 await runTask({context:{},prompt:'base prompt',ownerId:'alice',operationId:'r',traceStore:{savePrompt:(_role,content)=>{persisted=content},begin:()=>{},finish:()=>{}},clientFactory:()=>({chat:async messages=>{actual=messages[0].content;return {content:JSON.stringify(good),usage:{totalTokens:5}}}})});
 assert.equal(persisted,actual);
 process.env.AI_TASK_MAX_TOKENS='10000';
 await assert.rejects(()=>runTask({context:{},prompt:'x',clientFactory:()=>({chat:async()=>({content:JSON.stringify(good),usage:{totalTokens:10001}})})}),/预算/);
}));
test('reading AI routes does not initialize the paid job queue',()=>{
 const mocks={};Object.defineProperty(mocks,'../queues/queues',{enumerable:true,get(){throw Error('queue must stay lazy')}});
 assert.doesNotThrow(()=>load('routes/aiAnalysis.js',mocks));
});

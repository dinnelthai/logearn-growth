const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
const {createService}=require('../src/services/businessReport'),{createStore}=require('../src/db/businessReports');
function fixtures(){
 const snapshots=[],s={snapshot_id:'same-snapshot',snapshot_cutoff:'2026-10-20T00:00:00Z',as_of:'2026-10-20T00:00:00Z',history_complete:false};
 const evidence={fetchNorthStar:async(start,end,source,snapshot)=>{snapshots.push(snapshot);return {totals:{active_users:start===Date.parse('2026-10-01')?80:100,new_users:20,returning_users:60},days:[]}},
 fetchGrowthInsights:async({snapshot})=>{snapshots.push(snapshot);return {change:{},quality:{history_complete:false},channels:[{source:'twitter',users:100,eligible:40,activated:10,pending:60,activation_rate:.25,d7:{eligible:20,returned:3,rate:.15}}],dimensions:{source:[{value:'twitter',current:80,previous:100,delta:-20,list_key:'private'}]}}},
 fetchWeeklyCore:async({snapshot})=>{snapshots.push(snapshot);return {available:true,users:30,goal:{users:200,progress:.15,due_date:'2026-11-30'}}}};
 return {s,evidence,snapshots,input:{start:Date.parse('2026-10-01'),end:Date.parse('2026-10-08'),businessScope:{source:'twitter'},focusGoal:'activation',question:'人工核查'}};
}
function database(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(__dirname,'../src/db/schema.sql'),'utf8'));return db;}
test('business report computes explicit priorities and all evidence with a shared snapshot and no model',async()=>{
 const f=fixtures(),service=createService({remote:{status:async()=>f.s},evidence:f.evidence});
 const report=await service.build(f.input);assert.ok(f.snapshots.every(s=>s===f.s));assert.equal(report.current.totals.active_users,80);
 assert.equal(report.period.end-report.period.start,report.period.previousEnd-report.period.previousStart);assert.equal(report.period.timezone,'Asia/Bangkok');
 assert.ok(report.candidates.some(c=>c.metric==='activation_rate'&&c.eligible===40&&c.checks.length));assert.ok(report.candidates.every(c=>c.score>0&&c.scoreExplanation));
 assert.ok(report.warnings.some(w=>w.includes('覆盖未确认')));assert.equal(report.growth.dimensions.source[0].list_key,undefined);
});
test('unavailable weekly metric stays explicitly unavailable without hiding other business evidence',async()=>{
 const f=fixtures();f.evidence.fetchWeeklyCore=async()=>{throw Error('window unavailable')};
 const report=await createService({remote:{status:async()=>f.s},evidence:f.evidence}).build(f.input);
 assert.equal(report.weekly.available,false);assert.ok(report.warnings.some(w=>w.includes('window unavailable')));assert.ok(report.current.totals.active_users>0);
});
test('saved human reports and actions work in SQLite with owner isolation and no AI schema',async()=>{
 const db=database(),store=createStore(db);try{
 const f=fixtures(),report=await createService({remote:{status:async()=>f.s},evidence:f.evidence}).build(f.input),saved=store.save('alice','manual',report);
 assert.equal(store.get(saved.id,'bob'),null);assert.equal(store.list('bob').length,0);
 const issue=saved.candidates[0],action=store.saveAction(saved,'alice',{candidateId:issue.id,title:'人工核对',priority:'P2'});
 assert.equal(action.priority,'P2');assert.equal(store.actions(saved.id,'bob').length,0);
 const executed=store.updateAction(action.id,'alice',{status:'executed',note:'已执行人工核对',executedAt:Date.parse('2026-10-01')});
 store.updateAction(action.id,'alice',{status:'executed',note:'另一位操作员修正了实际动作',executedAt:Date.parse('2026-10-01')});
 assert.throws(()=>store.saveReview(action.id,'alice',{conclusion:'stale'},executed),/已被修改/);
 assert.equal(store.get(saved.id,'alice').current.totals.active_users,80);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='ai_analysis_records'").get().n,0);
 }finally{db.close()}
});
test('human effect comparison uses equal full days, unavailable metrics stay unknown, and no AI verdict is generated',async()=>{
 const f=fixtures();const service=createService({remote:{status:async()=>f.s},evidence:f.evidence});
 const report=await service.build(f.input),candidate=report.candidates.find(c=>c.metric==='activation_rate');
 const result=await service.review(report,{candidate_id:candidate.id,executed_at:Date.parse('2026-10-01')});
 assert.equal(result.periods.baselineEnd-result.periods.baselineStart,result.periods.effectEnd-result.periods.effectStart);
 assert.equal(result.metricChanges.activation_rate.baseline,.25);assert.equal(result.metricChanges.activation_rate.change,0);assert.match(result.conclusion,/不自动判定/);assert.equal(result.hasCausality,undefined);
});
test('human route imports when all AI SDKs, Bull, Redis and AI storage modules are forbidden',()=>{
 const output=execFileSync(process.execPath,['-e',`
 process.env.DB_PATH=':memory:';
 const Module=require('module'),original=Module._load;
 Module._load=function(name,...rest){if(/^(bull|bullmq|ioredis|openai|@anthropic-ai\\/sdk)$/.test(name)||/aiPool|aiRecords|ai\\/llm/.test(name))throw Error('Forbidden AI dependency: '+name);return original.call(this,name,...rest)};
 const db=require('./src/db/connection');db.exec(require('fs').readFileSync('src/db/schema.sql','utf8'));
 require('./src/routes/businessAnalysis');db.close();console.log('human route independent');
 `],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 assert.match(output,/human route independent/);
});
test('human API enforces ownership for reports and actions while optional AI is unavailable',async()=>{
 const db=database(),store=createStore(db),f=fixtures(),service=createService({remote:{status:async()=>f.s},evidence:f.evidence});
 const express=require('express'),module={exports:{}};
 const mocks={express,'../services/businessReport':{createService:()=>service},'../db/businessReports':{createStore:()=>store},'../db/connection':db};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/businessAnalysis.js'),'utf8'),{require:name=>{if(name in mocks)return mocks[name];throw Error('AI or unexpected dependency: '+name)},module,console,Date});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={user_id:req.headers['x-owner']||'alice'};next()});app.use('/business',module.exports);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 async function request(url,body,owner='alice',method=body===undefined?'GET':'POST'){
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/business'+url,{method,headers:{'Content-Type':'application/json','x-owner':owner},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};
 }
 try{
  const created=await request('/reports',{...f.input,title:'human'});assert.equal(created.status,201);const r=created.body;
  assert.equal((await request('/reports/'+r.id,undefined,'bob')).status,404);
  assert.equal((await request('/reports/'+r.id+'/actions',{candidateId:r.candidates[0].id,title:'核对',priority:'P2'},'bob')).status,404);
  const action=await request('/reports/'+r.id+'/actions',{candidateId:r.candidates[0].id,title:'核对',priority:'P2'});assert.equal(action.status,201);
  assert.equal((await request('/reports/'+r.id+'/actions/'+action.body.id,{status:'executed',note:''},'alice','PUT')).status,400);
  const executed=await request('/reports/'+r.id+'/actions/'+action.body.id,{status:'executed',note:'人工执行',executedAt:Date.parse('2026-10-01')},'alice','PUT');assert.equal(executed.status,200);
  const review=await request('/reports/'+r.id+'/actions/'+action.body.id+'/review',{});assert.equal(review.status,200);
  const loaded=await request('/reports/'+r.id);assert.ok(loaded.body.actions[0].review);assert.equal(loaded.body.current.totals.active_users,80);
 }finally{await new Promise(r=>server.close(r));db.close()}
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {workspaceStore}=require('../src/ai/growth/workspace/store');
const {lastCompleted,atBangkok}=require('../src/ai/growth/workspace/period');
let now=Date.parse('2026-10-20T05:00:00Z');
const monthStart=atBangkok(2026,9,1),monthEnd=atBangkok(2026,10,1);
function setup(){const db=new DatabaseSync(':memory:');const s=workspaceStore(db,{clock:()=>now,initialize:true});return {db,s,close:()=>db.close()}}
function target(){return {metricId:'four_day_core',definitionVersion:'2026-10',target:200,unit:'users',direction:'increase',aggregation:'rolling-distinct',kind:'north',periodStart:monthStart,periodEnd:monthEnd,scope:{source:'all'}}}
function evidence(id,state='verified',value=34,at=now){return {id,source:'approved-read-only-metrics',metricId:'four_day_core',unit:'users',scope:{source:'all'},definitionVersion:'2026-10',state,value,period:{start:atBangkok(2026,9,13),end:atBangkok(2026,9,20),timezone:'Asia/Bangkok'},observedAt:at,coverage:{status:'verified'},watermarks:{events:at},originalLocator:{report:'core-users'}}}
test('month goal versions remain historically stable and rolling-distinct is never daily summed',()=>{
 const {s,close}=setup();try{
 const old=s.saveGoal('alice',{...target(),effectiveAt:Date.parse('2026-10-10T00:00:00Z')});
 assert.equal(old.version,1);
 const next=s.saveGoal('alice',{...target(),id:old.id,target:240,expectedVersion:1,effectiveAt:Date.parse('2026-10-15T00:00:00Z')});
 assert.equal(next.version,2);
 assert.equal(s.listGoals('alice',{asOf:Date.parse('2026-10-12T00:00:00Z')})[0].version,1);
 assert.equal(s.listGoals('alice',{asOf:now})[0].version,2);
 const e=s.saveEvidence('alice',evidence('ev-a'));
 const state=s.progress('alice',old.id,{evidenceId:e.id});assert.equal(state.progress.observed,34);assert.equal(state.progress.delta,-206);
 assert.equal(state.progress.aggregation,'rolling-distinct');
 assert.throws(()=>s.saveGoal('alice',{...target(),id:old.id,target:280,expectedVersion:1}),/版本冲突/);
 assert.equal(s.listGoals('bob').length,0);assert.equal(s.getEvidence('bob','ev-a'),null);
 }finally{close()}
});
test('unknown and immature observations never become zero or negative business outcomes',()=>{
 const {s,close}=setup();try{const goal=s.saveGoal('alice',target());assert.equal(s.progress('alice',goal.id).progress.observed,null);
  const immature={...evidence('immature','immature',null)};s.saveEvidence('alice',immature);
  assert.equal(s.progress('alice',goal.id,{evidenceId:immature.id}).progress.delta,null);
  assert.throws(()=>s.saveEvidence('alice',{...immature,value:0,id:'fake'}),/必须为 null/);
 }finally{close()}
});
test('same unresolved data issue remains one across days, resolved and recurring issue makes new episode',()=>{
 const {s,close}=setup();try{
  const a=s.saveEvidence('alice',evidence('coverage-1','unavailable',null));
  const payload={type:'data-quality',subject:'X attribution unobserved',scope:{source:'x'},description:'身份关联覆盖未知',evidenceIds:[a.id],impact:{status:'unknown'},nextStep:'核对源权限和水位'};
  let p=s.observeProblem('alice',payload);assert.equal(p.created,true);now+=86400000;
  let again=s.observeProblem('alice',payload);assert.equal(again.created,false);assert.equal(again.id,p.id);assert.equal(s.problems('alice').length,1);
  assert.equal(s.problemEvents('alice',p.id).length,1);
  s.setProblemStatus('alice',p.id,'resolved',{reason:'数据源完成核验'});
  const returned=s.observeProblem('alice',payload);assert.notEqual(returned.id,p.id);assert.equal(returned.episode,2);
  assert.equal(s.problems('bob').length,0);
 }finally{close()}
});
test('owner question can exist without goal; wait, answer, idempotent repeat, cancel',()=>{
 const {s,close}=setup();try{
  const p=s.observeProblem('alice',{type:'user',subject:'排查推荐人',description:'这些推荐人带来的激活如何',scope:{source:'all'}});
  assert.equal(p.goal_id,null);
  const run=s.startRun('alice',p.id);const q=s.ask('alice',run.id,{question:'是否排除内部用户?',reason:'避免污染推荐统计',impact:'确定正式推荐人群',blocking:true});
  assert.equal(s.run('alice',run.id).state,'waiting_input');assert.throws(()=>s.answer('bob',q.id,'是'),/提问不存在/);
  assert.equal(s.answer('alice',q.id,'是').run.state,'queued');assert.equal(s.answer('alice',q.id,'是').status,'already-answered');
  assert.throws(()=>s.answer('alice',q.id,'否'),/不同回答/);
  assert.equal(s.cancelRun('alice',run.id).cancelled,true);
  assert.throws(()=>s.finishRun('alice',run.id,{evidenceIds:[]}),/已结束/);
 }finally{close()}
});
test('human action requires execution evidence and maturity, negative directional metric respects decline',()=>{
 const {s,close}=setup();try{
  const p=s.observeProblem('alice',{type:'business',subject:'注册后分析路径',description:'漏斗耗时过高',scope:{source:'all'}});
  const a=s.createAction('alice',p.id,{description:'优化路径',assignee:'growth',metricId:'time_to_analysis',direction:'decrease'});
  assert.throws(()=>s.updateAction('alice',a.id,'executed'),/不允许/);
  s.updateAction('alice',a.id,'accepted');s.updateAction('alice',a.id,'executing');
  s.saveEvidence('alice',evidence('before','verified',40));
  s.updateAction('alice',a.id,'executed',{actualAction:'上线新引导',baselineEvidenceId:'before',observeUntil:now+86400000});
  assert.equal(s.reviewAction('alice',a.id,{afterEvidenceId:'before'}).status,'immature');
  now+=2*86400000;s.saveEvidence('alice',{...evidence('after','verified',25),
   period:{start:atBangkok(2026,9,20),end:atBangkok(2026,9,22),timezone:'Asia/Bangkok'}});
  const result=s.reviewAction('alice',a.id,{afterEvidenceId:'after',confounders:['同期推广变化']});
  assert.equal(result.outcome,'observed-improvement');assert.equal(result.causalityEstablished,false);
 }finally{close()}
});
test('weekly and leap-year monthly boundaries are Bangkok complete periods',()=>{
 const p=lastCompleted('monthly',Date.parse('2024-03-01T01:00:00Z'));
 assert.equal(new Date(p.start).toISOString(),'2024-01-31T17:00:00.000Z');
 assert.equal(new Date(p.end).toISOString(),'2024-02-29T17:00:00.000Z');
 const w=lastCompleted('weekly',Date.parse('2026-10-28T01:00:00Z'));
 assert.equal((w.end-w.start)/86400000,7);
});
test('published monthly report immutability, explicit revision, no-new-findings semantics and owner isolation',()=>{
 const {s,close}=setup();try{
  const t=s.saveGoal('alice',target());
  const published=s.buildReport('alice','daily',{publish:true});
  assert.equal(published.snapshot.message.startsWith('没有新的重要发现'),true);
  s.observeProblem('alice',{type:'data-quality',subject:'missing-gsc',scope:{source:'gsc'},description:'同步状态未知'});
  const same=s.buildReport('alice','daily',{publish:true});assert.equal(same.id,published.id);
  const amended=s.buildReport('alice','daily',{forceRevision:true,publish:true});assert.equal(amended.revision,2);
  assert.equal(s.reportList('bob').length,0);
  assert.equal(s.goalById('alice',t.id,1).version,1);
 }finally{close()}
});
test('repeated start for same unresolved investigation is idempotent',()=>{
 const {s,close}=setup();try{
  const p=s.observeProblem('alice',{type:'user',subject:'同一个转化问题',description:'重复点击不新建调查',scope:{source:'all'}});
  const a=s.startRun('alice',p.id),b=s.startRun('alice',p.id);
  assert.equal(a.id,b.id);assert.equal(b.reused,true);
 }finally{close()}
});
test('goal progress rejects evidence from another metric, scope or future period',()=>{
 const {s,close}=setup();try{
  const goal=s.saveGoal('alice',target());
  const scoped={...evidence('wrong-metric'),metricId:'different',unit:'users',scope:{source:'all'}};
  s.saveEvidence('alice',scoped);
  assert.equal(s.progress('alice',goal.id,{evidenceId:scoped.id}).progress.observed,null);
  const wrongVersion={...scoped,id:'wrong-version',metricId:'four_day_core',definitionVersion:'other',state:'partial'};
  s.saveEvidence('alice',wrongVersion);
  assert.equal(s.progress('alice',goal.id,{evidenceId:wrongVersion.id}).progress.observed,null);
  const wrongScope={...scoped,id:'wrong-scope',metricId:'four_day_core',scope:{source:'x'}};
  s.saveEvidence('alice',wrongScope);
  assert.equal(s.progress('alice',goal.id,{evidenceId:wrongScope.id}).progress.observed,null);
  const future={...scoped,id:'future',metricId:'four_day_core',period:{start:now,end:now+86400000,timezone:'Asia/Bangkok'}};
  s.saveEvidence('alice',future);
  assert.equal(s.progress('alice',goal.id,{at:now,evidenceId:future.id}).progress.observed,null);
 }finally{close()}
});

test('dashboard batch reuses one owner-scoped evidence scan and preserves per-goal progress',()=>{
 const {db,s,close}=setup();try{
  const all=s.saveGoal('alice',target());
  const x=s.saveGoal('alice',{...target(),scope:{source:'x'}});
  s.saveEvidence('alice',evidence('all-metric','verified',41,now-1000));
  s.saveEvidence('alice',{...evidence('x-metric','verified',17),scope:{source:'x'}});
  s.saveEvidence('bob',evidence('bob-metric','verified',999));
  const expected=[all,x].map(goal=>({goal,progress:s.progress('alice',goal.id).progress}))
   .sort((a,b)=>a.goal.id.localeCompare(b.goal.id));
  let scans=0;
  const dbProxy={exec:sql=>db.exec(sql),prepare(sql){
   if(sql.includes('FROM gw_evidence WHERE owner_id=? AND observed_at<=?'))scans++;
   return db.prepare(sql);
  }};
  const batched=workspaceStore(dbProxy,{clock:()=>now});
  const result=batched.dashboardGoals('alice',{start:monthStart,end:monthEnd});
  assert.deepEqual(result,expected);
  assert.equal(scans,1);
  assert.deepEqual(batched.dashboardGoals('charlie',{start:monthStart,end:monthEnd}),[]);
  assert.equal(scans,1,'no goals must skip the evidence scan');
  const byId=new Map(result.map(row=>[row.goal.id,row.progress]));
  assert.equal(byId.get(all.id).observed,41);
  assert.equal(byId.get(x.id).observed,17);
 }finally{close()}
});

test('daily North Star evidence is not silently substituted for monthly distinct progress',()=>{
 const {s,close}=setup();try{
  const monthly=s.saveGoal('alice',{...target(),metricId:'active_users',definitionVersion:'1'});
  s.saveEvidence('alice',{...evidence('north-day','verified',60),
   metricId:'active_users',definitionVersion:'1',
   period:{start:atBangkok(2026,9,19),end:atBangkok(2026,9,20),timezone:'Asia/Bangkok'}});
  assert.equal(s.progress('alice',monthly.id).progress.status,'unknown');
  assert.equal(s.progress('alice',monthly.id).progress.observed,null);
 }finally{close()}
});

test('review rejects cross-metric or overlapping after evidence as insufficient rather than learning false improvement',()=>{
 const {s,close}=setup();try{
  const p=s.observeProblem('alice',{type:'business',subject:'Cohort analysis',scope:{source:'all'}});
  const a=s.createAction('alice',p.id,{description:'Review funnel',assignee:'growth',metricId:'four_day_core',direction:'increase'});
  s.saveEvidence('alice',evidence('before-review','verified',100));
  s.updateAction('alice',a.id,'accepted');s.updateAction('alice',a.id,'executing');
  s.updateAction('alice',a.id,'executed',{actualAction:'Done',baselineEvidenceId:'before-review',observeUntil:now+86400000});
  now+=2*86400000;
  s.saveEvidence('alice',{...evidence('after-other','verified',150),metricId:'other-metric',
   period:{start:atBangkok(2026,9,20),end:atBangkok(2026,9,22),timezone:'Asia/Bangkok'}});
  const review=s.reviewAction('alice',a.id,{afterEvidenceId:'after-other'});
  assert.equal(review.outcome,'insufficient-evidence');
  assert.equal(review.causalityEstablished,false);
 }finally{close()}
});

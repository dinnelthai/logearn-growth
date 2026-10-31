const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
const {createEvidenceStore,makeEvidence,validateClaims}=require('../src/ai/business/evidence');
const context={ownerId:'alice',scope:{source:'twitter'},period:{start:100,end:200,timezone:'Asia/Bangkok'}};
function setup(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));return db;}
test('immutable evidence retains source-specific watermarks, unknown values and reproducible archives',()=>{
 const db=setup(),store=createEvidenceStore(db);try{
 const input={metricId:'activation_rate',value:null,numerator:0,denominator:0,sampleSize:0,coverage:{trades:'unknown'},watermarks:{events:150,trades:null},sourceVersions:{events:'a',trades:null}};
 const e=makeEvidence(input,context);store.save(e,context);input.watermarks.events=199;
 assert.equal(store.get(e.id,context).watermarks.events,150);assert.equal(store.get(e.id,context).value,null);assert.match(e.queryFingerprint,/^[a-f0-9]{64}$/);
 assert.throws(()=>store.save({...e,value:123},context),/不可变/);assert.throws(()=>store.get(e.id,{...context,ownerId:'bob'}),/权限/);
 assert.throws(()=>store.get(e.id,{...context,scope:{source:'google'}}),/范围/);
 assert.throws(()=>makeEvidence({...input,value:0},context),/分母/);
 }finally{db.close()}
});
test('claims reject invented IDs, wrong numbers and cross-owner or cross-scope evidence',()=>{
 const db=setup(),store=createEvidenceStore(db);try{
 const e=makeEvidence({metricId:'active_users',value:12},context);store.save(e,context);
 const check=claims=>validateClaims(claims,context,store);
 assert.throws(()=>check([{id:'x',kind:'fact',text:'x',evidenceIds:['fake']}]),/权限/);
 assert.throws(()=>check([{id:'x',kind:'fact',text:'x',evidenceIds:[e.id],values:[{evidenceId:e.id,value:13}]}]),/数值/);
 const result=check([{id:'x',kind:'hypothesis',text:'入口可能影响',evidenceIds:[e.id],uncertainties:['需实验']}]);assert.equal(result[0].semanticStatus,'needs_evaluation');
 assert.throws(()=>validateClaims([{id:'x',kind:'fact',text:'12',evidenceIds:[e.id]}],{...context,ownerId:'bob'},store),/权限/);
 }finally{db.close()}
});

test('owner-scoped observed tool durations require at least three real archived successes',()=>{
 const db=setup(),store=createEvidenceStore(db);
 try{
  const now=Date.now(),bob={...context,ownerId:'bob'};
  const add=(ownerId,tool,elapsedMs)=>{
   const ctx={...context,ownerId};
   const e=makeEvidence({metricId:'active_users',value:1,
    query:{tool,body:{start:100,end:200,source:'twitter'}},
    executionTiming:{elapsedMs}},ctx);
   store.save(e,ctx);
   return e;
  };
  for(const ms of [12,35,20])add('alice','get_channels',ms);
  // A known tool query from another scope must not distort this cohort's
  // latency estimate even if it belongs to the same owner.
  const differentScope={...context,scope:{source:'all'}};
  for(const ms of [0,0,0]){
   const ev=makeEvidence({metricId:'active_users',value:1,
    query:{tool:'get_channels'},executionTiming:{elapsedMs:ms}},differentScope);
   store.save(ev,differentScope);
  }
  const differentPeriod={...context,period:{start:100,end:100+30*86400000,
   timezone:'Asia/Bangkok'}};
  for(const ms of [1,1,1]){
   const ev=makeEvidence({metricId:'active_users',value:1,
    query:{tool:'get_channels'},executionTiming:{elapsedMs:ms}},differentPeriod);
   store.save(ev,differentPeriod);
  }
  for(const ms of [1,2,3,4])add('bob','get_channels',ms);
  add('alice','get_paths',5);add('alice','get_paths',10);
  add('alice','get_funnel',-1);
  const observed=store.recentToolTimings(context,{now});
  assert.equal(observed.get_channels.sampleCount,3);
  assert.equal(observed.get_channels.medianMs,20);
  assert.equal(observed.get_channels.basis,'owner-archived-successful-tool-wall-time');
  assert.equal(observed.get_channels.monetaryCostKnown,false);
  assert.equal(observed.get_paths,undefined,'insufficient samples never imply cheap');
  assert.equal(observed.get_funnel,undefined,'invalid duration is not a zero cost');
  assert.equal(store.recentToolTimings(bob,{now}).get_channels.medianMs,3);
  assert.notEqual(store.recentToolTimings(bob,{now}).get_channels.medianMs,
   observed.get_channels.medianMs);
  assert.equal(store.recentToolTimings({...context,ownerId:'charlie'},{now}).get_channels,
   undefined);
  const saved=add('alice','get_referral',25);
  assert.equal(store.get(saved.id,context).executionTiming.elapsedMs,25);
  assert.equal(store.get(saved.id,context).executionTiming.monetaryCostKnown,false);
  assert.throws(()=>store.recentToolTimings(context,{minSamples:1}),/参数无效/);
 }finally{db.close()}
});

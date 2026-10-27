const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const {createContextStore}=require('../src/ai/business/context');
const {resolveScope}=require('../src/ai/business/scope');
const metrics=require('../src/ai/business/metricRegistry');
function setup(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));return db;}
test('goal versions are immutable, owner scoped and pinned to a run',()=>{
 const db=setup(),store=createContextStore(db);try{
 const a=store.saveGoal('alice',{id:'activation',value:200,deadline:'2026-11-30',resources:['ops'],budget:{tokens:5000},priority:'P1'});
 store.pinRun('alice','r1',a.id,a.version);store.saveGoal('alice',{...a,value:300});
 assert.equal(store.getGoal('alice','activation',1).value,200);assert.equal(store.getRunGoal('alice','r1').value,200);
 assert.equal(store.getGoal('bob','activation',1),null);assert.equal(store.getRunGoal('bob','r1'),null);
 assert.throws(()=>store.pinRun('alice','r1','activation',2),/固定/);
 const change=store.saveChange('alice',{kind:'product',content:'入口改版',occurredAt:100,validUntil:200,source:'release-1'});
 assert.equal(store.listChanges('bob').length,0);assert.equal(change.occurredAt,100);assert.ok(change.recordedAt>100);
 }finally{db.close()}
});
test('scope resolves authorized fixed membership intersections without broadening empty sets',async()=>{
 const lookups={activity:async(id,owner)=>owner==='alice'?{ids:['1','2'],fixed:true}:null,cohort:async(id,owner)=>owner==='alice'?{ids:['3'],fixed:true}:null};
 const context={ownerId:'alice',scope:{source:'twitter'}};
 const s=await resolveScope({source:'twitter',activityId:'a',cohortId:'c'},context,lookups);assert.deepEqual(s.audience,[]);
 await assert.rejects(()=>resolveScope({source:'all'},context,lookups),/范围/);
 await assert.rejects(()=>resolveScope({activityId:'a'},{ownerId:'bob'},lookups),/权限/);
 await assert.rejects(()=>resolveScope({cohortId:'dynamic'},context,{...lookups,cohort:async()=>({fixed:false})}),/固定/);
 await assert.rejects(()=>resolveScope({ownerId:'bob'},context,lookups),/字段/);
});
test('metric definitions distinguish registrations and first observation, and expose review capability',()=>{
 assert.notEqual(metrics.describeMetric('new_users').definition,metrics.describeMetric('registered_users').definition);
 assert.equal(metrics.describeMetric('trade_revenue').reviewAdapter,null);
 assert.equal(metrics.describeMetric('new_users').unit,'users');assert.ok(metrics.describeMetric('d7').maturityRule);
 assert.throws(()=>metrics.describeMetric('invented'),/指标/);
});

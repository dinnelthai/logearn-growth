const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
const {createFoundation}=require('../src/ai/business/foundation');
test('analysis foundation archives initial numbers, fixes goal version and validates final citations',()=>{
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(require.resolve('../src/db/schema.sql'),'utf8'));try{
 const f=createFoundation(db,{listCapabilities:()=>[{id:'get_paths'}]});
 f.contextStore.saveGoal('alice',{id:'goal',value:200,deadline:'2026-11-30'});
 const period={start:100,end:200,previousStart:0,previousEnd:100,timezone:'Asia/Bangkok'};
 const report={period,business:{scope:{source:'all'}},snapshot:{id:'s',asOf:150},current:{totals:{active_users:12}},previous:{totals:{active_users:10}},growth:{channels:[]},weekly:{available:false},warnings:[]};
 const session=f.prepare(report,{ownerId:'alice',runId:'run',goalRef:{id:'goal',version:1}});
 assert.equal(session.context.goal.version,1);assert.equal(session.context.evidence.length,3);assert.equal(session.context.capabilities[0].id,'get_paths');
 assert.throws(()=>session.validate({claims:[{id:'bad',kind:'fact',text:'fake',evidenceIds:['fake']}],suggestions:[]}),/权限/);
 const e=session.context.evidence[0];const a={claims:[{id:'c',kind:'fact',text:'观测人数12',evidenceIds:[e.id],values:[{evidenceId:e.id,value:12}]}],suggestions:[]};session.validate(a);assert.equal(a.claims[0].referenceStatus,'verified');
 }finally{db.close()}
});

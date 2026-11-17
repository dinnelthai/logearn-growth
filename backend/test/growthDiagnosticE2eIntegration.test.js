'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{Pool}=require('pg'),{randomUUID}=require('node:crypto');
const {createAlertStore}=require('../src/ai/growth/alertStore');
const {createInvestigationStore}=require('../src/ai/growth/investigationStore');
const {createInvestigationTimeline}=require('../src/ai/growth/investigationTimeline');
const {scanDailyAlerts}=require('../src/ai/growth/monitor');
const {buildGrowthInbox}=require('../src/ai/growth/inbox');
const DAY=86400000,end=Date.parse('2026-10-25T17:00:00Z');
test('PostgreSQL V1 flow: alert -> durable proposal -> single inbox item -> human approval gate',
 {skip:process.env.AI_P0_INTEGRATION!=='1'},async()=>{
 const db=new Pool({connectionString:process.env.AI_DATABASE_URL,max:2});
 const owner='growth-e2e-'+randomUUID();
 const alerts=createAlertStore((sql,args)=>db.query(sql,args));
 const proposals=createInvestigationStore((sql,args)=>db.query(sql,args));
 async function insertDaily(dayEnd,active){
  const id=randomUUID();
  const context={version:'business-evidence-v1',period:{start:dayEnd-DAY,end:dayEnd},
   business:{scope:{source:'all'}},focusGoal:'activation',
   snapshot:{id:randomUUID(),asOf:new Date(dayEnd+3600000).toISOString(),
    eventsCompleteThrough:new Date(dayEnd).toISOString(),historyComplete:true},
   growth:{quality:{truncated:false}},
   current:{totals:{active_users:active,new_users:20,returning_users:20}}};
  await db.query(`INSERT INTO ai_analysis_records
   (id,owner_id,title,analysis_type,date_range_start,date_range_end,business_scope,
   user_question,data_snapshot,filter_conditions,status,created_at,request_key)
   VALUES ($1,$2,'growth-e2e','optimization',$3,$4,$5,'',$6,$7,'completed',$8,$9)`,
   [id,owner,dayEnd-DAY,dayEnd,JSON.stringify({source:'all'}),
    JSON.stringify(context),JSON.stringify({dailySchedule:'v1',focusGoal:'activation'}),
    Date.now(),randomUUID()]);
 }
 try{
  await db.query(fs.readFileSync(require.resolve('../src/db/migrations/001_ai_tables.sql'),'utf8'));
  await insertDaily(end,100);
  await insertDaily(end+DAY,55);
  const first=await scanDailyAlerts({ownerId:owner,goal:'activation',store:alerts,
   proposalStore:proposals,now:end+3*DAY});
  assert.equal(first.newObservations,1);
  assert.equal(first.proposedInvestigations,1);
  const a=await alerts.list(owner),p=await proposals.list(owner);
  assert.equal(a.length,1);assert.equal(p.length,1);
  assert.equal((await alerts.list('another-owner')).length,0);
  assert.equal((await proposals.list('another-owner')).length,0);
  const inbox=buildGrowthInbox({alerts:a,proposals:p,now:end+3*DAY});
  assert.equal(inbox.counts.proposalApprovals,1);
  assert.equal(inbox.counts.alerts,0,'proposal must not duplicate its alert');
  assert.equal(inbox.tasks[0].evidenceStatus,'traceable-observation');
  const timeline=createInvestigationTimeline({proposalStore:proposals,alertStore:alerts,
   recordsApi:{getAnalysisRecord(){throw Error('must not load any paid work')}}});
  const awaiting=await timeline.get(owner,p[0].id);
  assert.equal(awaiting.stage,'awaiting-approval');
  assert.equal(awaiting.analysis,null);
  assert.equal(await timeline.get('another-owner',p[0].id),null);
  assert.equal((await scanDailyAlerts({ownerId:owner,goal:'activation',store:alerts,
    proposalStore:proposals,now:end+3*DAY})).newObservations,0);
  const approved=await proposals.decide(owner,p[0].id,p[0].version,'approve',end+3*DAY);
  assert.equal(approved.status,'approved');
  const after=await timeline.get(owner,p[0].id);
  assert.equal(after.stage,'approved-awaiting-dispatch');
  assert.equal(after.paidCalls,0);
  assert.equal(after.externalActions,0);
 }finally{
  for(const [table]of [['ai_growth_notifications'],['ai_growth_investigation_proposals'],
   ['ai_growth_alerts'],['ai_analysis_records']]){
   await db.query('DELETE FROM '+table+' WHERE owner_id=$1',[owner]).catch(()=>{});
  }
  await db.end();
 }
});

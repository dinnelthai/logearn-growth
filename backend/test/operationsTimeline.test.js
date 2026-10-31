'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {createOperationsTimeline,dateInZone}=require('../src/ai/business/tools/operationsTimeline')
const DAY=86400000,now=Date.parse('2026-10-31T00:00:00Z')
const start=Date.parse('2026-10-01T00:00:00Z'),end=start+DAY
function fakeDb(){
 const calls=[]
 const db={calls,prepare(sql){return {all(...args){
  calls.push({sql,args})
  if(sql.includes('FROM growth_activities'))return [{id:'act-1',name:'Launch campaign',start_at:start,cutoff_at:end,goal:'activation',target_metric:'new_users',target_value:20,schedule_state:'active',schedule_error:null,archived_at:null,settled_at:end,settled_result:JSON.stringify({
   summary:{total:10,eligible:8,completed:4,conversion_rate:.5,prior:2,active:1,inactive:3,review:0},
   performance:{total:{users:10,analysis_users:4,analysis_events:12,analysis_days:5,trade_users:2,transactions:3,volume_usd:99,missing_values:0,excluded_trades:0}},
   target_progress:{metric:'first_analysis_users',target:20,actual:4,ratio:.2,status:'in_progress',partial:false},
   performance_errors:{analysis:null,trade:null,account:null},rows:[{user_id:'user-123',analysis_events:99}]
  }),parent_id:null}]
  if(sql.includes('FROM crm_activity_links'))return [{activity_id:'act-1',name:'KOL One'}]
  if(sql.includes('FROM growth_activity_members'))return [{activity_id:'act-1',count:10}]
  if(sql.includes('FROM growth_activity_planned_members'))return [{activity_id:'act-1',count:12}]
  if(sql.includes('FROM growth_activity_assignments'))return [
   {activity_id:'act-1',group_key:'treatment',assigned:4,delivered:3,sent_unconfirmed:0,
    not_delivered:0,delivery_unknown:1,cross_exposed:1,retrospective_records:1,
    first_delivery_at:start,last_delivery_at:end},
   {activity_id:'act-1',group_key:'control',assigned:3,delivered:1,sent_unconfirmed:1,
    not_delivered:0,delivery_unknown:1,cross_exposed:0,retrospective_records:0,
    first_delivery_at:start,last_delivery_at:end}
  ]
  if(sql.includes('FROM growth_activity_schedule_history'))return [
   {activity_id:'act-1',action:'rescheduled',count:2,first_at:start,last_at:end}
  ]
  if(sql.includes('FROM crm_collaborations c'))return [{id:'collab-1',kol_id:'kol-1',name:'KOL placement',start_at:start,end_at:end,goal:'reach',deliverables:'one post',assignee:'Alex',status:'completed',created_at:start,updated_at:end,kol_name:'KOL One'}]
  if(sql.includes('FROM crm_collaboration_activities'))return [{collaboration_id:'collab-1',activity_id:'act-1'}]
  if(sql.includes('FROM content_growth_items'))return [{id:'content-1',platform:'x',title:'Launch thread',topic:'product',published_at:new Date(start+1000).toISOString(),created_at:new Date(start+1000).toISOString(),impressions:100,likes:5,comments:2,shares:3,audience_fit:4,actionability:5}]
  if(sql.includes('FROM operation_tasks'))return [{id:'task-1',title:'Review activation cohort',assignee:'Alex',priority:'P1',status:'done',due_at:end,created_at:start,updated_at:end,completed_at:end}]
  if(sql.includes('FROM agent_changes'))return [{body:JSON.stringify({id:'change-1',kind:'activity',content:'Completed onboarding workshop for the community',source:'operator-note',occurredAt:start+2000,validUntil:end,recordedAt:now})}]
  if(sql.includes('FROM business_analysis_actions'))return [{id:'ai-action-1',title:'Test onboarding',priority:'P1',status:'executed',executed_at:end,created_at:start,updated_at:end,review_json:JSON.stringify({conclusion:'improved',warnings:[]}),report_title:'Weekly growth report'}]
  return []
 }} }};
 return db
}
function sources(db,{xError=false,xUnsynced=false}={}){
 return {
  db,
  kolOperations:{
   collaborations:async()=>[{collaborationId:'collab-1',financeSource:'manual-ledger',costTotals:[{currency:'USD',actual_cost:100}],revenueTotals:[{currency:'USD',net_revenue:120}]}],
   list:async()=>[{id:'kol-snap-1',start_at:start,end_at:end,evidence:JSON.stringify({scope:'tagged',rows:[{observedUsers:5,analysisEvents:10}]}),coverage:{status:'partial'},source_watermark:new Date(end).toISOString(),captured_at:end}]
  },
  xMonitor:{overview:()=>{if(xError)throw Error('provider down');return {configured:true,source:'twitterapi.io',attribution:'not-verified',accounts:[{
   id:'logearn_cn',label:'中文账号',lastSynced:xUnsynced?null:now,lastAttempt:null,metrics:{samplePosts:99,impressions:9999},
   posts:xUnsynced?[]:[
    {post_id:'p1',published_at:new Date(start+1000).toISOString(),body:'PRIVATE POST BODY',impressions:100,likes:5,replies:2,reposts:3,quotes:1,observed_at:now},
    {post_id:'old',published_at:new Date(start-1000).toISOString(),body:'OUTSIDE',impressions:500,likes:1,replies:1,reposts:1,quotes:0,observed_at:now}
   ]
  }]}}},
  gscService:{
   setting:async()=>({site_url:'sc-domain:logearn.com'}),
   latestOverlapping:async(owner,args)=>{assert.equal(owner,'owner-1');assert.equal(args.startDate,'2026-09-30');assert.equal(args.endDate,'2026-10-01');return {id:'gsc-1',site_url:'sc-domain:logearn.com',fetched_at:now}}
  },
  summarizeGscWindow:()=>({startDate:'2026-09-30',endDate:'2026-10-01',syncedAt:now,metrics:{clicks:10,impressions:100,ctr:.1,position:5},coverage:{status:'partial',periodMatched:false},warnings:['PT date range']}),
  specialistStore:{list:async(owner,args)=>{assert.equal(owner,'owner-1');assert.equal(args.includeClosed,true);return [{id:'signal-1',kind:'seo',title:'Improve landing page',priority:'P1',status:'open',first_seen_at:start,last_seen_at:end,occurrences:2}]}}
 }
}
test('timeline merges existing owner-scoped records but keeps human, channel and AI layers separate',async()=>{
 const db=fakeDb(),deps=sources(db),errors=[];
 const timeline=createOperationsTimeline({...deps,clock:()=>now,onReadError:(key,error)=>errors.push({key,message:error.message})});
 const result=await timeline.collect({start,end,source:'all',limit:60},{ownerId:'owner-1'});
 assert.deepEqual(result.period,{start,end,timezone:'Asia/Bangkok',endExclusive:true});
 assert.deepEqual(errors,[]);
 assert.equal(result.humanOperations.length,5);
 assert.equal(result.channelObservations.length,3);
 assert.equal(result.aiActions.length,2);
 assert.equal(result.timeline.length,10);
 assert.ok(result.humanOperations.every(x=>['human_operation','human_managed_task'].includes(x.layer)));
 assert.ok(result.channelObservations.every(x=>x.layer==='channel_observation'));
 assert.ok(result.aiActions.every(x=>x.layer==='ai_suggestion_or_review'));
 const x=result.channelObservations.find(x=>x.kind==='x_official_account');
 assert.equal(x.metrics.impressions,100);
 assert.equal(x.metrics.samplePosts,1);
 assert.equal(x.samplePosts.length,1);
 assert.deepEqual(result.coverage.xOfficial.accounts.map(x=>[x.account,x.status]),
  [['中文账号','available']]);
 assert.equal(JSON.stringify(result).includes('PRIVATE POST BODY'),false);
 assert.equal(JSON.stringify(result).includes('OUTSIDE'),false);
 const collab=result.humanOperations.find(x=>x.kind==='kol_collaboration');
 assert.equal(collab.costTotals[0].currency,'USD');
 assert.deepEqual(collab.linkedActivityIds,['act-1']);
 const activity=result.humanOperations.find(x=>x.kind==='growth_activity');
 assert.deepEqual(activity.linkedKols,['KOL One']);
 assert.equal(activity.memberCount,10);
 assert.equal(activity.plannedMemberCount,12);
 assert.equal(activity.outcome.status,'settled');
 assert.equal(activity.outcome.summary.completed,4);
 assert.equal(activity.outcome.performance.trade_users,2);
 assert.equal(activity.outcome.targetProgress.actual,4);
 assert.deepEqual(activity.outcome.sourceCoverage,{analysis:'available',trade:'available',account:'available'});
 assert.deepEqual(activity.assignments.map(x=>[x.group,x.assigned]),[['treatment',4],['control',3]]);
 assert.deepEqual(activity.assignments.map(x=>[x.delivered,x.sentUnconfirmed,x.notDelivered,x.deliveryUnknown,x.crossExposed,x.retrospectiveRecords]),
  [[3,0,0,1,1,1],[1,1,0,1,0,0]]);
 assert.deepEqual(activity.scheduleChanges.map(x=>[x.action,x.count]),[['rescheduled',2]]);
 assert.equal(JSON.stringify(activity).includes('user_id'),false);
 assert.equal(JSON.stringify(activity).includes('user-123'),false);
 assert.equal(result.coverage.searchConsole.periodMatched,false);
 assert.equal(result.coverage.contentRecords.collection,'manual');
 const operatorNote=result.humanOperations.find(x=>x.kind==='operator_note');
 assert.equal(operatorNote.title,'Completed onboarding workshop for the community');
 assert.equal(operatorNote.topic,'activity');
 assert.equal(operatorNote.status,'recorded');
 assert.equal(result.coverage.operatorNotes.verification,'self-reported');

 assert.ok(db.calls.some(c=>c.sql.includes('FROM growth_activities')&&c.args[0]==='owner-1'));
 assert.ok(db.calls.some(c=>c.sql.includes('growth_activity_assignments')&&c.args[0]==='owner-1'));
 assert.ok(db.calls.some(c=>c.sql.includes('growth_activity_delivery_evidence')&&c.args[0]==='owner-1'));
 assert.match(result.warnings.join(' '),/AI 建议/);
 assert.match(result.warnings.join(' '),/社群与培训/);
});

test('one source failure is isolated and does not erase the other operating records',async()=>{
 const db=fakeDb(),deps=sources(db,{xError:true}),errors=[];
 const result=await createOperationsTimeline({...deps,clock:()=>now,onReadError:(key,error)=>errors.push({key,message:error.message})})
  .collect({start,end,source:'all',limit:60},{ownerId:'owner-1'});
 assert.equal(result.coverage.xOfficial.status,'unavailable');
 assert.deepEqual(errors.map(x=>x.key),['xOfficial']);
 assert.equal(result.humanOperations.length,5);
 assert.equal(result.channelObservations.length,2);
 assert.equal(result.aiActions.length,2);
});

test('successfully synced X accounts with no posts in the selected period are empty',async()=>{
 const deps=sources(fakeDb());
 deps.xMonitor.overview=()=>({configured:true,source:'twitterapi.io',attribution:'not-verified',accounts:[
  {id:'logearn_cn',label:'中文账号',lastSynced:now,posts:[]}
 ]});
 const result=await createOperationsTimeline({...deps,clock:()=>now})
  .collect({start,end,source:'all',limit:60},{ownerId:'owner-1'});
 assert.equal(result.coverage.xOfficial.status,'empty');
 assert.deepEqual(result.coverage.xOfficial.accounts.map(x=>x.status),['empty']);
});
test('configured X accounts with no successful sync are not reported as empty',async()=>{
 const deps=sources(fakeDb(),{xUnsynced:true});
 const result=await createOperationsTimeline({...deps,clock:()=>now})
  .collect({start,end,source:'all',limit:60},{ownerId:'owner-1'});
 assert.equal(result.coverage.xOfficial.status,'not_synced');
 assert.deepEqual(result.coverage.xOfficial.accounts.map(x=>x.status),['not_synced']);
 assert.equal(result.channelObservations.some(x=>x.kind==='x_official_account'),true);
 assert.equal(result.channelObservations.find(x=>x.kind==='x_official_account').metrics.samplePosts,0);
});
test('date conversion uses Pacific dates for Search Console rather than Bangkok calendar labels',()=>{
 assert.equal(dateInZone(start,'America/Los_Angeles'),'2026-09-30');
 assert.equal(dateInZone(end-1,'America/Los_Angeles'),'2026-10-01');
});

test('timeline rejects invalid periods, unsupported source filters and unauthenticated owners',async()=>{
 const service=createOperationsTimeline({...sources(fakeDb()),clock:()=>now});
 await assert.rejects(service.collect({start,end:start,source:'all'},{ownerId:'owner-1'}),e=>e.status===400);
 await assert.rejects(service.collect({start,end,source:'direct'},{ownerId:'owner-1'}),e=>e.status===400);
 await assert.rejects(service.collect({start,end,source:'all'},{}),e=>e.status===401);
 await assert.rejects(service.collect({start,end: start+32*DAY,source:'all'},{ownerId:'owner-1'}),e=>e.status===400);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dispatchDaily,dailyRequest}=require('../src/ai/growth/daily');
const {validateDailyReport,fromClaimedRecord}=require('../src/ai/growth/sharedDailyReport');
const now=Date.parse('2026-10-27T05:00:00Z');
const request=dailyRequest({ownerId:'alice',now});
const report=()=>({version:'business-evidence-v1',focusGoal:'activation',
 business:{scope:{source:'all'}},period:{start:request.period.start,end:request.period.end},
 snapshot:{id:'snapshot123456'},current:{totals:{active_users:12}},
 previous:{totals:{active_users:10}},growth:{channels:[]},candidates:[]});
test('daily record persists shared report without transporting data over Bull',async()=>{
 let record,queued=null;
 const records={createAnalysisRecord:async input=>{
  record={id:'one',status:'pending',date_range_start:input.dateRangeStart,
   date_range_end:input.dateRangeEnd,business_scope:input.businessScope,
   user_question:input.userQuestion,filter_conditions:input.filterConditions,
   data_snapshot:input.dataSnapshot};return record;
 }};
 const result=await dispatchDaily({ownerId:'alice',now,records,sharedReport:report(),
  enqueue:async(_type,data,opts)=>{queued=data;assert.equal(opts.attempts,1);return {id:'job'}}});
 assert.equal(result.status,'queued');
 assert.equal(record.data_snapshot.snapshot.id,'snapshot123456');
 assert.ok(!('dataSnapshot' in queued));
 assert.equal(fromClaimedRecord(record,{start:request.period.start,
  end:request.period.end,source:'all',goal:'activation'}).snapshot.id,'snapshot123456');
});
test('mismatched report or conflict cannot start a paid job',async()=>{
 assert.throws(()=>validateDailyReport(report(),{start:request.period.start,
  end:request.period.end,source:'other',goal:'activation'}),/不匹配/);
 const records={createAnalysisRecord:async input=>({id:'existing',status:'pending',
  date_range_start:input.dateRangeStart,date_range_end:input.dateRangeEnd,
  filter_conditions:{...input.filterConditions,sharedFactsSnapshotId:'other'},
  data_snapshot:{...input.dataSnapshot,snapshot:{id:'other'}}})};
 let calls=0;
 await assert.rejects(dispatchDaily({ownerId:'alice',now,records,
  sharedReport:report(),enqueue:async()=>{calls++}}),/快照/);
 assert.equal(calls,0);
});

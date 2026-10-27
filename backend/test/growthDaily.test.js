'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {previousBangkokDay,dailyRequest,dispatchDaily}=require('../src/ai/growth/daily');
test('daily reporting uses the previous completed Bangkok calendar day',()=>{
 const time=Date.parse('2026-10-27T02:15:00Z'); // Bangkok 09:15
 const period=previousBangkokDay(time);
 assert.equal(period.day,'2026-10-26');
 assert.equal(new Date(period.start).toISOString(),'2026-10-25T17:00:00.000Z');
 assert.equal(new Date(period.end).toISOString(),'2026-10-26T17:00:00.000Z');
});
test('same owner/day/goal/source yields same request key while daily windows rotate',()=>{
 const now=Date.parse('2026-10-27T03:00:00Z');
 const a=dailyRequest({ownerId:'alice',now}),b=dailyRequest({ownerId:'alice',now:now+3600000});
 assert.equal(a.requestKey,b.requestKey);
 assert.notEqual(a.requestKey,dailyRequest({ownerId:'alice',now:now+86400000}).requestKey);
 assert.notEqual(a.requestKey,dailyRequest({ownerId:'alice',now,goal:'retention'}).requestKey);
});
test('dispatch uses atomic unique request key and one-attempt Bull job',async()=>{
 let created=0,queued=0,record;
 const records={async createAnalysisRecord(input){
   created++;record=record||{id:'id-1',status:'pending',date_range_start:input.dateRangeStart,
     date_range_end:input.dateRangeEnd,business_scope:input.businessScope,
     user_question:input.userQuestion,filter_conditions:input.filterConditions};
   return record;
 }};
 const enqueue=async(type,data,opts)=>{
   queued++;assert.equal(type,'business-analysis');
   assert.equal(data.analysisId,'id-1');assert.equal(opts.attempts,1);assert.equal(opts.jobId,'id-1');
   assert.equal(data.focusGoal,'activation');return {id:opts.jobId};
 };
 const options={ownerId:'alice',now:Date.parse('2026-10-27T03:00:00Z'),records,enqueue};
 const result=await dispatchDaily(options);
 assert.equal(result.status,'queued');assert.equal(created,1);assert.equal(queued,1);
 record.status='completed';
 const repeat=await dispatchDaily(options);
 assert.equal(repeat.status,'already-completed');assert.equal(queued,1);
});
test('scheduler rejects unsafe owner and invalid time',()=>{
 assert.throws(()=>dailyRequest({ownerId:''}),/用户无效/);
 assert.throws(()=>dailyRequest({ownerId:'a',goal:'wrong'}),/目标无效/);
 assert.throws(()=>previousBangkokDay(-1),/时间无效/);
});

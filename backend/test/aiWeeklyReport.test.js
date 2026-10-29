'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {weeklyPeriod,weeklyKey,weeklyOperations,validateWeeklyReport}=require('../src/ai/growth/weeklyReport');

test('weekly report uses last complete Monday-Sunday Bangkok week',()=>{
 const period=weeklyPeriod(Date.parse('2026-10-29T09:00:00+07:00'));
 assert.equal(period.start,Date.parse('2026-10-19T00:00:00+07:00'));
 assert.equal(period.end,Date.parse('2026-10-26T00:00:00+07:00'));
 assert.equal(period.timezone,'Asia/Bangkok');
 assert.equal(weeklyKey(period),weeklyKey({...period}));
});
test('report evidence must occur in already validated claims',()=>{
 const report={claims:[{evidenceIds:['observed-1']}],weeklyReport:{
  executiveSummary:'基于已观测的真实周报',metrics:[{label:'有效分析',current:12,previous:10,changePct:20,evidenceIds:['observed-1']}],
  highlights:[{text:'观测指标改善',evidenceIds:['observed-1']}],issues:[],channelFindings:[],
  nextWeek:[{priority:'P1',action:'复核有效分析口径',metric:'有效分析',reviewCondition:'观察下一个完整周',evidenceIds:['observed-1']}],
  dataGaps:['渠道转化归因未覆盖']}};
 assert.equal(validateWeeklyReport(report),report.weeklyReport);
 report.weeklyReport.metrics[0].evidenceIds=['invented'];
 assert.throws(()=>validateWeeklyReport(report),/证据/);
 report.weeklyReport.metrics[0].evidenceIds=[];
 assert.throws(()=>validateWeeklyReport(report),/证据/);
});
test('unknown metrics remain unknown and can have no evidence',()=>{
 const report={claims:[],weeklyReport:{executiveSummary:'当前数据不足',
  metrics:[{label:'业务转化',current:null,previous:null,changePct:null,evidenceIds:[]}],
  highlights:[],issues:[],channelFindings:[],nextWeek:[],dataGaps:['业务数据尚未同步']}};
 assert.doesNotThrow(()=>validateWeeklyReport(report));
});
test('workspace context is bounded to aggregate counts without descriptions',()=>{
 const period=weeklyPeriod(Date.parse('2026-10-29T09:00:00+07:00'));
 const store={
  problems:()=>[{status:'open',type:'data-quality',first_seen:period.start,description:'sensitive'}],
  actions:()=>[{status:'executed',created_at:period.start,executed_at:period.start,review:null,description:'user task'}],
  listGoals:()=>[{id:'goal'}]
 };
 const result=weeklyOperations(store,'owner',period);
 assert.equal(result.newProblemCount,1);
 assert.equal(result.dataQualityCount,1);
 assert.equal(result.executedActionCount,1);
 assert.equal(result.goalsCount,1);
 assert.equal(JSON.stringify(result).includes('sensitive'),false);
 assert.equal(JSON.stringify(result).includes('user task'),false);
});

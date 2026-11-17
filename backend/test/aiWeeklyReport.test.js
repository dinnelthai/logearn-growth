'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {weeklyPeriod,reportPeriod,weeklyKey,weeklyOperations,validateWeeklyReport,ensureWeeklyReport}=require('../src/ai/growth/weeklyReport');

test('weekly report uses last complete Monday-Sunday Bangkok week',()=>{
 const period=weeklyPeriod(Date.parse('2026-10-29T09:00:00+07:00'));
 assert.equal(period.start,Date.parse('2026-10-19T00:00:00+07:00'));
 assert.equal(period.end,Date.parse('2026-10-26T00:00:00+07:00'));
 assert.equal(period.timezone,'Asia/Bangkok');
 assert.equal(weeklyKey(period),weeklyKey({...period}));
});
test('custom report period accepts exact Bangkok timestamps and rejects invalid windows',()=>{
 const now=Date.parse('2026-10-31T07:15:00+07:00');
 const start=Date.parse('2026-10-24T09:30:00+07:00');
 const end=Date.parse('2026-10-31T06:45:00+07:00');
 const period=reportPeriod({start:String(start),end:String(end)},now);
 assert.equal(period.kind,'custom');
 assert.equal(period.start,start);
 assert.equal(period.end,end);
 assert.equal(period.timezone,'Asia/Bangkok');
 assert.throws(()=>reportPeriod({start:String(start)},now),/同时填写/);
 assert.throws(()=>reportPeriod({start:String(start),end:String(now+1)},now),/有效/);
 assert.throws(()=>reportPeriod({start:String(start-31*86400000),end:String(end)},now),/1–31天/);
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

test('v2 weekly report derives highlights and next actions from one validated result',()=>{
 const analysis={
  summary:'已核对变化',
  claims:[{kind:'fact',text:'有效分析人数增长',evidenceIds:['ev1']},
   {kind:'hypothesis',text:'渠道变化可能影响转化',evidenceIds:['ev1']}],
  suggestions:[{priority:'P1',action:'检查渠道漏斗',
   validationMetrics:{primary:'active_users'},reviewConditions:['下一完整周'],
   evidence:{evidenceIds:['ev1']}}],
  weeklyReport:{executiveSummary:'本周已观察到有效分析增长，归因尚未确认',
   metrics:[{label:'有效分析用户',current:120,previous:100,changePct:20,evidenceIds:['ev1']}],
   channelFindings:[],dataGaps:['渠道归因未验证']}
 };
 const report=ensureWeeklyReport(analysis);
 assert.equal(report.partial,undefined);
 assert.equal(report.highlights.length,1);
 assert.equal(report.issues.length,1);
 assert.equal(report.nextWeek.length,1);
 assert.deepEqual(report.nextWeek[0].evidenceIds,['ev1']);
});
test('a malformed additional report becomes a clearly partial saved AI result',()=>{
 const analysis={summary:'真实分析总结',claims:[{kind:'fact',text:'观察到变化',evidenceIds:['ev1']}],
 suggestions:[],weeklyReport:{executiveSummary:'uncited',metrics:[{label:'wrong',current:9,previous:4,changePct:50,evidenceIds:['fake']}],
 highlights:[],issues:[],channelFindings:[],nextWeek:[],dataGaps:[]}};
 const report=ensureWeeklyReport(analysis);
 assert.equal(report.partial,true);
 assert.equal(report.metrics.length,0);
 assert.deepEqual(report.highlights[0].evidenceIds,['ev1']);
 assert.ok(report.dataGaps.length>0);
});

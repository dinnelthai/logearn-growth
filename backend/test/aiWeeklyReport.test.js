'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {weeklyPeriod,reportPeriod,weeklyKey,reportKey,weeklyOperations,customPeriodPromptV0,customPeriodPromptV1,trustedWeeklyMetrics,validateWeeklyReport,ensureWeeklyReport}=require('../src/ai/growth/weeklyReport');

test('weekly report uses last complete Monday-Sunday Bangkok week',()=>{
 const period=weeklyPeriod(Date.parse('2026-10-29T09:00:00+07:00'));
 assert.equal(period.start,Date.parse('2026-10-19T00:00:00+07:00'));
 assert.equal(period.end,Date.parse('2026-10-26T00:00:00+07:00'));
 assert.equal(period.timezone,'Asia/Bangkok');
 assert.equal(weeklyKey(period),weeklyKey({...period}));
});
test('custom report periods use exact Bangkok timestamps and exclusive end',()=>{
 const now=Date.parse('2026-10-31T07:15:00+07:00');
 const start=Date.parse('2026-10-24T09:30:00+07:00');
 const end=Date.parse('2026-10-31T06:45:00+07:00');
 const period=reportPeriod({start:String(start),end:String(end)},now);
 assert.equal(period.kind,'custom');
 assert.equal(period.start,start);
 assert.equal(period.end,end);
 assert.equal(period.previousStart,start-(end-start));
 assert.equal(period.previousEnd,start);
 assert.equal(period.timezone,'Asia/Bangkok');
 assert.equal(reportKey(period),'ai-report-custom-v1:'+start+':'+end);
 assert.notEqual(reportKey(period),weeklyKey({start,end}));
});
test('31-day custom period is valid and its prompt is not constrained to a natural week',()=>{
 const now=Date.parse('2026-10-31T07:15:00+07:00');
 const end=Date.parse('2026-10-31T06:45:00+07:00');
 const start=end-31*86400000;
 const period=reportPeriod({start:String(start),end:String(end)},now);
 assert.equal(period.end-period.start,31*86400000);
 assert.ok(customPeriodPromptV0.includes('自定义时间范围'));
 assert.ok(customPeriodPromptV1.includes('context.businessBrain'));
 assert.ok(require('../src/ai/growth/weeklyReport').weeklyPromptV3.includes('operations-timeline'));
 assert.ok(require('../src/ai/growth/weeklyReport').weeklyPromptV3.includes('未收集、未连接或读取失败不等于没有运营'));
 assert.ok(customPeriodPromptV1.includes('紧邻前一段等长周期'));
 assert.equal(customPeriodPromptV1.includes('完整自然周'),false);
 assert.equal(customPeriodPromptV1.includes('本任务是 LogEarn 完整自然周'),false);
});
test('custom-period KPI comparison uses the exact immediately preceding equal-length window',()=>{
 const now=Date.parse('2026-10-31T07:15:00+07:00');
 const start=Date.parse('2026-10-24T09:30:00+07:00');
 const end=Date.parse('2026-10-31T06:45:00+07:00');
 const period=reportPeriod({start:String(start),end:String(end)},now);
 const metrics=trustedWeeklyMetrics({period,evidence:[
  {id:'current-new',metricId:'new_users',value:20,period:{start,end}},
  {id:'previous-new',metricId:'new_users',value:10,period:{start:period.previousStart,end:period.previousEnd}}
 ]});
 assert.deepEqual(metrics,[{
  metricId:'new_users',label:'首次分析用户',current:20,previous:10,
  changePct:100,evidenceIds:['current-new','previous-new']
 }]);
});
test('custom report periods reject incomplete, future, reversed and overlong ranges',()=>{
 const now=Date.parse('2026-10-31T07:15:00+07:00');
 const start=Date.parse('2026-10-24T09:30:00+07:00');
 assert.throws(()=>reportPeriod({start:String(start)},now),/同时填写/);
 assert.throws(()=>reportPeriod({start:String(start),end:String(now+1)},now),/有效/);
 assert.throws(()=>reportPeriod({start:String(start),end:String(start)},now),/有效/);
 assert.throws(()=>reportPeriod({start:String(start-(31*86400000+1)),end:String(start)},now),/有效/);
});
test('missing custom timestamps retain the latest completed week default',()=>{
 const now=Date.parse('2026-10-29T09:00:00+07:00');
 const period=reportPeriod({},now);
 assert.equal(period.kind,'weekly');
 assert.equal(period.start,Date.parse('2026-10-19T00:00:00+07:00'));
 assert.equal(period.end,Date.parse('2026-10-26T00:00:00+07:00'));
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

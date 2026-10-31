'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DEFINITIONS}=require('../src/ai/growth/weeklyCoverage');
const {auditSavedWeeklyContext}=require('../src/ai/business/savedContextAudit');

function snapshot(){
 const period={start:1000000,end:1604800000,previousStart:-603800000,
  previousEnd:1000000,timezone:'Asia/Bangkok'};
 return {
  weeklyReportContractVersion:'weekly-report-v2',
  business:{scope:{source:'all'},focusGoal:'activation',question:'增长分析'},
  period,snapshot:{id:'stored-snapshot',historyComplete:false},
  current:{totals:{active_users:71,new_users:18}},
  previous:{totals:{active_users:82,new_users:40}},
  evidence:[{id:'evidence-1',metricId:'active_users',value:71,
   period:{start:period.start,end:period.end},coverage:{status:'partial'}}],
  weeklyCoverage:{version:'weekly-coverage-v1',modules:DEFINITIONS.map(x=>({
   id:x.id,status:'not-investigated',evidenceIds:[],facts:[]}))},
  capabilities:[],candidates:[],growth:{},definitions:{},weekly:{},warnings:[]
 };
}
test('offline v5 saved context projects 13 modules, brain and limited input without external calls',()=>{
 const input=snapshot();
 const original=JSON.stringify(input);
 const result=auditSavedWeeklyContext(input);
 assert.equal(result.status,'snapshot-contract-ready',JSON.stringify(result.checks));
 assert.equal(result.checks.under22KB,true);
 assert.equal(result.liveSourceVerified,false);
 assert.equal(result.realModelRunVerified,false);
 assert.equal(result.operatorNorthStarConfirmed,false);
 assert.equal(result.paidOrExternalCallsMadeByAudit,false);
 assert.equal(JSON.stringify(input),original);
 assert.doesNotMatch(JSON.stringify(result),/stored-snapshot|evidence-1|增长分析/);
});
test('an archived v4 report is never projected as accepted v5',()=>{
 const old=snapshot();
 delete old.weeklyReportContractVersion;
 old.weeklyCoverage.modules.pop();
 const result=auditSavedWeeklyContext(old);
 assert.equal(result.status,'snapshot-contract-incomplete');
 assert.equal(result.checks.pinnedV5Report,false);
 assert.equal(result.checks.exactThirteenModules,false);
 assert.equal(result.checks.v5Transport,undefined);
});
test('unknown version, broken period and duplicate module cannot pass v5 snapshot check',()=>{
 const bad=snapshot();
 bad.weeklyCoverage.version='weekly-coverage-old';
 bad.weeklyCoverage.modules[1].id=bad.weeklyCoverage.modules[0].id;
 bad.period.end=bad.period.start;
 const result=auditSavedWeeklyContext(bad);
 assert.equal(result.status,'snapshot-contract-incomplete');
 assert.equal(result.checks.versionedWeeklyManifest,false);
 assert.equal(result.checks.exactThirteenModules,false);
 assert.equal(result.checks.validPeriod,false);
});
test('malformed input fails without exposing private content',()=>{
 const result=auditSavedWeeklyContext({secret:'private@example.com'});
 assert.equal(result.status,'snapshot-contract-incomplete');
 assert.doesNotMatch(JSON.stringify(result),/private@example.com/);
});
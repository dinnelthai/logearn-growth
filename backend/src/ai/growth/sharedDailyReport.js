'use strict';
const MAX_BYTES=256*1024;
// Worker trusts only a report already pinned in its owner-scoped AI record.
function validateDailyReport(report,{start,end,source,goal}={}){
 if(report?.version!=='business-evidence-v1'||report.focusGoal!==goal||
  report.business?.scope?.source!==source||report.period?.start!==start||
  report.period?.end!==end||!Array.isArray(report.candidates)||
  !report.snapshot?.id||typeof report.snapshot.id!=='string'||
  !report.current?.totals||!report.previous?.totals||!report.growth)
  throw Error('共享日报证据的范围、目标、时间或版本不匹配');
 if(Buffer.byteLength(JSON.stringify(report),'utf8')>MAX_BYTES)
  throw Error('共享日报证据超过256KiB，禁止派发未固定的付费任务');
 return report;
}
function fromClaimedRecord(record,{start,end,source,goal}={}){
 if(record?.filter_conditions?.sharedFactsVersion!=='daily-preflight-v1')return null;
 const report=validateDailyReport(record.data_snapshot,{start,end,source,goal});
 if(record.filter_conditions.sharedFactsSnapshotId!==report.snapshot.id)
  throw Error('固定日报快照 ID 与派发记录不匹配');
 return report;
}
module.exports={validateDailyReport,fromClaimedRecord};

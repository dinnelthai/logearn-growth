'use strict';
// A sidecar for the daily brief. These signals remain observational and
// are not included in KPI scoring or model decision calibration.
function collectChannelObservations(ownerId,day,{db=require('../../db/connection')}={}){
 if(typeof ownerId!=='string'||!ownerId||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day))
  throw Error('日观察查询条件无效');
 const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
 const report={version:'source-sidecar-v1',day,available:false,
  content:{available:false,source:'operator-manual-records'},
  followers:{available:false,source:'third-party-partial-scan'},
  attribution:{registeredUsers:null,trades:null,confidence:'unverified'},
  causalProof:false,warnings:['不同渠道累计指标不可相加；不能从曝光或粉丝推断站内注册、交易']};
 if(tables.has('content_growth_items')&&db.prepare('PRAGMA table_info(content_growth_items)').all().some(c=>c.name==='owner_id')){
  const rows=db.prepare(`SELECT platform,COUNT(*) count,SUM(impressions) impressions,
   SUM(CASE WHEN impressions IS NULL THEN 1 ELSE 0 END) missing_impressions
   FROM content_growth_items WHERE owner_id=? AND published_at=? GROUP BY platform`).all(ownerId,day);
  report.content={available:rows.length>0,platforms:rows.map(r=>({
   platform:r.platform,items:r.count,impressions:r.missing_impressions===0?r.impressions:null})),
   source:'operator-manual-records',window:'published-on-day; cumulative metrics at last edit'};
  report.available||=rows.length>0;
 }
 if(tables.has('x_follower_audit')&&tables.has('x_follower_progress')){
  const rows=db.prepare(`SELECT account,category,COUNT(*) count
   FROM x_follower_audit WHERE owner_id=? GROUP BY account,category`).all(ownerId);
  const progress=db.prepare('SELECT account,complete,state FROM x_follower_progress WHERE owner_id=?').all(ownerId);
  report.followers={available:rows.length>0,segments:rows,
   scans:progress,source:'third-party-partial-scan',snapshot:'latest-ever; not day-scoped'};
  report.available||=rows.length>0;
 }
 return report;
}
module.exports={collectChannelObservations};

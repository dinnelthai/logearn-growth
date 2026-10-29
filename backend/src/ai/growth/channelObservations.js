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
 if(tables.has('x_content_accounts')&&tables.has('x_content_posts')){
  const x=db.prepare('SELECT username,followers,last_synced FROM x_content_accounts WHERE owner_id=?').get(ownerId);
  if(x){
   const posts=db.prepare('SELECT COUNT(*) AS posts,SUM(impressions) AS impressions,SUM(CASE WHEN impressions IS NULL THEN 1 ELSE 0 END) AS missing FROM x_content_posts WHERE owner_id=? AND published_at>=? AND published_at<?')
    .get(ownerId,day+'T00:00:00Z',new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString());
   const snapshot=tables.has('x_content_follower_daily')?
    db.prepare('SELECT followers FROM x_content_follower_daily WHERE owner_id=? AND day=?').get(ownerId,day):null;
   report.x_official={available:!!posts.posts||!!snapshot,source:'x-api-v2-public-metrics',
    username:x.username,lastSynced:x.last_synced,publishedPosts:posts.posts,
    impressions:posts.posts>0&&posts.missing===0?posts.impressions:null,
    followersObservedToday:snapshot?.followers??null,
    coverage:'bounded-cumulative-public-metrics; not verified conversions'};
   report.available||=report.x_official.available;
  }
 }
 return report;
}
module.exports={collectChannelObservations};

'use strict';
const defaultDb=require('../../../db/connection');
function createContentAdapters(db=defaultDb){
const {summarize,performanceTrend}=require('../../../analytics/contentGrowth');
function contentGrowth(body,ctx){
 const owner=String(ctx.ownerId||'');
 if(!owner)throw Object.assign(Error('缺少用户范围'),{status:403});
 const rows=db.prepare(`SELECT platform,published_at,impressions,likes,comments,shares
   FROM content_growth_items WHERE owner_id=? AND published_at>=? AND published_at<=?
   ORDER BY published_at DESC LIMIT 501`).all(owner,
   new Date(body.start+7*3600000).toISOString().slice(0,10),
   new Date(body.end-1+7*3600000).toISOString().slice(0,10));
 const truncated=rows.length>500,items=rows.slice(0,500);
 let xOfficial={available:false,source:'x-api-v2-public-metrics',conversionAttribution:false};
 const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
 if(tables.has('x_content_accounts')&&tables.has('x_content_posts')){
  const account=db.prepare('SELECT username,followers,last_synced FROM x_content_accounts WHERE owner_id=?').get(owner);
  if(account){
   const posts=db.prepare('SELECT post_id,published_at,body,impressions,likes,replies,reposts,quotes FROM x_content_posts WHERE owner_id=? AND published_at>=? AND published_at<=? ORDER BY published_at DESC LIMIT 20').all(owner,
    new Date(body.start).toISOString(),new Date(body.end-1).toISOString());
   const measured=posts.filter(p=>p.impressions>0&&[p.likes,p.replies,p.reposts,p.quotes].every(v=>v!=null));
   const exposures=measured.reduce((n,p)=>n+p.impressions,0);
   const engagement=measured.reduce((n,p)=>n+p.likes+p.replies+p.reposts+p.quotes,0);
   xOfficial={available:posts.length>0,source:'x-api-v2-public-metrics',username:account.username,
    lastSynced:account.last_synced,followers:account.followers,
    sampledPosts:posts.length,measuredPosts:measured.length,
    measuredImpressions:exposures||null,
    measuredEngagementRate:exposures?Math.round(engagement/exposures*10000)/100:null,
    followerHistory:tables.has('x_content_follower_daily')?
     db.prepare('SELECT day,followers FROM x_content_follower_daily WHERE owner_id=? AND day>=? AND day<=? ORDER BY day DESC LIMIT 30').all(owner,
      new Date(body.start+7*3600000).toISOString().slice(0,10),
      new Date(body.end-1+7*3600000).toISOString().slice(0,10)).reverse():[],
    posts:posts.slice(0,10).map(p=>({id:p.post_id,publishedAt:p.published_at,
     text:p.body.slice(0,320),impressions:p.impressions,likes:p.likes,
     replies:p.replies,reposts:p.reposts,quotes:p.quotes})),
    coverage:'bounded-sample-cumulative-public-metrics',conversionAttribution:false};
   xOfficial.followerChange=xOfficial.followerHistory.length>=2?
    xOfficial.followerHistory.at(-1).followers-xOfficial.followerHistory[0].followers:null;
  }
 }
 return {available:items.length>0||xOfficial.available,summary:summarize(items),xOfficial,
   trends:performanceTrend(items),sampleSize:items.length,
   coverage:{status:truncated?'truncated':'manual-only',
    platformSync:xOfficial.available,conversionAttribution:false},
   warnings:['内容指标为人工登记的累计值，不代表统计窗口内的曝光',
    '缺失指标不是零；各渠道曝光口径不可合并',
    '没有带来源的用户注册或交易证据，不能计算内容带来的转化',
    'X 官方数据是至多20条已采集推文的累计公开指标，不是整个平台的日曝光或因果效果',
    ...(truncated?['超过500条记录，结果不完整']:[])]};
}
function followerQuality(body,ctx){
 const owner=String(ctx.ownerId||'');
 if(!owner)throw Object.assign(Error('缺少用户范围'),{status:403});
 const rows=db.prepare(`SELECT account,category,COUNT(*) n,
   SUM(CASE WHEN posts_at IS NOT NULL THEN 1 ELSE 0 END) analyzed,
   SUM(CASE WHEN reviewed=1 THEN 1 ELSE 0 END) reviewed
   FROM x_follower_audit WHERE owner_id=? AND seen_at>=? AND seen_at<?
   GROUP BY account,category`).all(owner,body.start,body.end);
 const progress=db.prepare('SELECT account,complete,state,updated_at FROM x_follower_progress WHERE owner_id=?').all(owner);
 return {available:rows.length>0,segments:rows,progress,
   coverage:{status:'partial',complete:progress.length>0&&progress.every(x=>x.complete===1),
    sampledPosts:true,thirdPartySource:true},
   warnings:['仅包含已扫描粉丝和部分历史帖子；类别为关键词启发式，不是身份真实性或购买意图',
    '粉丝分类不是转化归因，不能把关联当作新增交易贡献']};
}
return {contentGrowth,followerQuality};
}
module.exports={...createContentAdapters(),createContentAdapters};

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
 return {available:items.length>0,summary:summarize(items),
   trends:performanceTrend(items),sampleSize:items.length,
   coverage:{status:truncated?'truncated':'manual-only',
    platformSync:false,conversionAttribution:false},
   warnings:['内容指标为人工登记的累计值，不代表统计窗口内的曝光',
    '缺失指标不是零；各渠道曝光口径不可合并',
    '没有带来源的用户注册或交易证据，不能计算内容带来的转化',
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

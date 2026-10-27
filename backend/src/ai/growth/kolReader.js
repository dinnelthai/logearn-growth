'use strict';
// Read-only adapter around the existing KOL ranking metric pipeline.
// Does not attribute tagged-user activity causally to an influencer.
const {validateRange}=require('../../analytics/businessPriorities');
function createKolReader({
 db=require('../../db/connection'),
 remote=require('../../data/hologres'),
 ranking=require('../../data/kolRanking').rankingMetrics,
 attachAccounts=require('../../analytics/kolAccounts').attachAccounts
}={}){
 async function summarize({ownerId,start,end,source='all',limit=20,snapshot=null}){
  if(typeof ownerId!=='string'||!ownerId||source!=='all'||
    !Number.isSafeInteger(limit)||limit<1||limit>25)
   throw Object.assign(Error('KOL 统计只支持当前用户的全来源范围及最多25个档案'),{status:400});
  validateRange(start,end);
  if(process.env.ANALYTICS_STORAGE!=='hologres')
   return {available:false,reason:'KOL 真实效果数据尚未连接 Hologres',
    warnings:['不能把未关联或无法查询的数据视为0']};
  const s=snapshot||await remote.status();
  if(!Number.isFinite(Date.parse(s.as_of))||Date.parse(s.as_of)<end)
   return {available:false,reason:'KOL 数据水位尚未覆盖查询期间',warnings:['停止统计，不对缺失源估值']};
  // This is the same owner-filtered CRM and tagging logic used in KOL ranking.
  const all=db.prepare('SELECT * FROM crm_kols WHERE owner_id=? ORDER BY updated_at DESC,id ASC LIMIT 26')
    .all(ownerId);
  if(!all.length)return {available:false,reason:'当前用户暂无 KOL CRM 档案',
    warnings:['尚无 KOL 人工关联记录，不能推断合作效果']};
  const limited=all.slice(0,limit);
  const attached=attachAccounts(db,limited);
  const profiles=attached.map(p=>({
    ...p,user_ids:db.prepare('SELECT user_id FROM crm_kol_members WHERE kol_id=?')
      .all(p.id).map(m=>m.user_id)
  }));
  const result=await ranking(profiles,{start,end},'tagged',s);
  const errs=result.errors||{},incomplete=Object.values(errs).some(Boolean);
  const metricMap=new Map((result.metrics||[]).map(m=>[m.id,m]));
  const rows=limited.map(p=>{
   const m=metricMap.get(p.id),t=m?.total;
   return {id:p.id,label:String(p.name||'KOL').slice(0,80),
    stage:p.stage||null,
    observedUsers:t?.users??null,
    analysisUsers:errs.analysis?null:t?.analysis_users??null,
    analysisEvents:errs.analysis?null:t?.analysis_events??null,
    tradeUsers:errs.trade?null:t?.trade_users??null,
    transactions:errs.trade?null:t?.transactions??null,
    volumeUsd:errs.trade||t?.missing_values>0?null:t?.volume_usd??null,
    reason:m?.reason||null};
  });
  return {available:true,start,end,snapshotId:s.snapshot_id||null,
   asOf:s.as_of,source:'owner-scoped-kol-ranking',
   scope:'tagged-crm-users-and-linked-accounts',rows,
   coverage:{status:incomplete?'partial':'reported',kolsShown:rows.length,
    moreKolsNotScanned:all.length>limit,errors:Object.fromEntries(
      Object.entries(errs).map(([k,v])=>[k,!!v]))},
   warnings:['归组来源是 CRM 人工标注和关联账户，不构成 KOL 对用户或交易的因果归因',
    '关联用户可能跨 KOL 重叠，不能简单合计为全平台获客或增量',
    '交易量不是收入，存在缺失交易金额时不生成收入或交易量完整估值',
    ...(incomplete?['部分底层数据不可用；受影响的相关指标为未知（null），不是0']:[])]};
 }
 return {summarize};
}
module.exports={createKolReader};

'use strict';
const pool=require('../../db/aiPool');
const {randomUUID}=require('node:crypto');
const DAY=86400000;
const {fingerprint}=require('./specialistStore');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
const json=x=>typeof x==='string'?JSON.parse(x):x;
function snapshotComparison(previous,current,{ownerId,now=Date.now()}={}){
 if(!previous||!current||!ownerId||
   Number(previous.end_at)!==Number(current.start_at)||
   Number(current.end_at)>now||
   Number(previous.end_at)-Number(previous.start_at)!==7*DAY||
   Number(current.end_at)-Number(current.start_at)!==7*DAY)
  return {comparable:false,reason:'需要两个相邻的完整7天 KOL 观察周期',signals:[]};
 const prev=json(previous.evidence),next=json(current.evidence);
 const pc=json(previous.coverage),nc=json(current.coverage);
 if(pc.status!=='reported'||nc.status!=='reported'||
    previous.source_watermark==null||current.source_watermark==null)
  return {comparable:false,reason:'KOL 事件/交易数据覆盖不完整',signals:[]};
 const prior=new Map((prev.rows||[]).map(r=>[r.id,r])),signals=[];
 for(const row of next.rows||[]){
  const old=prior.get(row.id);
  if(!old||!Number.isSafeInteger(old.analysisEvents)||
     !Number.isSafeInteger(row.analysisEvents)||old.analysisEvents<10)continue;
  const delta=(row.analysisEvents-old.analysisEvents)/old.analysisEvents;
  if(delta>-.35)continue;
  signals.push({kind:'kol',priority:delta<=-.6?'P0':'P1',
   fingerprint:fingerprint('kol',row.id,'analysis-decline'),
   title:'KOL 已归组用户产品分析活动下降：'+String(row.label||row.id).slice(0,90),
   sourceEnd:Number(current.end_at),evidence:{
    kind:'kol-analysis-decline',kolId:row.id,label:row.label,
    baseline:{analysisEvents:old.analysisEvents,observedUsers:old.observedUsers},
    observed:{analysisEvents:row.analysisEvents,observedUsers:row.observedUsers},
    changeFraction:delta,periods:{
      before:[Number(previous.start_at),Number(previous.end_at)],
      after:[Number(current.start_at),Number(current.end_at)]},
    snapshotIds:[previous.id,current.id],causality:'unproven',
    warning:'CRM 成员归组的相关行为下降，不代表该 KOL 造成了减少',
    action:'核查合作内容、用户活跃和站内功能；记录具体运营动作'}});
 }
 return {comparable:true,signals};
}
function financialRows(collaborations,financials){
 const byId=new Map(collaborations.map(c=>[c.id,c]));
 return financials.map(x=>{
  const c=byId.get(x.collaborationId);
  if(!c)return null;
  return {collaborationId:c.id,kolId:c.kol_id,name:c.name,status:c.status,
   start:c.start_at,end:c.end_at,currencyTotals:x.revenue_totals||[],
   costs:x.cost_totals||[],financialSource:'manual-confirmed-ledger',
   reason:'每种币种独立列示；已收收入与实际成本存在时才有账面 ROI'};
 }).filter(Boolean);
}
function createKolOperations({
 db=pool,
 reader=require('./kolReader').createKolReader(),
 sqlite=require('../../db/connection'),
 financials=require('../../data/collaborationReview').financials,
 costs=require('../../data/collaborationReview').costs,
 costTotals=require('../../analytics/collaborationCosts').costTotals,
 taskStore=require('./specialistStore').createSpecialistStore()
}={}){
 async function collaborations(ownerId,{limit=25}={}){
  if(!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>50)fail('KOL 合作查询参数无效');
  const rows=sqlite.prepare(`SELECT c.* FROM crm_collaborations c
    JOIN crm_kols k ON k.id=c.kol_id AND k.owner_id=c.owner_id
    WHERE c.owner_id=? ORDER BY c.updated_at DESC,c.id ASC LIMIT ?`).all(ownerId,limit);
  const result=[];
  for(const c of rows){
   const f=financials(c);
   result.push({collaborationId:c.id,kolId:c.kol_id,name:c.name,
    status:c.status,start:c.start_at,end:c.end_at,
    revenueTotals:f.revenue_totals||[],costTotals:costTotals(costs(c)),
    financeSource:'manual-ledger',
    warnings:['ROI仅在同币种实际成本和已确认收入都有记录时有效',
     '成本不等于 Google/KOL 归因增量；多币种不换算不合并']});
  }
  return result;
 }
 async function capture(ownerId,{start,end,now=Date.now()}){
  if(!ownerId||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
    end-start!==7*DAY||end>now-2*DAY)fail('KOL 周期必须为已成熟的连续7天');
  const observed=await reader.summarize({ownerId,start,end,source:'all',limit:25});
  if(observed.available!==true)return {created:false,available:false,
    reason:observed.reason||'KOL 来源暂不可用'};
  const source=observed.asOf||null;
  if(!Number.isFinite(Date.parse(source))||Date.parse(source)<end)
   return {created:false,available:false,reason:'KOL 观测水位尚未成熟'};
  const id=randomUUID(),at=now,coverage=observed.coverage||{};
  const result=await db.query(`INSERT INTO ai_growth_kol_period_snapshots
   (id,owner_id,start_at,end_at,evidence,coverage,source_watermark,captured_at)
   VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
   ON CONFLICT(owner_id,start_at,end_at) DO NOTHING RETURNING id`,
   [id,ownerId,start,end,JSON.stringify({
     rows:observed.rows,source:observed.source,scope:observed.scope,
     warnings:observed.warnings
   }),JSON.stringify(coverage),source,at]);
  return {created:!!result.rows.length,available:true,id:result.rows[0]?.id||null,
   coverage,status:'observed-noncausal'};
 }
 async function list(ownerId,{limit=12}={}){
  if(!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>52)fail('KOL 快照查询参数无效');
  const r=await db.query(`SELECT id,owner_id,start_at,end_at,evidence,coverage,
    source_watermark,captured_at FROM ai_growth_kol_period_snapshots
    WHERE owner_id=$1 ORDER BY end_at DESC LIMIT $2`,[ownerId,limit]);
  return r.rows;
 }
 async function scan(ownerId,{now=Date.now()}={}){
  const snapshots=await list(ownerId,{limit:2});
  if(snapshots.length<2)return {status:'insufficient-history',newTasks:0,
   reason:'需要两个已完成的相邻 KOL 周周期'};
  const result=snapshotComparison(snapshots[1],snapshots[0],{ownerId,now});
  if(!result.comparable)return {status:'skipped',reason:result.reason,newTasks:0};
  const stored=[];
  for(const signal of result.signals){
   const row=await taskStore.observe(ownerId,signal,now);
   if(row)stored.push(row);
  }
  // Manual finance ledger is tracked per collaboration, per currency. A
  // confirmed negative ROI is a review candidate, NOT KOL incrementality.
  const batches=await collaborations(ownerId);
  for(const c of batches){
   if(!['active','completed'].includes(c.status))continue;
   for(const cur of c.revenueTotals){
    if(cur.roi==null||cur.roi>=0||cur.income_entries<1||
       cur.actual_cost==null||cur.net_revenue==null)continue;
    const signal={kind:'kol',priority:'P1',
     fingerprint:fingerprint('kol',c.collaborationId,cur.currency+':negative-ledger-roi'),
     title:'KOL 合作已记录成本高于已收收入：'+c.name.slice(0,70),
     sourceEnd:Number(snapshots[0].end_at),
     evidence:{kind:'kol-ledger-negative-roi',collaborationId:c.collaborationId,
      kolId:c.kolId,currency:cur.currency,ledger:cur,
      source:'verified-manual-crm-ledger',snapshotId:snapshots[0].id,
      causality:'unproven',warning:'只表示单币种账本利润为负；不代表 KOL 因果投资回报'}};
    const row=await taskStore.observe(ownerId,signal,now);
    if(row)stored.push(row);
   }
  }
  return {status:'scanned',detected:result.signals.length,
   newTasks:stored.length,observedUntil:Number(snapshots[0].end_at)};
 }
 return {capture,list,collaborations,scan};
}
module.exports={createKolOperations,snapshotComparison,financialRows};

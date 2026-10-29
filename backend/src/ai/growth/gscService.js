'use strict';
const {randomUUID}=require('node:crypto');
const pool=require('../../db/aiPool');
const {client:defaultClient,propertyName}=require('./gscClient');
const {dateMs}=require('./seoStore');
const DAY=86400000;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
function dateWindow(startDate,endDate,now=Date.now()){
 const start=dateMs(startDate),end=dateMs(endDate);
 if(end<start||end-start>30*DAY||end>now-2*DAY)
  fail('Search Console 同步最多31天，且结束日期至少早于今天2天（仅最终数据）');
 return {startDate,endDate};
}
function normalizeGoogleRows(response,dimension,max){
 if(!response||!Array.isArray(response.rows)&&response.rows!=null)
  fail('Search Console 响应无效',503);
 const rows=response.rows||[];
 if(rows.length>max)fail('Google 行数超过服务端预算',503);
 return rows.map((r,index)=>{
  const invalid=!Array.isArray(r?.keys)||r.keys.length!==1||
   typeof r.keys[0]!=='string'||r.keys[0].length>4096?'keys':
   !Number.isFinite(r.clicks)||r.clicks<0?'clicks':
   !Number.isFinite(r.impressions)||r.impressions<0?'impressions':
   !Number.isFinite(r.ctr)||r.ctr<0||r.ctr>1?'ctr':
   !Number.isFinite(r.position)||r.position<1?'position':null;
  if(invalid)fail(`Search Console ${dimension} 第 ${index+1} 行 ${invalid} 无效，拒绝保存`,503);
  if(dimension==='date')dateMs(r.keys[0]);
  return {[dimension]:r.keys[0],clicks:r.clicks,
   impressions:r.impressions,ctr:r.ctr,position:r.position};
 });
}
function summarizeGsc(record){
 const rows=k=>typeof record[k]==='string'?JSON.parse(record[k]):record[k];
 const daily=rows('daily'),queries=rows('queries'),pages=rows('pages');
 if(!Array.isArray(daily)||!Array.isArray(queries)||!Array.isArray(pages))
  fail('Search Console 已保存快照结构不完整',503);
 const t=rows('property_totals'),coverage=rows('coverage');
 const opportunities=queries.filter(q=>q.impressions>=50&&q.ctr<0.03&&q.position>=3&&q.position<=15)
  .sort((a,b)=>b.impressions-a.impressions).slice(0,30)
  .map(q=>({...q,reason:'高曝光且 CTR 较低：候选优化线索，不代表可以预测提升流量'}));
 return {available:true,siteUrl:record.site_url,startDate:record.start_date,
  endDate:record.end_date,snapshotId:record.id,syncedAt:Number(record.fetched_at),
  source:'gsc-api',dataState:'final',metrics:t,daily,
  queries:queries.slice(0,100),pages:pages.slice(0,50),opportunities,coverage,
  warnings:['Search Console 的查询、页面维度受内部行数限制及匿名化影响；绝不能用行合计代替站点总量',
   'GSC 数据日期按太平洋时间（PT），与 LogEarn 曼谷业务日不同',
   'GSC 点击与排名不证明注册、筹码分析、成交或 SEO 行动的因果效果']};
}
function buildGoogleSnapshot(siteUrl,window,responses,mode='service-account'){
 const daily=normalizeGoogleRows(responses.daily,'date',31)
  .filter(r=>r.date>=window.startDate&&r.date<=window.endDate)
  .sort((a,b)=>a.date.localeCompare(b.date));
 const queries=normalizeGoogleRows(responses.queries,'query',500);
 const pages=normalizeGoogleRows(responses.pages,'page',100);
 const clicks=daily.reduce((n,r)=>n+r.clicks,0),impressions=daily.reduce((n,r)=>n+r.impressions,0);
 const expectedDays=Math.floor((dateMs(window.endDate)-dateMs(window.startDate))/DAY)+1;
 const seen=new Set(daily.map(x=>x.date));
 return {site_url:siteUrl,start_date:window.startDate,end_date:window.endDate,
  source:'gsc-api',data_state:'final',daily,queries,pages,
  property_totals:{
   clicks:daily.length?clicks:null,
   impressions:daily.length?impressions:null,
   ctr:daily.length&&impressions?clicks/impressions:null,
   position:daily.length&&impressions?
    daily.reduce((n,r)=>n+r.position*r.impressions,0)/impressions:null
  },
  coverage:{
   status:daily.length===expectedDays?'reported-final-dates':'incomplete-or-zero-traffic-days',
   expectedDays,reportedDays:daily.length,unreportedDates:Array.from({length:expectedDays},
    (_,i)=>new Date(dateMs(window.startDate)+i*DAY).toISOString().slice(0,10))
    .filter(d=>!seen.has(d)),
   queryRowsReturned:queries.length,pageRowsReturned:pages.length,
   queryTruncatedPossible:queries.length===500,pageTruncatedPossible:pages.length===100,
   googleApiVerifiedForServiceIdentity:mode==='service-account',
   googleAuthorizationMode:mode,
   searchQueryCoverage:'top-results-only',propertyTotalSource:'finalized daily property-level aggregates',
   dateTimezone:'America/Los_Angeles',
   sourceWarning:'Google API 日期无行可能意味着零流量或数据尚未覆盖，不能单凭缺行判断'
  }};
}
function createGscService({db=pool,client=defaultClient,clock=Date.now}={}){
 async function setting(ownerId){
  const r=await db.query('SELECT site_url,updated_at FROM ai_growth_gsc_settings WHERE owner_id=$1',
   [String(ownerId)]);
  return r.rows[0]||null;
 }
 async function connection(ownerId){
  const status=await client.status(ownerId);
  if(!status.configured)return {...status,sites:[],selectedSite:null,
   reason:!status.ownerAuthorized?'服务器尚未为此用户配置 Search Console 资源授权':'服务器尚未配置可用 Google API 凭证'};
  const sites=await client.sites(ownerId);
  const selected=await setting(ownerId);
  return {...status,sites,selectedSite:sites.some(x=>x.siteUrl===selected?.site_url)?
    selected.site_url:null,selectionNeedsReview:!!selected&&!sites.some(x=>x.siteUrl===selected.site_url)};
 }
 async function select(ownerId,siteUrl){
  const valid=await client.assertAllowedSite(ownerId,siteUrl);
  const now=clock();
  await db.query(`INSERT INTO ai_growth_gsc_settings(owner_id,site_url,updated_at)
    VALUES($1,$2,$3) ON CONFLICT(owner_id) DO UPDATE
    SET site_url=EXCLUDED.site_url,updated_at=EXCLUDED.updated_at`,[String(ownerId),valid,now]);
  return {selectedSite:valid,updatedAt:now};
 }
 async function latest(ownerId,{siteUrl=null,startDate=null,endDate=null}={}){
  const selected=await setting(ownerId);
  const property=siteUrl?propertyName(siteUrl):selected?.site_url;
  if(!property||siteUrl&&property!==selected?.site_url)return null;
  if(startDate!=null||endDate!=null){
   if(!startDate||!endDate)fail('必须同时指定 GSC 开始和结束日期');
   const start=dateMs(startDate),end=dateMs(endDate);
   if(end<start||end-start>30*DAY)fail('GSC 快照查询仅支持1–31天的完整日期窗口');
  }
  const values=[String(ownerId),property];
  let sql=`SELECT id,owner_id,site_url,start_date::text,end_date::text,source,
    data_state,property_totals,daily,queries,pages,coverage,fetched_at
    FROM ai_growth_gsc_snapshots WHERE owner_id=$1 AND site_url=$2`;
  if(startDate){
   sql+=' AND start_date=$3::date AND end_date=$4::date';
   values.push(startDate,endDate);
  }
  const r=await db.query(sql+' ORDER BY fetched_at DESC,id DESC LIMIT 1',values);
  return r.rows[0]||null;
 }
 async function sync(ownerId,{startDate,endDate}){
  dateWindow(startDate,endDate,clock());
  const selection=await setting(ownerId);
  if(!selection?.site_url)fail('请先选择并保存 Search Console 资源',409);
  const siteUrl=await client.assertAllowedSite(ownerId,selection.site_url);
  const conn=await db.connect();let transaction=false;
  try{
   await conn.query('BEGIN');transaction=true;
   await conn.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',
    [String(ownerId),siteUrl+':'+startDate+':'+endDate]);
   const previous=await conn.query(`SELECT id,site_url,start_date::text,end_date::text,
      source,data_state,property_totals,daily,queries,pages,coverage,fetched_at
     FROM ai_growth_gsc_snapshots WHERE owner_id=$1 AND site_url=$2
     AND start_date=$3::date AND end_date=$4::date ORDER BY fetched_at DESC LIMIT 1`,
     [String(ownerId),siteUrl,startDate,endDate]);
   if(previous.rows.length&&clock()-Number(previous.rows[0].fetched_at)<15*60000){
    await conn.query('COMMIT');transaction=false;
    return {cached:true,report:summarizeGsc(previous.rows[0])};
   }
   const req={ownerId,siteUrl,startDate,endDate};
   const [daily,queries,pages]=await Promise.all([
    client.searchAnalytics(ownerId,{...req,dimensions:['date'],rowLimit:31}),
    client.searchAnalytics(ownerId,{...req,dimensions:['query'],rowLimit:500}),
    client.searchAnalytics(ownerId,{...req,dimensions:['page'],rowLimit:100})
   ]);
   const authMode=(await client.status(ownerId)).mode;
   const normalized=buildGoogleSnapshot(siteUrl,{startDate,endDate},{daily,queries,pages},authMode);
   const id=randomUUID(),now=clock();
   await conn.query(`INSERT INTO ai_growth_gsc_snapshots
     (id,owner_id,site_url,start_date,end_date,source,data_state,
      property_totals,daily,queries,pages,coverage,fetched_at)
     VALUES($1,$2,$3,$4::date,$5::date,'gsc-api','final',
      $6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
     [id,String(ownerId),siteUrl,startDate,endDate,
      JSON.stringify(normalized.property_totals),JSON.stringify(normalized.daily),
      JSON.stringify(normalized.queries),JSON.stringify(normalized.pages),
      JSON.stringify(normalized.coverage),now]);
   await conn.query('COMMIT');transaction=false;
   return {cached:false,report:summarizeGsc({id,fetched_at:now,...normalized})};
  }catch(error){
   if(transaction)await conn.query('ROLLBACK').catch(()=>{});
   throw error;
  }finally{conn.release()}
 }
 async function sitemaps(ownerId){
  const selected=await setting(ownerId);
  if(!selected?.site_url)fail('先选择 Search Console 资源再查看 Sitemap',409);
  const rows=await client.sitemaps(ownerId,selected.site_url);
  return {siteUrl:selected.site_url,rows,readOnly:true,
   warnings:['仅列出已提交的 Sitemap，提交数和已索引数不是整站页面索引覆盖率']};
 }
 async function inspect(ownerId,inspectionUrl){
  const selected=await setting(ownerId);
  if(!selected?.site_url)fail('先选择 Search Console 资源再检查 URL',409);
  return client.inspect(ownerId,selected.site_url,inspectionUrl);
 }
 return {connection,setting,select,latest,sync,sitemaps,inspect};
}
module.exports={createGscService,buildGoogleSnapshot,summarizeGsc,dateWindow};

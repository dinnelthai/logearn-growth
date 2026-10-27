'use strict';
const {createHash}=require('node:crypto');
const pool=require('../../db/aiPool');
const DAY=86400000;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
function dateMs(value){
 if(typeof value!=='string'||!/^(19|20)\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))fail('Search Console 日期格式必须为 YYYY-MM-DD');
 const n=Date.parse(value+'T00:00:00.000Z');
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)fail('Search Console 日期无效');
 return n;
}
function normalizedSite(value){
 if(typeof value!=='string'||value.length>250)fail('站点地址无效');
 let url;
 try{url=new URL(value)}catch{fail('站点地址无效')}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||
   !url.hostname.includes('.'))fail('仅允许 HTTPS URL 前缀类型站点（例如 https://example.com/）');
 return url.origin+'/';
}
function validateImport(input,{now=Date.now()}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('SEO 导入格式无效');
 const siteUrl=normalizedSite(input.siteUrl),startDate=input.startDate,endDate=input.endDate;
 const start=dateMs(startDate),end=dateMs(endDate);
 if(end<start||end-start>30*DAY||end>now)fail('Search Console 导入最多31天且不能包含未来日期');
 if(input.source!=='gsc-manual-export'||!Array.isArray(input.rows)||
   input.rows.length<1||input.rows.length>500)fail('必须提供1-500条真实 GSC 原始查询行和来源标记');
 const rows=[],seen=new Set();
 for(const item of input.rows){
  if(!item||typeof item!=='object'||Array.isArray(item))fail('GSC 行格式无效');
  const date=item.date;
  if(dateMs(date)<start||dateMs(date)>end)fail('GSC 行日期不在导入窗口内');
  const query=item.query;
  if(typeof query!=='string'||!query.trim()||query.length>200)fail('GSC 查询词无效');
  let page;
  try{page=new URL(item.page)}catch{fail('GSC 页面地址无效')}
  if(page.protocol!=='https:'||page.origin!==new URL(siteUrl).origin||
    page.username||page.password||page.href.length>1500||page.hash)
   fail('GSC 页面必须属于所选 HTTPS 站点且不含凭据和片段');
  const country=item.country==null?'':String(item.country).toLowerCase(),
    device=item.device==null?'':String(item.device).toUpperCase();
  if(country&&!/^[a-z]{3}$/.test(country)||
    device&&!['DESKTOP','MOBILE','TABLET'].includes(device))fail('GSC 国家或设备维度无效');
  const {clicks,impressions,position}=item;
  if(!Number.isSafeInteger(clicks)||clicks<0||!Number.isSafeInteger(impressions)||
    impressions<1||impressions>100000000||clicks>impressions||
    !Number.isFinite(position)||position<1||position>1000)fail('GSC 点击、曝光或平均排名无效');
  if(item.ctr!=null&&(!Number.isFinite(item.ctr)||item.ctr<0||item.ctr>1||
    Math.abs(item.ctr-clicks/impressions)>0.001))fail('GSC CTR 与点击/曝光不匹配');
  const row={date,query:query.trim(),page:page.href,country,device,
    clicks,impressions,position};
  const key=JSON.stringify([date,row.query,row.page,country,device]);
  if(seen.has(key))fail('导入含重复维度行；不能重复计数');
  seen.add(key);rows.push(row);
 }
 rows.sort((a,b)=>JSON.stringify([a.date,a.query,a.page,a.country,a.device])
   .localeCompare(JSON.stringify([b.date,b.query,b.page,b.country,b.device])));
 return {siteUrl,startDate,endDate,rows,source:'gsc-manual-export',coverage:'export-limited'};
}
function summarizeSeo(snapshot,{startDate=snapshot.start_date,endDate=snapshot.end_date,limit=20}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>50)fail('SEO 结果条数无效');
 const start=dateMs(startDate),end=dateMs(endDate);
 if(start>end||start<dateMs(snapshot.start_date)||end>dateMs(snapshot.end_date))
  fail('所选日期超出这份 Search Console 导出快照');
 const raw=typeof snapshot.rows==='string'?JSON.parse(snapshot.rows):snapshot.rows;
 if(!Array.isArray(raw))throw Error('保存的 Search Console 数据损坏');
 const rows=raw.filter(r=>r.date>=startDate&&r.date<=endDate),byQuery=new Map();
 let clicks=0,impressions=0,weightedPosition=0;
 for(const row of rows){
  clicks+=row.clicks;impressions+=row.impressions;weightedPosition+=row.position*row.impressions;
  const key=row.query,entry=byQuery.get(key)||{query:key,clicks:0,impressions:0,weightedPosition:0,pages:new Set()};
  entry.clicks+=row.clicks;entry.impressions+=row.impressions;
  entry.weightedPosition+=row.position*row.impressions;entry.pages.add(row.page);byQuery.set(key,entry);
 }
 const results=[...byQuery.values()].map(x=>({
  query:x.query,clicks:x.clicks,impressions:x.impressions,
  ctr:x.impressions?x.clicks/x.impressions:null,
  position:x.impressions?x.weightedPosition/x.impressions:null,
  pages:x.pages.size
 })).sort((a,b)=>b.impressions-a.impressions||a.query.localeCompare(b.query));
 const opportunities=results.filter(x=>x.impressions>=50&&x.ctr<0.03&&x.position>=3&&x.position<=15)
   .slice(0,limit).map(x=>({...x,reason:'高曝光、低点击率且已有可见排名：仅待验证机会，不是预估损失或因果结论'}));
 return {available:true,siteUrl:snapshot.site_url,startDate,endDate,
  snapshotId:snapshot.id,importedAt:Number(snapshot.imported_at),
  source:'gsc-manual-export',
  coverage:{status:'export-limited',rowsImported:Number(snapshot.row_count),
   rowsInSelectedPeriod:rows.length,verifiedWithGoogleApi:false,
   completeSearchTraffic:false,timezone:'Search Console property date (not Asia/Bangkok)'},
  metrics:{clicks,impressions,ctr:impressions?clicks/impressions:null,
   position:impressions?weightedPosition/impressions:null},
  rows:results.slice(0,limit),opportunities,
  warnings:['用户手动提供的 GSC 导出行，未通过 Google API 验证真实性或站点所有权',
   '搜索查询行可能被匿名化、抽样或截断；汇总只代表已导入行，不代表整站搜索表现',
   'GSC 日期与站内曼谷时间的窗口不同，不能据此直接声称搜索曝光带来注册或交易']};
}
function createSeoStore(db=pool){
 async function importSnapshot(ownerId,input){
  if(typeof ownerId!=='string'||!ownerId.trim()||ownerId.length>256)fail('用户身份无效');
  const normalized=validateImport(input);
  const hash=createHash('sha256').update(JSON.stringify([ownerId,normalized])).digest('hex');
  const id='gsc-'+hash.slice(0,32),now=Date.now();
  const result=await db.query(`INSERT INTO ai_growth_seo_imports
   (id,owner_id,site_url,start_date,end_date,source,coverage,row_count,rows,checksum,imported_at)
   VALUES($1,$2,$3,$4,$5,'gsc-manual-export','export-limited',$6,$7::jsonb,$8,$9)
   ON CONFLICT DO NOTHING RETURNING id`,
   [id,ownerId,normalized.siteUrl,normalized.startDate,normalized.endDate,
    normalized.rows.length,JSON.stringify(normalized.rows),hash,now]);
  return {id,created:result.rows.length>0,rowCount:normalized.rows.length,
    siteUrl:normalized.siteUrl,startDate:normalized.startDate,endDate:normalized.endDate,
    coverage:'export-limited'};
 }
 async function list(ownerId,{limit=20}={}){
  if(!ownerId||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('SEO 快照查询参数无效');
  const r=await db.query(`SELECT id,site_url,start_date::text,end_date::text,source,
    coverage,row_count,imported_at FROM ai_growth_seo_imports
    WHERE owner_id=$1 ORDER BY imported_at DESC,id DESC LIMIT $2`,[ownerId,limit]);
  return r.rows;
 }
 async function get(ownerId,id){
  if(!ownerId||typeof id!=='string'||!id)fail('SEO 快照查询参数无效');
  const r=await db.query('SELECT id,owner_id,site_url,start_date::text,end_date::text,source,coverage,row_count,rows,checksum,imported_at FROM ai_growth_seo_imports WHERE owner_id=$1 AND id=$2',
   [ownerId,id]);return r.rows[0]||null;
 }
 async function latestCovering(ownerId,{siteUrl,startDate,endDate}){
  if(!ownerId)fail('用户身份无效');
  dateMs(startDate);dateMs(endDate);
  if(dateMs(startDate)>dateMs(endDate))fail('查询日期无效');
  const url=siteUrl?normalizedSite(siteUrl):null;
  const sites=await db.query(`SELECT DISTINCT site_url FROM ai_growth_seo_imports WHERE owner_id=$1
    AND start_date<=$2::date AND end_date>=$3::date LIMIT 2`,
    [ownerId,startDate,endDate]);
  if(!url&&sites.rows.length>1)fail('存在多个 Search Console 站点，请明确指定 siteUrl');
  const selected=url||sites.rows[0]?.site_url;
  if(!selected)return null;
  const r=await db.query(`SELECT id,owner_id,site_url,start_date::text,end_date::text,source,coverage,row_count,rows,checksum,imported_at FROM ai_growth_seo_imports
    WHERE owner_id=$1 AND site_url=$2 AND start_date<=$3::date AND end_date>=$4::date
    ORDER BY imported_at DESC,id DESC LIMIT 1`,[ownerId,selected,startDate,endDate]);
  return r.rows[0]||null;
 }
 return {importSnapshot,list,get,latestCovering};
}
module.exports={createSeoStore,validateImport,summarizeSeo,normalizedSite};

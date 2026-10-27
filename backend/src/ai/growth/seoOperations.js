'use strict';
const {fingerprint}=require('./specialistStore');
const DAY=86400000;
const readJson=(x)=>typeof x==='string'?JSON.parse(x):x;
const dateAt=s=>Date.parse(s+'T00:00:00.000Z');
function asDaily(record){
 if(!record||record.source!=='gsc-api'||record.data_state!=='final'||
   record.start_date!==record.end_date)return null;
 const coverage=readJson(record.coverage),totals=readJson(record.property_totals),
   queries=readJson(record.queries);
 if(coverage?.status!=='reported-final-dates'||coverage.reportedDays!==1||
    coverage.queryTruncatedPossible||!Number.isFinite(totals?.impressions)||
    !Number.isFinite(totals?.clicks)||!Array.isArray(queries))return null;
 const date=record.start_date;
 if(!Number.isSafeInteger(dateAt(date)))return null;
 return {date,id:record.id,site:record.site_url,queries,totals};
}
function aggregate(rows){
 const clicks=rows.reduce((n,r)=>n+r.clicks,0);
 const impressions=rows.reduce((n,r)=>n+r.impressions,0);
 return {clicks,impressions,ctr:impressions?clicks/impressions:null,
  position:impressions?rows.reduce((n,r)=>n+r.position*r.impressions,0)/impressions:null,
  reportedDays:rows.length};
}
function seoFindings(records,{ownerId,minDailyImpressions=50}={}){
 if(!ownerId||!Array.isArray(records)||!Number.isSafeInteger(minDailyImpressions)||
   minDailyImpressions<10)throw Error('SEO 运营比较参数无效');
 const days=records.map(asDaily).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
 if(!days.length)return {ready:false,reason:'没有完整的最终 GSC 按日快照',signals:[]};
 const site=days[days.length-1].site;
 if(days.some(x=>x.site!==site))return {ready:false,reason:'不可跨 Search Console 资源比较',signals:[]};
 // Only latest completed day can create a current opportunity. A missing
 // query row on another date is UNKNOWN, never a zero impression.
 const recent=days[days.length-1],signals=[],next=dateAt(recent.date)+DAY;
 for(const q of recent.queries){
  if(typeof q.query!=='string'||!q.query||!Number.isFinite(q.impressions)||
     !Number.isFinite(q.clicks)||!Number.isFinite(q.position)||q.impressions<minDailyImpressions)
   continue;
  const ctr=q.impressions?q.clicks/q.impressions:null;
  if(ctr!==null&&ctr<0.03&&q.position>=3&&q.position<=15){
   signals.push({kind:'seo',priority:'P1',fingerprint:fingerprint('seo',site,q.query+':low-ctr'),
    title:'SEO 关键词点击率待核查：'+q.query.slice(0,120),sourceEnd:next,
    evidence:{kind:'seo-low-ctr',source:'gsc-api',site,query:q.query,date:recent.date,
     snapshotIds:[recent.id],observed:{clicks:q.clicks,impressions:q.impressions,
      ctr,position:q.position},baseline:null,causality:'unproven',
     quality:'top-query-row-not-whole-site',action:'人工检查搜索意图、标题、摘要及落地页后记录实际修改'}});
  }
 }
 if(days.length<14)return {ready:true,site,latestDate:recent.date,
  signals,trendReady:false,reason:'不足连续14天完整 GSC 快照，暂不判断排名趋势'};
 const sample=days.slice(-14);
 if(sample.some((x,i)=>i&&dateAt(x.date)!==dateAt(sample[i-1].date)+DAY))
  return {ready:true,site,latestDate:recent.date,signals,trendReady:false,
   reason:'GSC 日期存在断档，禁止把缺失当零计算趋势'};
 const before=sample.slice(0,7),after=sample.slice(7),byQuery=new Map();
 for(const [idx,list]of [[0,before],[1,after]]){
  for(const row of list){
   for(const q of row.queries){
    if(!q.query||!Number.isFinite(q.clicks)||!Number.isFinite(q.impressions)||
       !Number.isFinite(q.position))continue;
    const v=byQuery.get(q.query)||[[],[]];v[idx].push(q);byQuery.set(q.query,v);
   }
  }
 }
 for(const [query,[oldRows,newRows]]of byQuery){
  // Top-results export can omit low-ranked queries. Require a row on every day
  // in each 7d window, not just some days, before comparing rankings.
  if(oldRows.length!==7||newRows.length!==7)continue;
  const old=aggregate(oldRows),current=aggregate(newRows);
  if(old.impressions<350||current.impressions<150)continue;
  const positionChange=current.position-old.position;
  const impressionChange=(current.impressions-old.impressions)/old.impressions;
  if(positionChange<3&&impressionChange>-.35)continue;
  signals.push({kind:'seo',priority:positionChange>=5&&impressionChange<=-.35?'P0':'P1',
   fingerprint:fingerprint('seo',site,query+':ranking-regression'),
   title:'SEO 搜索可见性下降待调查：'+query.slice(0,115),sourceEnd:next,
   evidence:{kind:'seo-ranking-regression',source:'gsc-api',site,query,
    baseline:old,observed:current,positionChange,impressionChange,
    baselineDates:[before[0].date,before[6].date],
    observedDates:[after[0].date,after[6].date],
    snapshotIds:sample.map(x=>x.id),causality:'unproven',
    quality:'14-contiguous-final-days; query present every day; non-experimental',
    action:'核查页面/搜索结果变化与索引问题，再考虑 SEO 调整'}});
 }
 return {ready:true,site,latestDate:recent.date,signals,trendReady:true};
}
async function scanSeo(ownerId,{db=require('../../db/aiPool'),
 store=require('./specialistStore').createSpecialistStore(),siteUrl=null,now=Date.now()}={}){
 const selected=siteUrl||(
  await db.query('SELECT site_url FROM ai_growth_gsc_settings WHERE owner_id=$1',[ownerId])
 ).rows[0]?.site_url;
 if(!selected)return {status:'unconfigured',newTasks:0,reason:'尚无已选择的 GSC 站点'};
 const r=await db.query(`SELECT id,site_url,start_date::text,end_date::text,source,
    data_state,coverage,property_totals,queries FROM ai_growth_gsc_snapshots
   WHERE owner_id=$1 AND site_url=$2 AND start_date=end_date
   ORDER BY end_date DESC,fetched_at DESC LIMIT 45`,[ownerId,selected]);
 const unique=new Map();
 for(const row of r.rows)if(!unique.has(row.end_date))unique.set(row.end_date,row);
 const findings=seoFindings([...unique.values()],{ownerId}),created=[];
 for(const signal of findings.signals){
  if(signal.sourceEnd>now)continue;
  const changed=await store.observe(ownerId,signal,now);
  if(changed)created.push(changed);
 }
 return {status:findings.ready?'scanned':'insufficient-data',reason:findings.reason||null,
  site:selected,trendReady:!!findings.trendReady,detected:findings.signals.length,
  newTasks:created.length,tasks:created};
}
module.exports={seoFindings,scanSeo,asDaily,aggregate};

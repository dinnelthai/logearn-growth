const remote=require('./hologres'),{ANALYSIS_SQL}=require('./analysisUsers'),{weeklyCoreWindow,weeklyCore}=require('../analytics/weeklyCore')
function weeklyCoreQuery(){
 return `${remote.eventsCte()} SELECT e.user_key,COALESCE(f.source,'未知') AS source,
   COUNT(DISTINCT e.date) FILTER(WHERE e.client_ts>=$2 AND e.client_ts<$3) AS current_days,
   COUNT(DISTINCT e.date) FILTER(WHERE e.client_ts>=$4 AND e.client_ts<$2) AS previous_days
   FROM e JOIN facts f ON f.user_key=e.user_key
   WHERE e.event_name IN(${ANALYSIS_SQL}) AND e.client_ts>=$4 AND e.client_ts<$3
    AND ($5::text='all' OR COALESCE(f.source,'未知')=$5)
   GROUP BY e.user_key,f.source ORDER BY e.user_key LIMIT 50001`;
}
async function weeklyCoreFacts(s,{end,source='all'}={}){
 if(typeof source!=='string'||source.length>200)throw Object.assign(Error('来源无效'),{status:400})
 const w=weeklyCoreWindow(Date.parse(s.as_of),end)
 return remote.cached(JSON.stringify(['weekly-core-v1',s.snapshot_id,w.end,source]),async()=>{
  const rows=await remote.query(weeklyCoreQuery(),[s.snapshot_cutoff,w.start,w.end,w.previous_start,source])
  if(rows.length>50000||Buffer.byteLength(JSON.stringify(rows))>8*1024*1024)throw Object.assign(Error('周核心用户名单超过预算，请缩小来源范围'),{status:422})
  return weeklyCore(rows.map(r=>({...r,current_days:Number(r.current_days),previous_days:Number(r.previous_days)})),w,s,source)
 })
}
async function weeklyCorePayload(s,{end,source='all'}={}){
 const window=weeklyCoreWindow(Date.parse(s.as_of),end);
 return remote.cached(JSON.stringify(['weekly-core-payload-v1',s.snapshot_id,window.end,source]),
  async()=>{const facts=await weeklyCoreFacts(s,{end,source});return facts.payload});
}
module.exports={weeklyCoreFacts,weeklyCorePayload,weeklyCoreQuery}

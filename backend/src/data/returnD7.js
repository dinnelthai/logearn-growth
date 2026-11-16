const remote=require('./hologres');
const {ACTIVE_EVENTS,CORE_EVENTS}=require('../analytics/returnD7');
// Only return an observed reactivation day if there is a prior foreground day
// and at least seven COMPLETE intervening UTC+7 dates with no activity.
function returnD7Sql(){
 return `${remote.eventsCte()}, activity_days AS (
  SELECT e.user_key,FLOOR((e.client_ts+25200000)/86400000.0) AS day_index,
    MIN(e.client_ts) FILTER(WHERE e.event_name=ANY($5::text[])) AS first_core_ts
  FROM e WHERE e.user_key=ANY($2::text[]) AND e.client_ts<$4
    AND e.event_name=ANY($6::text[])
  GROUP BY e.user_key,FLOOR((e.client_ts+25200000)/86400000.0)
 ), sequenced AS (
  SELECT user_key,day_index,first_core_ts,
    LAG(day_index) OVER(PARTITION BY user_key ORDER BY day_index) AS previous_day
  FROM activity_days
 )
 SELECT SUBSTRING(user_key FROM 6) AS user_id,first_core_ts AS t
 FROM sequenced
 WHERE previous_day IS NOT NULL AND day_index-previous_day>=8
   AND first_core_ts>=$3 AND first_core_ts<$4
 ORDER BY user_key,first_core_ts LIMIT 150001`;
}
async function memberReturnD7(s,ids,{start,split,end}){
 const roster=new Set(ids.map(String));
 if(roster.size>5000)throw Object.assign(new Error('回流 D7 人群超出5000人上限'),{status:422});
 if(roster.size===0)return {before_ids:[],after_ids:[]};
 const rows=await remote.query(returnD7Sql(),[s.snapshot_cutoff,[...roster].map(id=>'user:'+id),start,end,CORE_EVENTS,ACTIVE_EVENTS]);
 if(rows.length>150000)throw Object.assign(new Error('回流 D7 历史数据过多'),{status:422});
 const before=new Set(),after=new Set();
 for(const r of rows){
  const id=String(r.user_id),t=Number(r.t);
  if(!roster.has(id)||!Number.isFinite(t))continue;
  (t<split?before:after).add('user:'+id);
 }
 return {before_ids:[...before],after_ids:[...after]};
}
module.exports={returnD7Sql,memberReturnD7};

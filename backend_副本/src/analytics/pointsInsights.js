const DAY=86400000,OFFSET=25200000
const dateTime=d=>Date.parse(d+'T00:00:00+07:00')
function preparePoints(data,start,end){
 const map=new Map(),get=id=>{id=String(id);if(!map.has(id))map.set(id,{points_records:0,points_period_records:0,points_earned_period:0,points_negative_period:0,checkin_days:0,checkin_days_period:0,checkin_streak_period:0});return map.get(id)}
 for(const r of data.totals){Object.assign(get(r.account_id),{points_records:Number(r.records),last_points_at:Date.parse(r.last_points_at)})}
 for(const r of data.period){const f=get(r.account_id);f.points_period_records+=Number(r.records);f.points_earned_period+=Number(r.earned);f.points_negative_period+=Number(r.negative)}
 const checkins=new Map()
 for(const r of data.checkins){const f=get(r.account_id);f.checkin_days++;f.last_checkin_at=Math.max(f.last_checkin_at||0,Date.parse(r.last_checkin_at));const t=dateTime(r.date);if(t>=Math.floor((start+OFFSET)/DAY)*DAY-OFFSET&&t<end){f.checkin_days_period++;const ds=checkins.get(String(r.account_id))||[];ds.push(t);checkins.set(String(r.account_id),ds)}}
 for(const [id,dates]of checkins){let streak=0,prev=null;for(const d of [...new Set(dates)].sort((a,b)=>a-b)){streak=prev!=null&&d-prev===DAY?streak+1:1;get(id).checkin_streak_period=Math.max(get(id).checkin_streak_period,streak);prev=d}}
 return map
}
function pointsInsights(selected,data,start,end,lists){
 const ids=new Set(selected.map(r=>String(r.account_id))),userKey=id=>'user:'+id
 const put=(key,rows)=>{lists[key]=[...new Set(rows.map(r=>r.user_key))];return lists[key].length}
 const summary={ledger_users:put('points:ledger',selected.filter(r=>r.points_records>0)),period_users:put('points:period',selected.filter(r=>r.points_period_records>0)),earned_users:put('points:earned',selected.filter(r=>r.points_earned_period>0)),negative_users:put('points:negative',selected.filter(r=>r.points_negative_period<0)),checkin_users:put('points:checkin',selected.filter(r=>r.checkin_days_period>0)),streak_users:put('points:streak',selected.filter(r=>r.checkin_streak_period>=3)),earned:selected.reduce((n,r)=>n+(r.points_earned_period||0),0),negative:selected.reduce((n,r)=>n+(r.points_negative_period||0),0)}
 const period=data.period.filter(r=>ids.has(String(r.account_id))),checks=data.checkins.filter(r=>ids.has(String(r.account_id))),types=[]
 for(const type of [...new Set(period.map(r=>r.action_type))]){const rs=period.filter(r=>r.action_type===type),key='points:type:'+types.length;lists[key]=[...new Set(rs.map(r=>userKey(r.account_id)))];types.push({type,list_key:key,users:lists[key].length,records:rs.reduce((n,r)=>n+Number(r.records),0),earned:rs.reduce((n,r)=>n+Number(r.earned),0),negative:rs.reduce((n,r)=>n+Number(r.negative),0)})}
 const days=[];for(let t=Math.floor((start+OFFSET)/DAY)*DAY-OFFSET;t<end;t+=DAY){const date=new Date(t+OFFSET).toISOString().slice(0,10),rs=period.filter(r=>r.date===date),cs=checks.filter(r=>r.date===date),key='points:day:'+date;lists[key]=[...new Set(rs.map(r=>userKey(r.account_id)))];lists[key+':checkin']=[...new Set(cs.map(r=>userKey(r.account_id)))];days.push({date,list_key:key,users:lists[key].length,checkin_users:lists[key+':checkin'].length,earned:rs.reduce((n,r)=>n+Number(r.earned),0),negative:rs.reduce((n,r)=>n+Number(r.negative),0)})}
 return {summary,types,days,quality:Object.fromEntries(Object.entries(data.quality).map(([k,v])=>[k,Number(v)])),definition:'积分流水仅反映已同步的变动，不是可用余额；负变动不确认消费。签到按UTC+7日去重，连续签到为所选期间内最长连续天数。身份未确认的流水不归入注册用户。'}
}
module.exports={preparePoints,pointsInsights}

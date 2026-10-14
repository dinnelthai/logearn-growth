const DAY=86400000,OFFSET=25200000
function parseIds(input){
 const raw=Array.isArray(input)?input:typeof input==='string'?input.split(/[\n\r,;\t]+/):[]
 if(raw.length>10000)throw Object.assign(new Error('一次最多导入5000个用户ID'),{status:400})
 const seen=new Set(),ids=[],dirty=[],invalid=[];let duplicates=0
 for(let value of raw){const id=String(value).trim().replace(/^"|"$/g,'').replace(/^user:/,'');if(!id||/^(user_?id|用户\s*id)$/i.test(id))continue
  if(id.startsWith('acc_')){dirty.push(id);continue}if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)){invalid.push(id);continue}if(seen.has(id)){duplicates++;continue}seen.add(id);ids.push(id)}
 if(ids.length>5000)throw Object.assign(new Error('一次最多导入5000个用户ID'),{status:400})
 return {ids,duplicates,dirty,invalid}
}
function activityMetrics(activity,members,facts,now){
 const until=Math.min(now,activity.cutoff_at),map=new Map(facts.map(f=>[String(f.user_id),f])),daily=new Map(),rows=[]
 const firstDay=Math.floor((activity.start_at+OFFSET)/DAY)*DAY-OFFSET
 for(let t=firstDay;t<until;t+=DAY)daily.set(new Date(t+OFFSET).toISOString().slice(0,10),0)
 for(const member of members){const f=map.get(String(member.user_id))||{},first=f.first_analysis_at==null?(member.baseline_first_at==null?null:Number(member.baseline_first_at)):Number(f.first_analysis_at),last=f.last_active_at==null?null:Number(f.last_active_at),prior=member.baseline_first_at!=null,review=!prior&&first!=null&&first<activity.start_at
  const completed=!prior&&!review&&first!=null&&first>=activity.start_at&&first<until
  const status=prior?'prior':review?'review':completed?'completed':last!=null?'active':'inactive'
  if(completed){const date=new Date(first+OFFSET).toISOString().slice(0,10);daily.set(date,(daily.get(date)||0)+1)}
  rows.push({user_id:String(member.user_id),status,last_active_at:last,first_analysis_at:first,analysis_days:Number(f.analysis_days||0),event_count:Number(f.event_count||0)})
 }
 const eligible=members.filter(m=>m.baseline_first_at==null).length,completed=rows.filter(r=>r.status==='completed').length
 let total=0;return {activity,summary:{total:rows.length,eligible,completed,conversion_rate:eligible?completed/eligible:null,prior:rows.filter(r=>r.status==='prior').length,active:rows.filter(r=>r.status==='active').length,inactive:rows.filter(r=>r.status==='inactive').length,review:rows.filter(r=>r.status==='review').length},daily:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({date,new_users:count,cumulative:total+=count})),rows:rows.sort((a,b)=>String(a.user_id).localeCompare(String(b.user_id))),period_end:until}
}
module.exports={parseIds,activityMetrics}

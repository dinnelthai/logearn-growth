const {firstEvent,midnight,toDateStr,DAY}=require('./retention')
const fail=message=>{throw Object.assign(Error(message),{status:400})}
function validateRetention(body={}){
 const periods=Number(body.maxDailyPeriods??7)
 if(![7,14,30].includes(periods))fail('观察长度仅支持7、14或30天')
 return periods
}
const dayNumber=t=>Math.floor((t+25200000)/DAY)
const monday=t=>{const d=midnight(t),weekday=new Date(d+25200000).getUTCDay();return d-((weekday+6)%7)*DAY}
const has=(mask,p)=>Math.floor(mask/2**p)%2===1
function retained(mask,p,continuous){if(!continuous)return has(mask,p);for(let i=1;i<=p;i++)if(!has(mask,i))return false;return true}
function computeRetentionCurves(users,{start,end,asOf,initial='chip',returning='chip',source='all',maxDailyPeriods=7,historyComplete=false}){
 const horizon=validateRetention({maxDailyPeriods}),merged=new Map()
 for(const u of users){if(!u?.id)continue;const old=merged.get(u.id);if(!old)merged.set(u.id,{...u,events:[...(u.events||[])]});else{old.events.push(...(u.events||[]));const f=firstEvent(u,initial,asOf),previous=firstEvent(old,initial,asOf);if(f&&(!previous||f.t<previous.t)&&initial==='chip')old.first_analysis_at=f.t}}
 const store=[],groups=new Map(),add=(id,label,from,to,row)=>{let g=groups.get(id);if(!g){g={id,label,enrollment_start:Math.max(from,start),enrollment_end:Math.min(to,end),indices:[]};groups.set(id,g)}g.indices.push(row)}
 for(const u of merged.values()){
  const first=firstEvent(u,initial,asOf)
  if(!first||first.t<start||first.t>=end||source!=='all'&&first.entry_source!==source&&u.source!==source)continue
  const d0=midnight(first.t),d0num=dayNumber(d0);let mask=0;const days=new Set()
  for(const e of u.events||[]){if(e.type!==returning||!Number.isFinite(e.t)||e.t>asOf||e.t<=first.t)continue;const offset=dayNumber(e.t)-d0num;if(offset>=1&&offset<=horizon)days.add(offset)}
  for(const p of days)mask+=2**p
  const index=store.length;store.push([u.id,d0,mask,u.source||first.entry_source||'未知']);const week=monday(d0)
  add('daily:'+toDateStr(d0),toDateStr(d0),d0,d0+DAY,index)
  add('week:'+toDateStr(week),'周 '+toDateStr(week),week,week+7*DAY,index)
  add('all:selected','所选期间总批次',start,end,index)
 }
 const definitions={},curve_groups={daily:[],week:[],all:[]},daily=[]
 for(const g of groups.values()){
  const rows=g.indices.map(i=>store[i]),size=rows.length,enrollmentComplete=g.enrollment_end<=midnight(asOf),points=[]
  definitions[g.id]={indices:g.indices,enrollment_complete:enrollmentComplete}
  for(let p=0;p<=horizon;p++){
   let eligible=0,returned=0,continuous=0,inProgress=0
   for(const [,d0,mask]of rows){if(d0+(p+1)*DAY<=asOf){eligible++;if(p===0||retained(mask,p,false))returned++;if(p===0||retained(mask,p,true))continuous++}else if(d0+p*DAY<=asOf)inProgress++}
   const complete=enrollmentComplete&&eligible===size
   points.push({period:p,complete,eligible_users:eligible,pending_users:size-eligible,in_progress_users:inProgress,retained_users:complete?returned:null,retention_rate:complete?returned/size:null,continuous_retained_users:complete?continuous:null,continuous_retention_rate:complete?continuous/size:null,observed_returned_users:returned,observed_continuous_users:continuous,list_prefix:'retention:'+g.id+':D'+p})
  }
  const group={id:g.id,label:g.label,cohort_size:size,enrollment_start:g.enrollment_start,enrollment_end:g.enrollment_end,enrollment_complete:enrollmentComplete,partial_calendar_group:g.id.startsWith('week:')&&(g.enrollment_start!==monday(g.enrollment_start)||g.enrollment_end!==monday(g.enrollment_start)+7*DAY),list_key:'retention:'+g.id+':cohort',periods:points}
  curve_groups[g.id.split(':')[0]].push(group)
  if(g.id.startsWith('daily:'))daily.push({cohort_date:g.label,cohort_start:rows[0][1],cohort_size:size,enrollment_complete:enrollmentComplete,periods:points.slice(1)})
 }
 for(const rows of Object.values(curve_groups))rows.sort((a,b)=>a.enrollment_start-b.enrollment_start)
 daily.sort((a,b)=>a.cohort_start-b.cohort_start)
 return {lists:{},retention_store:{users:store,groups:definitions,as_of:asOf,max_periods:horizon},payload:{daily,curve_groups,max_periods:horizon,candidate_count:store.length,truncated:false,as_of:asOf,history_complete:historyComplete,coverage_note:'首次为已观测首次；日期成熟不代表采集完整。当前曲线为已观测留存，不推断无记录即未使用。'}}
}
function resolveRetentionList(value,key){
 const s=value.retention_store;if(!s||typeof key!=='string')return null
 const legacyC=/^cohort:(\d{4}-\d{2}-\d{2})$/.exec(key),legacyR=/^retained:(\d{4}-\d{2}-\d{2}):([DC])(\d+)$/.exec(key);if(legacyC)key='retention:daily:'+legacyC[1]+':cohort';if(legacyR)key='retention:daily:'+legacyR[1]+':'+legacyR[2]+legacyR[3]+':returned'
 const match=/^retention:((?:daily|week):\d{4}-\d{2}-\d{2}|all:selected):(cohort|([DC])(\d+):(returned|unobserved|pending))$/.exec(key)
 if(!match)return null
 const group=s.groups[match[1]];if(!group)return null
 if(match[2]==='cohort')return group.indices.map(i=>s.users[i][0])
 const p=Number(match[4]);if(p<0||p>s.max_periods)return null
 return group.indices.map(i=>s.users[i]).filter(([,d0,mask])=>{const complete=d0+(p+1)*DAY<=s.as_of,back=p===0||retained(mask,p,match[3]==='C');return match[5]==='pending'?!complete:match[5]==='returned'?complete&&back:complete&&!back}).map(r=>r[0])
}
function resolveCachedList(value,key){return Array.isArray(value.lists?.[key])?value.lists[key]:resolveRetentionList(value,key)}
module.exports={computeRetentionCurves,resolveRetentionList,resolveCachedList,validateRetention,monday}

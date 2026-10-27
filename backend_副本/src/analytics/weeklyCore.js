const DAY=86400000,OFFSET=25200000
function weeklyCoreWindow(asOf,requestedEnd){
 if(!Number.isSafeInteger(asOf)||asOf<0||requestedEnd!=null&&(!Number.isSafeInteger(requestedEnd)||requestedEnd<0))throw Object.assign(Error('周核心指标需要有效截止时间'),{status:400})
 const end=Math.floor((Math.min(requestedEnd??asOf+1,asOf+1)+OFFSET)/DAY)*DAY-OFFSET
 if(end<7*DAY)throw Object.assign(Error('截止时间不足7个完整业务日'),{status:400})
 return {start:end-7*DAY,end,previous_start:end-14*DAY,previous_end:end-7*DAY,timezone:'Asia/Bangkok'}
}
function weeklyCore(rows,window,s,source='all'){
 const lists={},members={},put=(key,rs)=>{lists[key]=rs.map(r=>r.user_key);return lists[key].length}
 const core=rows.filter(r=>r.current_days>=4),previous=rows.filter(r=>r.previous_days>=4),near=rows.filter(r=>r.current_days>=2&&r.current_days<4)
 for(const r of rows)members[r.user_key]={id:r.user_key,source:r.source||'未知',analysis_days:r.current_days,previous_analysis_days:r.previous_days}
 const current=put('core',core),old=put('previous',previous),retained=put('retained',core.filter(r=>r.previous_days>=4)),entered=put('entered',core.filter(r=>r.previous_days<4)),lost=put('lost',previous.filter(r=>r.current_days<4))
 return {lists,members,payload:{available:true,...window,previous_end:window.start,source,users:current,previous_users:old,retained,entered,lost,near_users:put('near',near),delta:current-old,weekly_users:rows.filter(r=>r.current_days>0).length,
  threshold_days:4,window_days:7,goal:{users:200,due_date:'2026-11-30',progress:source==='all'?current/200:null},
  distribution:Array.from({length:7},(_,i)=>({days:i+1,users:rows.filter(r=>r.current_days===i+1).length})),
  snapshot_id:s.snapshot_id,as_of:s.as_of,history_complete:s.history_complete===true,events_complete_through:s.events_complete_through||null,
  definition:'近7个完整UTC+7自然日，至少4天观测到筹码查看或下钻的去重用户；同日多次只计1天。与前7天比较，进入核心不等于新注册。历史与连续采集覆盖未确认；未核实排除员工/测试，不证明用户理解、习惯或付费。'}}
}
module.exports={weeklyCoreWindow,weeklyCore}

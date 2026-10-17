const {requestDiagnostics,percentile}=require('./requestDiagnostics')
const name=e=>e.raw_name||e.type,uniq=xs=>[...new Set(xs)]
function validateConversion(b){
 if(!Number.isFinite(b.start)||!Number.isFinite(b.end)||b.start>=b.end||b.end-b.start>31*86400000||b.hours!=null&&![1,24,72].includes(Number(b.hours)))throw Object.assign(new Error('转化场景支持最长31天与1/24/72小时窗口'),{status:400})
 for(const key of ['method','status','inviter','link','campaign'])if(b[key]!=null&&(typeof b[key]!=='string'||b[key].length>128))throw Object.assign(new Error('转化筛选条件无效'),{status:400})
}
function loginConversion(input,b,s){
 const start=b.start,end=b.end,asOf=Date.parse(s.snapshot_cutoff||s.as_of),members={},lists={},userEvents=[]
 const users=input.map(u=>{if(!b.method||b.method==='all')return u;const allowed=new Set(u.events.filter(e=>name(e)==='login_attempt_started'&&e.properties.login_method===b.method).map(e=>e.properties.login_attempt_id));return {...u,events:u.events.filter(e=>!['login_attempt_started','login_attempt_finished','login_stage_started','login_stage_finished'].includes(name(e))||allowed.has(e.properties.login_attempt_id)||e.properties.login_method===b.method)}})

 const d=requestDiagnostics(users,{start,end,asOf}),login=d.payload.families.login
 Object.assign(lists,d.lists)
 for(const u of input){lists['conversion:user:'+u.id]=[u.id];members[u.id]={id:u.id,source:u.source};for(const e of u.events)if(e.t>=start&&e.t<end&&e.t<=asOf)userEvents.push({u,e})}
 const breakdown=['manual','auto_restore','unknown'].map(type=>{const es=userEvents.filter(({e})=>name(e)==='login_succeeded'&&e.actor_user_id&&(e.properties.login_type===type||type==='unknown'&&!['manual','auto_restore'].includes(e.properties.login_type))),key='login:evidence:'+type;lists[key]=uniq(es.map(x=>x.u.id));return {type,events:es.length,users:lists[key].length,list_key:key}})
 lists['login:clicks']=uniq(userEvents.filter(({e})=>name(e)==='login_button_clicked').map(x=>x.u.id))
 const stages=new Map(),quality={missing_stage_id:0,orphan_stage_finishes:0,conflicting_stage_attempts:0};let stageObserved=false
 for(const u of users){const attempts=new Map(u.events.filter(e=>name(e)==='login_attempt_started').map(e=>[e.properties.login_attempt_id,e])),groups=new Map()
  for(const e of u.events){if(!['login_stage_started','login_stage_finished'].includes(name(e))||e.t>asOf)continue;stageObserved=true;const p=e.properties;if(!p.stage_attempt_id||!p.login_attempt_id||!p.stage){if(e.t>=start&&e.t<end)quality.missing_stage_id++;continue}const key=JSON.stringify([p.login_attempt_id,p.stage_attempt_id]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e)}
  for(const es of groups.values()){es.sort((a,b)=>a.t-b.t);const first=es.find(e=>name(e)==='login_stage_started'),finish=es.find(e=>name(e)==='login_stage_finished'),p=first?.properties||finish?.properties,parent=attempts.get(p.login_attempt_id)
   if(!parent||parent.t<start||parent.t>=end||first&&first.t<parent.t){if(finish&&finish.t>=start&&finish.t<end)quality.orphan_stage_finishes++;continue}
   if(!first){quality.orphan_stage_finishes++;continue}
   const key=JSON.stringify([parent.properties.login_method||'unknown',p.stage]);if(!stages.has(key))stages.set(key,{method:parent.properties.login_method||'unknown',stage:p.stage,started:[],success:[],failed:[],cancelled:[],pending:[],unknown:[],conflict:[],durations:[]});const r=stages.get(key)
   r.started.push(u.id)
   const conflicts=es.some(e=>e.properties.stage!==p.stage)||new Set(es.filter(e=>name(e)==='login_stage_finished').map(e=>JSON.stringify([e.properties.outcome,e.properties.duration_ms,e.properties.reason_code]))).size>1||finish&&finish.t<first.t
   const state=conflicts?'conflict':finish?['success','failed','cancelled'].includes(finish.properties.outcome)?finish.properties.outcome:'unknown':asOf-first.t<1800000?'pending':'unknown'
   r[state].push(u.id);if(conflicts)quality.conflicting_stage_attempts++
   if(finish&&state==='success'&&finish.properties.duration_ms!=null&&Number.isFinite(Number(finish.properties.duration_ms))&&Number(finish.properties.duration_ms)>=0)r.durations.push(Number(finish.properties.duration_ms))
  }
 }
 const stageRows=[...stages.values()].map((r,i)=>{const key='login:stage:'+i;for(const status of ['started','success','failed','cancelled','pending','unknown','conflict'])lists[key+':'+status]=uniq(r[status]);return {method:r.method,stage:r.stage,started:r.started.length,success:r.success.length,failed:r.failed.length,cancelled:r.cancelled.length,pending:r.pending.length,unknown:r.unknown.length,conflict:r.conflict.length,success_rate:r.success.length+r.failed.length?r.success.length/(r.success.length+r.failed.length):null,median_ms:percentile(r.durations,.5),p90_ms:percentile(r.durations,.9),list_key:key}})
 const records=d.login_rows.filter(r=>r.started_at>=start&&r.started_at<end&&(!b.status||b.status==='all'||r.state===b.status)).sort((a,b)=>b.started_at-a.started_at)
 return {members,lists,payload:{scene:'login',start,end,as_of:asOf,login,login_breakdown:breakdown,click_users:lists['login:clicks'].length,stages:{available:stageObserved,rows:stageRows,quality},records:records.slice(0,100),record_total:records.length,records_limited:records.length>100,filters:{method:b.method||'all',status:b.status||'all'},unit:'attempts',history_complete:false}}
}
module.exports={loginConversion,validateConversion}

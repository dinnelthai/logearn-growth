const remote=require('./hologres'),{memberFacts}=require('./memberMetrics'),{compareFacts}=require('../analytics/operationsComparison')
const DAY=86400000
function ageConfiguration(specs,days){
 if(![1,7,14].includes(days))throw Object.assign(new Error('同龄窗口仅支持1、7、14天'),{status:400})
 return specs.map(s=>({...s,desired_end:s.start+days*DAY,end:Math.min(s.end,s.start+days*DAY),age_days:days}))
}
async function runComparison(configuration,snapshot){
 const {specs,mode,period}=configuration,s=snapshot||await remote.status(),asof=Date.parse(s.as_of||s.snapshot_cutoff),observedUntil=Math.min(Date.now()+1,asof+1)
 if(!Number.isFinite(observedUntil))throw Object.assign(new Error('数据截至时间无效'),{status:503})
 let p=mode==='age'?{start:Math.min(...specs.map(s=>s.start)),end:Math.max(...specs.map(s=>s.end))}:period
 if(p.end-p.start>366*DAY)throw Object.assign(new Error('对象窗口跨度超过366天，请选择时间接近的活动'),{status:422})
 const scoped=specs.map(spec=>mode==='age'?{...spec,end:Math.min(spec.end,observedUntil),mature:observedUntil>=spec.desired_end&&spec.end>=spec.desired_end,window_limited:spec.end<spec.desired_end}:spec)
 p={...p,end:Math.min(p.end,observedUntil)}
 const ids=[...new Set(scoped.flatMap(spec=>spec.members.map(m=>String(m.id))))]
 if(scoped.reduce((n,s)=>n+s.members.length,0)>50000)throw Object.assign(new Error('对比成员关系超过50000条，请缩小范围'),{status:422})
 const facts=p.end>p.start?await memberFacts(s,ids,p):null
 const result=facts?compareFacts(scoped,facts,p,s):{rows:scoped.map(({members,...spec})=>({...spec,total:null,no_window:true,requested_users:members.length})),union:null,errors:{},unique_requested_users:ids.length,overlap_memberships:null}
 return {...result,kind:configuration.kind,scope:configuration.scope,mode,age_days:configuration.age_days??null,...p,snapshot_id:s.snapshot_id,as_of:s.as_of||s.snapshot_cutoff,coverage:'partial',analysis_definition:'observed_events',membership_as_of:configuration.membership_as_of,observed_until:observedUntil}
}
module.exports={ageConfiguration,runComparison}

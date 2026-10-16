const {ownAccounts,invitedAccounts}=require('../analytics/kolAccounts')
const remote=require('./hologres'),{relationships}=require('./kolMetrics'),{memberFacts,memberMetrics}=require('./memberMetrics')
async function rankingMetrics(profiles,period,scope,s){
 if(profiles.length>1000)throw Object.assign(new Error('指标排序最多1000个匹配KOL，请用阶段或负责人缩小范围'),{status:422})
 let relation=null;try{if(scope==='invited'&&profiles.some(p=>ownAccounts(p).length))relation=await relationships(s)}catch(e){return {metrics:profiles.map(p=>({id:p.id,total:null,reason:ownAccounts(p).length?'邀请关系暂不可用':'尚未关联 LogEarn 账号'})),errors:{referral:e.message}}}
 const specs=profiles.map(p=>({id:p.id,members:scope==='own'?ownAccounts(p).map(id=>({id})):scope==='invited'?invitedAccounts(p,relation,period.end):[...new Set([...(p.user_ids||[]),...ownAccounts(p)])].map(id=>({id})),reason:scope!=='tagged'&&!ownAccounts(p).length?'尚未关联 LogEarn 账号':null}))
 if(specs.reduce((n,s)=>n+s.members.length,0)>50000)throw Object.assign(new Error('KOL成员关系超过50000条，请缩小筛选范围'),{status:422})
 const facts=await memberFacts(s,[...new Set(specs.flatMap(p=>p.members.map(m=>String(m.id))))],period)
 const events=new Map(),trades=new Map();for(const e of facts.events){const id=String(e.user_id);if(!events.has(id))events.set(id,[]);events.get(id).push(e)}for(const t of facts.trades){const id=String(t.account_id);if(!trades.has(id))trades.set(id,[]);trades.get(id).push(t)}
 let work=0;const metrics=specs.map(spec=>{
  if(spec.reason)return {id:spec.id,total:null,reason:spec.reason}
  const ids=[...new Set(spec.members.map(m=>String(m.id)))],es=ids.flatMap(id=>events.get(id)||[]),ts=ids.flatMap(id=>trades.get(id)||[])
  work+=es.length+ts.length;if(work>2000000)throw Object.assign(new Error('重叠名单计算超过预算，请缩小KOL范围'),{status:422})
  const result=memberMetrics({...facts,events:es,trades:ts},spec.members,period,s),t=result?.total
  return {id:spec.id,total:t?{...t,analysis_rate:t.users&&t.analysis_users!=null?t.analysis_users/t.users:null}:null,requested_users:result?.requested_users??ids.length,unmatched_users:result?.unmatched_users??null,reason:result?null:'账号校验暂不可用'}
 })
 return {metrics,errors:facts.errors}
}
function orderRanking(rows,sort,direction){
 const value=r=>sort==='name'?r.name:['updated_at','next_followup_at'].includes(sort)?r[sort]:r.metric?.total?.[sort]
 return [...rows].sort((a,b)=>{const x=value(a),y=value(b);if(x==null||y==null)return x==null?(y==null?a.id.localeCompare(b.id):1):-1
  const delta=typeof x==='string'?x.localeCompare(y):x-y;return (direction==='asc'?delta:-delta)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)})
}
module.exports={rankingMetrics,orderRanking}

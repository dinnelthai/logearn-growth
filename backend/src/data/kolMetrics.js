const {ownAccounts,invitedAccounts}=require('../analytics/kolAccounts')
const remote=require('./hologres')
const {computeReferralInsights}=require('../analytics/referralInsights')
const {validatePeriod}=require('../analytics/kolMetrics')
const {memberFacts,memberMetrics,tradeSql,budget}=require('./memberMetrics')
async function relationships(s) {
  return remote.cached('crm:relationships:'+s.snapshot_id,async()=>{
    const [accounts,relations]=await Promise.all([
      remote.query('SELECT account_id::text AS account_id,created_at FROM public.account_v2 WHERE created_at<=$1::timestamptz LIMIT 80001',[s.snapshot_cutoff]),
      remote.query(`SELECT id::text,user_id::text,level1_user_id::text,is_valid,invitation_time,
        (EXTRACT(EPOCH FROM invitation_time)*1000000)::bigint::text AS invitation_order
        FROM public.user_invitation_relation WHERE created_time<=$1::timestamptz AND (invitation_time<=$1::timestamptz OR invitation_time IS NULL) LIMIT 80001`,[s.snapshot_cutoff])
    ])
    budget(accounts,80000,'账号');budget(relations,80000,'推荐关系')
    // Reuse recommendation's earliest binding, conflicting inviter and cycle rules.
    const result=computeReferralInsights(accounts.map(r=>({...r,created_at:Date.parse(r.created_at),trade_count:0})),relations.map(r=>({...r,invitation_at:r.invitation_time==null?null:Date.parse(r.invitation_time),invitation_order:r.invitation_order==null?null:Number(r.invitation_order),after_trade_count:0})),{start:0,end:Date.parse(s.snapshot_cutoff)+1,asOf:Date.parse(s.as_of),factsAsOf:Date.parse(s.snapshot_cutoff)})
    const children={}
    for(const [key,ids] of Object.entries(result.lists))if(key.startsWith('children:'))children[key.slice(9)]=ids.map(id=>({id:id.slice(5),bound_at:result.members[id].bound_at,bound_order:result.members[id].bound_order}))
    return {accounts:accounts.map(r=>r.account_id),children,quality:result.payload.quality}
  },30000)
}
async function kolMetrics(profiles,period,{includeDetails=true}={}) {
  if(!profiles.some(p=>ownAccounts(p).length||p.user_ids?.length))return {metrics:profiles.map(p=>({id:p.id,available:false,own_available:false,reason:'尚未关联 LogEarn 账号',own:null,invited:null,tagged:null,tagged_excluding_own:null}))}
  const s=await remote.status(),linked=profiles.filter(p=>ownAccounts(p).length)
  const relationResult=linked.length?await Promise.allSettled([relationships(s)]):[]
  const relation=relationResult[0]?.status==='fulfilled'?relationResult[0].value:null
  const taggedIds=p=>[...new Set([...(p.user_ids||[]),...ownAccounts(p)].map(String))]
  const invitedMembers=p=>invitedAccounts(p,relation,period.end)
  const targets=profiles.flatMap(p=>[...taggedIds(p),...invitedMembers(p).map(m=>m.id)])
  const facts=await memberFacts(s,targets,period),aggregate=members=>{const result=memberMetrics(facts,members,period,s);if(!includeDetails&&result){delete result.rows;delete result.daily}return result}
  const errors={...facts.errors,referral:relationResult[0]?.status==='rejected'?relationResult[0].reason.message:null}
  return {start:period.start,end:period.end,as_of:s.snapshot_cutoff,snapshot_id:s.snapshot_id,coverage:'partial',analysis_definition:'observed_events',errors,metrics:profiles.map(p=>{
    const accounts=ownAccounts(p),ownAvailable=accounts.some(id=>facts.known?.has(id))
    const members=invitedMembers(p),tags=taggedIds(p).map(id=>({id}))
    const tagged=aggregate(tags)
    return {id:p.id,available:ownAvailable||!!tagged?.total.users,own_available:ownAvailable,
      account_ids:accounts,reason:!accounts.length?'尚未关联 LogEarn 账号':facts.known===null?'账号校验暂不可用':!ownAvailable?'关联账号不在当前快照中':null,
      own:ownAvailable?aggregate(accounts.map(id=>({id}))):null,
      invited:ownAvailable&&relation?{...aggregate(members),new_bindings:members.filter(m=>m.bound_at>=period.start).length}:null,
      tagged,tagged_excluding_own:aggregate(tags.filter(m=>!accounts.includes(m.id)))}
  })}
}
module.exports={kolMetrics,validatePeriod,tradeSql,relationships}

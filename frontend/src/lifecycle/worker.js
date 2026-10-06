import { evaluateLifecycle } from './rules.js'
/** Server adapter: reserve must atomically enforce per-user caps and idempotency. Never run provider credentials in browser. */
export async function runLifecycleBatch({loadState,reserve,send,record,now=Date.now}) {
 const initial=await loadState(),candidates=evaluateLifecycle(initial.users,{...initial,asOf:now()}).filter(c=>c.eligible),results=[]
 for(const candidate of candidates) {
  // Refetch immediately before each send: targets/preferences/history may have changed.
  const fresh=await loadState(),asOf=now(),current=evaluateLifecycle(fresh.users,{...fresh,asOf}).find(c=>c.u.id===candidate.u.id&&c.rule_id===candidate.rule_id&&c.eligible)
  if(!current)continue
  const idempotency_key=[current.u.id,current.rule_id,Math.floor(asOf/86400000)].join(':')
  const reservation=await reserve({user_id:current.u.id,rule_id:current.rule_id,channel:current.channel,idempotency_key,asOf})
  if(!reservation)continue
  let response
  try { response=await send({...current,reservation,idempotency_key}) }
  catch(error){await record({...reservation,user_id:current.u.id,rule_id:current.rule_id,channel:current.channel,sent_at:now(),status:'unknown',error:String(error.message)});results.push({user_id:current.u.id,status:'unknown'});continue}
  // Provider acknowledgment must not be relabeled failed if persistence fails.
  await record({...reservation,user_id:current.u.id,rule_id:current.rule_id,channel:current.channel,preferred_language:current.u.preferred_language??null,sent_at:now(),status:'sent',provider_id:response?.id,strategy_run_id:current.strategy_run_id,result_id:current.result_id});results.push({user_id:current.u.id,status:'sent'})
 }
 return results
}

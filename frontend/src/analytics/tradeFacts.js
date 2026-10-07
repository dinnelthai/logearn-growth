/** Validated confirmed trade facts. All exclusion counts are mutually exclusive.
 * Conflicting rows for one global trade ID are quarantined instead of choosing
 * an arbitrary last amount/owner. Quality covers the whole loaded snapshot.
 */
export function validateTradeFacts(input, asOf) {
  if (!Array.isArray(input)) return {trades:null,quality:null}
  const quality={input:input.length,accepted:0,missingId:0,missingUser:0,invalidTime:0,invalidAmount:0,notConfirmed:0,future:0,duplicates:0,conflictingRows:0,conflictingIds:0,excluded:0}
  const groups=new Map()
  const id=value=>typeof value==='string'&&value.trim().length>0
  for(const row of input){
    if(!row||!id(row.trade_id)){quality.missingId++;continue}
    if(!id(row.user_id)){quality.missingUser++;continue}
    const time=typeof row.confirmed_at==='string'?Date.parse(row.confirmed_at):NaN
    if(!Number.isFinite(time)){quality.invalidTime++;continue}
    if(typeof row.volume_usd!=='number'||!Number.isFinite(row.volume_usd)||row.volume_usd<0){quality.invalidAmount++;continue}
    if(row.status!=='confirmed'){quality.notConfirmed++;continue}
    if(time>asOf){quality.future++;continue}
    const normalized={trade_id:row.trade_id,user_id:row.user_id,confirmed_at:time,volume_usd:row.volume_usd,status:row.status,trade_attempt_id:id(row.trade_attempt_id)?row.trade_attempt_id:null,chain:row.chain??null}
    if(!groups.has(row.trade_id))groups.set(row.trade_id,[])
    groups.get(row.trade_id).push(normalized)
  }
  const trades=[]
  for(const group of groups.values()){
    const fingerprints=new Set(group.map(row=>JSON.stringify(row)))
    if(fingerprints.size>1){quality.conflictingRows+=group.length;quality.conflictingIds++;continue}
    trades.push(group[0]);quality.duplicates+=group.length-1
  }
  quality.accepted=trades.length;quality.excluded=quality.input-quality.accepted
  return {trades,quality}
}

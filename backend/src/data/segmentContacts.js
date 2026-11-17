async function segmentContacts(query, rows, cutoff) {
  const ids = rows.map(r => /^user:(\d+)$/.exec(r.id)?.[1]).filter(Boolean)
  const identities = ids.length ? await query(`SELECT account_id::text AS account_id, provider, subject
    FROM public.account_identity_v2 WHERE account_id::text = ANY($1::text[])
      AND verified = true AND provider IN ('telegram','email') AND created_at <= $2::timestamptz
      AND NULLIF(BTRIM(subject),'') IS NOT NULL ORDER BY account_id, provider, subject`, [ids, cutoff]) : []
  const contacts = new Map(ids.map(id => [id, {telegram: [], email: []}]))
  for (const identity of identities) {
    const target = contacts.get(identity.account_id)?.[identity.provider]
    if (target && !target.includes(identity.subject)) target.push(identity.subject)
  }
  return rows.map(row => ({...row, contacts: contacts.get(row.id.slice(5)) || {telegram: [], email: []}}))
}
function filterContactIds(value, ids, filter = 'all') {
  if (!['all','telegram','email','both','either','neither'].includes(filter)) throw Object.assign(new Error('无效的联系方式筛选'),{status:400})
  if (filter === 'all') return ids
  const {expandDetails} = require('../analytics/compactDetails')
  return ids.filter(id => {
    const row = expandDetails(value,id), tg = !!row.telegram_bound, email = !!row.email_bound
    return filter === 'telegram' ? tg : filter === 'email' ? email : filter === 'both' ? tg && email : filter === 'either' ? tg || email : !tg && !email
  })
}
function filterCreditsIds(value, ids, filter) {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) throw Object.assign(new Error('无效的 Credits 余额筛选'),{status:400})
  const {min,max,unknown}=filter
  if ((min != null && (typeof min !== 'number' || !Number.isFinite(min) || min < 0)) || (max != null && (typeof max !== 'number' || !Number.isFinite(max) || max < 0)) || (min != null && max != null && min > max) || (unknown && (min != null || max != null))) throw Object.assign(new Error('无效的 Credits 余额范围'),{status:400})
  const {expandDetails}=require('../analytics/compactDetails')
  return ids.filter(id=>{const amount=expandDetails(value,id).credits_available; if(unknown)return amount==null; return amount!=null && Number.isFinite(Number(amount)) && (min==null||Number(amount)>=min) && (max==null||Number(amount)<=max)})
}
function filterValueSignalIds(value,ids,signal){
 const conditions={trade:r=>Number(r.trade_count)>0,nft:r=>r.nft_count>0,balance:r=>r.has_balance===true,vip:r=>r.vip_active===true,credits:r=>r.credits_available>0}
 if(!Object.hasOwn(conditions,signal))throw Object.assign(new Error('无效的价值线索筛选'),{status:400})
 const {expandDetails}=require('../analytics/compactDetails')
 return ids.filter(id=>conditions[signal](expandDetails(value,id)))
}
module.exports = {segmentContacts,filterContactIds,filterCreditsIds,filterValueSignalIds}

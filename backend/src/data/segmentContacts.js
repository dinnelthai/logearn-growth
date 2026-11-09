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
module.exports = {segmentContacts,filterContactIds}

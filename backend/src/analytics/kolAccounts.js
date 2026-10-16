function ownAccounts(profile){return [...new Set((Array.isArray(profile.account_ids)?profile.account_ids:profile.account_id?[profile.account_id]:[]).map(String))]}
function attachAccounts(db,rows){
 if(!rows.length)return []
 const members=db.prepare('SELECT kol_id,account_id FROM crm_kol_accounts WHERE kol_id IN(SELECT value FROM json_each(?)) ORDER BY position,account_id').all(JSON.stringify(rows.map(r=>r.id))),byKol=new Map()
 for(const r of members){if(!byKol.has(r.kol_id))byKol.set(r.kol_id,[]);byKol.get(r.kol_id).push(r.account_id)}
 return rows.map(r=>({...r,account_ids:[...new Set([...(r.account_id?[r.account_id]:[]),...(byKol.get(r.id)||[])])]}))
}
function invitedAccounts(profile,relation,end=Infinity){
 const own=new Set(ownAccounts(profile)),members=new Map()
 for(const id of own)for(const m of relation?.children[id]||[]){if(own.has(String(m.id))||m.bound_at>=end)continue;const key=String(m.id),old=members.get(key),order=m.bound_order??m.bound_at*1000;if(!old||order<(old.bound_order??old.bound_at*1000))members.set(key,{...m,id:key})}
 return [...members.values()]
}
module.exports={ownAccounts,attachAccounts,invitedAccounts}
